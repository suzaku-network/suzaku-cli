const INTERNAL_CONFIG_NAME =
  /\b(?:SUZAKU_[A-Z0-9_]+|SAFE_API_KEY(?:_FILE)?|ANTHROPIC_API_KEY|SNOWSCAN_API_KEY|OPENCLAW_GATEWAY_TOKEN|GNUPGHOME|SIG_AGG_URL|PASSWORD_STORE_DIR|PK_PCHAIN|[A-Z][A-Z0-9_]*(?:PRIVATE_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET)(?:_FILE)?)\b/g;

const INTERNAL_PATH =
  /(?:^|(?<=[\s("'`]))\/(?:run\/secrets|home\/node|data\/audit|mcp)(?:\/[^\s"'`)<]*)?/g;

/**
 * Transform exactly what the OpenClaw delivery hook sends to Telegram.
 *
 * The conversion is deliberately narrow. It fixes the repeatedly observed
 * Markdown-bold leak without pretending to be a general Markdown renderer.
 * Unsupported Markdown remains visible to the evaluator as a delivery defect.
 */
export function guardOutboundText(input) {
  const original = typeof input === 'string' ? input : String(input ?? '');
  let content = original;
  let redactions = 0;
  let markdownConversions = 0;

  content = content.replace(INTERNAL_CONFIG_NAME, () => {
    redactions += 1;
    return '[internal configuration]';
  });
  content = content.replace(INTERNAL_PATH, (match) => {
    redactions += 1;
    const trailing = match.match(/[.,;:!?]+$/)?.[0] ?? '';
    return `[internal path]${trailing}`;
  });

  content = content.replace(/\*\*([^*\n]+)\*\*/g, (_match, body) => {
    markdownConversions += 1;
    const escapedBody = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<b>${escapedBody}</b>`;
  });

  return {
    content,
    changed: content !== original,
    redactions,
    markdownConversions,
  };
}
