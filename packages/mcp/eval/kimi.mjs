const DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';

function finiteNonNegative(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/**
 * Convert Kimi/OpenAI Chat Completions usage into the evaluator's shared shape.
 * Cached tokens are included in prompt_tokens, so subtract them from uncached
 * input before applying the cheaper cache-hit price.
 */
export function normalizeKimiUsage(raw) {
  const prompt = finiteNonNegative(raw?.prompt_tokens);
  const output = finiteNonNegative(raw?.completion_tokens);
  if (prompt == null || output == null) return null;
  const cached = Math.min(
    prompt,
    finiteNonNegative(raw?.cached_tokens
      ?? raw?.prompt_tokens_details?.cached_tokens, 0),
  );
  return {
    input_tokens: prompt - cached,
    output_tokens: output,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cached,
    total_tokens: prompt + output,
  };
}

export function aggregateKimiUsage(parts) {
  if (!Array.isArray(parts) || parts.length === 0 || parts.some((part) => part == null)) {
    return null;
  }
  const keys = [
    'input_tokens',
    'output_tokens',
    'cache_creation_input_tokens',
    'cache_read_input_tokens',
    'total_tokens',
  ];
  return Object.fromEntries(keys.map((key) => [
    key,
    parts.reduce((sum, part) => sum + part[key], 0),
  ]));
}

function jsonPointer(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported non-local JSON Schema reference: ${ref}`);
  return ref.slice(2).split('/').reduce((value, rawPart) => {
    const part = rawPart.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value == null || !Object.hasOwn(value, part)) {
      throw new Error(`unresolved JSON Schema reference: ${ref}`);
    }
    return value[part];
  }, root);
}

/**
 * Moonshot accepts reusable references under #/$defs only. MCP's Zod-generated
 * schemas occasionally point one property at another (for example
 * #/properties/rewardsAddress). Inline those local property references while
 * preserving the referenced validation constraints and the caller's description.
 */
export function normalizeKimiToolSchema(schema) {
  const root = structuredClone(schema);

  function visit(value, resolving = new Set()) {
    if (Array.isArray(value)) return value.map((item) => visit(item, resolving));
    if (value == null || typeof value !== 'object') return value;

    if (typeof value.$ref === 'string' && !value.$ref.startsWith('#/$defs/')) {
      if (resolving.has(value.$ref)) {
        throw new Error(`cyclic JSON Schema reference: ${value.$ref}`);
      }
      const nextResolving = new Set(resolving).add(value.$ref);
      const target = visit(structuredClone(jsonPointer(root, value.$ref)), nextResolving);
      const siblings = Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== '$ref')
          .map(([key, item]) => [key, visit(item, resolving)]),
      );
      return { ...target, ...siblings };
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item, resolving)]),
    );
  }

  return visit(root);
}

async function postCompletion({
  fetchImpl,
  apiKey,
  baseUrl,
  body,
  timeoutMs,
  sleepImpl,
  retryDelaysMs,
}) {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Kimi API returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
      }
      if (response.ok) return data;

      const detail = data?.error?.message ?? text.slice(0, 300);
      if (response.status === 429 && attempt < retryDelaysMs.length) {
        const headerSeconds = Number(response.headers?.get?.('retry-after'));
        const delayMs = Number.isFinite(headerSeconds) && headerSeconds >= 0
          ? Math.min(60_000, headerSeconds * 1000)
          : retryDelaysMs[attempt];
        await sleepImpl(delayMs);
        continue;
      }
      throw new Error(`Kimi API HTTP ${response.status}: ${detail}`);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Kimi API timed out after ${timeoutMs}ms`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Execute the official OpenAI-compatible Chat Completions tool loop.
 * executeTool receives validated { id, name, args } and returns string content.
 */
export async function runKimiToolConversation({
  apiKey,
  model,
  system,
  prompt,
  tools,
  executeTool,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  reasoningEffort = 'max',
  maxIterations = 8,
  maxCompletionTokens = 8192,
  timeoutMs = 300_000,
  sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  retryDelaysMs = [5_000, 15_000, 30_000],
}) {
  if (!apiKey) throw new Error('MOONSHOT_API_KEY is not set');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ];
  const usageParts = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const data = await postCompletion({
      fetchImpl,
      apiKey,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      timeoutMs,
      sleepImpl,
      retryDelaysMs,
      body: {
        model,
        messages,
        tools,
        tool_choice: 'auto',
        reasoning_effort: reasoningEffort,
        max_completion_tokens: maxCompletionTokens,
      },
    });
    usageParts.push(normalizeKimiUsage(data.usage));

    const choice = data?.choices?.[0];
    const message = choice?.message;
    if (!message || message.role !== 'assistant') {
      throw new Error('Kimi API response has no assistant message');
    }
    // Preserve the provider message as returned; Kimi requires the complete
    // assistant tool_calls message before its matching role=tool messages.
    messages.push(message);

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (calls.length === 0) {
      return {
        answer: typeof message.content === 'string' ? message.content : '',
        stopReason: choice.finish_reason ?? null,
        usage: aggregateKimiUsage(usageParts),
        iterations: iteration + 1,
      };
    }

    for (const call of calls) {
      const id = call?.id;
      const name = call?.function?.name;
      if (!id || !name) throw new Error('Kimi returned a malformed tool call');
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (error) {
        throw new Error(`Kimi returned invalid JSON arguments for ${name}: ${error.message}`);
      }
      const content = await executeTool({ id, name, args });
      messages.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: String(content),
      });
    }
  }

  throw new Error(`Kimi exceeded the ${maxIterations}-iteration tool-call limit`);
}
