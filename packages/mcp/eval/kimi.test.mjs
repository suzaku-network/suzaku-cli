import { describe, expect, it, vi } from 'vitest';
import {
  aggregateKimiUsage,
  normalizeKimiUsage,
  normalizeKimiToolSchema,
  runKimiToolConversation,
} from './kimi.mjs';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('Kimi API adapter', () => {
  it('separates cached prompt tokens from full-price input', () => {
    expect(normalizeKimiUsage({
      prompt_tokens: 100,
      completion_tokens: 20,
      cached_tokens: 70,
    })).toEqual({
      input_tokens: 30,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 70,
      total_tokens: 120,
    });
    expect(normalizeKimiUsage({ prompt_tokens: 1 })).toBeNull();
  });

  it('aggregates every billed API turn', () => {
    expect(aggregateKimiUsage([
      normalizeKimiUsage({ prompt_tokens: 100, completion_tokens: 20, cached_tokens: 70 }),
      normalizeKimiUsage({ prompt_tokens: 140, completion_tokens: 10, cached_tokens: 100 }),
    ])).toMatchObject({
      input_tokens: 70,
      output_tokens: 30,
      cache_read_input_tokens: 170,
      total_tokens: 270,
    });
  });

  it('inlines MCP property references without weakening their constraints', () => {
    const normalized = normalizeKimiToolSchema({
      type: 'object',
      properties: {
        rewardsAddress: {
          type: 'string',
          pattern: '^0x[0-9a-fA-F]{40}$',
          description: 'Rewards address',
        },
        uptimeAddress: {
          $ref: '#/properties/rewardsAddress',
          description: 'Uptime address',
        },
      },
    });
    expect(normalized.properties.uptimeAddress).toEqual({
      type: 'string',
      pattern: '^0x[0-9a-fA-F]{40}$',
      description: 'Uptime address',
    });
    expect(JSON.stringify(normalized)).not.toContain('"$ref"');
  });

  it('rejects unresolved or external schema references before an API call', () => {
    expect(() => normalizeKimiToolSchema({
      type: 'object',
      properties: { bad: { $ref: '#/missing/value' } },
    })).toThrow('unresolved JSON Schema reference');
    expect(() => normalizeKimiToolSchema({ $ref: 'https://example.com/schema' }))
      .toThrow('unsupported non-local JSON Schema reference');
  });

  it('runs a complete official tool-call loop and preserves matching IDs', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            reasoning_content: 'Need live data.',
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'operators', arguments: '{"network":"mainnet"}' },
            }],
          },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 10, cached_tokens: 80 },
      }))
      .mockResolvedValueOnce(response({
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'There are two operators.' },
        }],
        usage: { prompt_tokens: 140, completion_tokens: 12, cached_tokens: 100 },
      }));
    const executeTool = vi.fn().mockResolvedValue('{"operators":[1,2]}');

    const result = await runKimiToolConversation({
      apiKey: 'test-key',
      model: 'kimi-k3',
      system: 'system',
      prompt: 'operators?',
      tools: [{ type: 'function', function: { name: 'operators', parameters: { type: 'object' } } }],
      executeTool,
      fetchImpl,
    });

    expect(result).toMatchObject({
      answer: 'There are two operators.',
      stopReason: 'stop',
      iterations: 2,
      usage: {
        input_tokens: 60,
        output_tokens: 22,
        cache_read_input_tokens: 180,
        total_tokens: 262,
      },
    });
    expect(executeTool).toHaveBeenCalledWith({
      id: 'call_1',
      name: 'operators',
      args: { network: 'mainnet' },
    });
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(secondBody.messages.slice(-2)).toEqual([
      expect.objectContaining({
        role: 'assistant',
        reasoning_content: 'Need live data.',
        tool_calls: [expect.objectContaining({ id: 'call_1' })],
      }),
      {
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'operators',
        content: '{"operators":[1,2]}',
      },
    ]);
  });

  it('fails closed on provider and malformed-tool errors', async () => {
    await expect(runKimiToolConversation({
      apiKey: 'test-key',
      model: 'kimi-k3',
      system: 'system',
      prompt: 'test',
      tools: [],
      executeTool: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue(response({
        error: { message: 'bad key' },
      }, 401)),
    })).rejects.toThrow('Kimi API HTTP 401: bad key');

    await expect(runKimiToolConversation({
      apiKey: 'test-key',
      model: 'kimi-k3',
      system: 'system',
      prompt: 'test',
      tools: [],
      executeTool: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue(response({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'bad', function: { name: 'x', arguments: '{' } }],
          },
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })),
    })).rejects.toThrow('invalid JSON arguments');
  });

  it('retries only bounded 429 responses before succeeding', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        error: { message: 'engine overloaded' },
      }, 429))
      .mockResolvedValueOnce(response({
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'Recovered.' },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await runKimiToolConversation({
      apiKey: 'test-key',
      model: 'kimi-k3',
      system: 'system',
      prompt: 'test',
      tools: [],
      executeTool: vi.fn(),
      fetchImpl,
      sleepImpl,
      retryDelaysMs: [123],
    });

    expect(result.answer).toBe('Recovered.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(123);
  });
});
