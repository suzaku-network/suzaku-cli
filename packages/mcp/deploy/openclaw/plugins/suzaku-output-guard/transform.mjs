// Kept behaviorally in sync with sanitizeOutput() in src/cli-runner.ts via
// eval/fixtures/redaction-parity.json — update both layers and the fixture together.
const KNOWN_INTERNAL_NAME =
  /\b(?:SUZAKU_[A-Z0-9_]+|SAFE_API_KEY(?:_FILE)?|ANTHROPIC_API_KEY|ETHERSCAN_API_KEY|SNOWSCAN_API_KEY|OPENCLAW_GATEWAY_TOKEN|GNUPGHOME|SIG_AGG_URL|PASSWORD_STORE_DIR|PK_PCHAIN)\b/gi;

// Uppercase-only so ordinary prose or camelCase symbols such as "MyPassword"
// are never rewritten.
const GENERIC_SECRET_NAME =
  /\b[A-Z][A-Z0-9_]*(?:PRIVATE_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET)(?:_FILE)?\b/g;

const INTERNAL_PATH =
  /(?:^|(?<=[\s("'`=]))\/(?:run\/secrets|home\/node|data\/audit|mcp)(?:\/[^\s"'`)<]*)?/g;

// Telegram rejects nested entities inside <pre>/<code>, so bold conversion must
// never touch monospace regions. OpenClaw may normalize <code> to inline `code`
// before this hook runs, so both inline and fenced backticks are protected.
// Keep ``` before ` so a fence is consumed as one opener.
const MONOSPACE_OPEN = /<pre(?:\s[^>]*)?>|<code(?:\s[^>]*)?>|```|`/gi;

/**
 * Transform exactly what the OpenClaw delivery hook sends to Telegram.
 *
 * The conversion is deliberately narrow. It fixes the repeatedly observed
 * Markdown-bold leak without pretending to be a general Markdown renderer.
 * Unsupported Markdown remains visible to the evaluator as a delivery defect.
 * Redaction is global — including inside monospace regions — while bold
 * conversion only applies outside them; an unclosed region protects the
 * whole remaining message (literal asterisks beat invalid nesting).
 */
export function guardOutboundText(input) {
  const original = typeof input === 'string' ? input : String(input ?? '');
  let redactions = 0;
  let markdownConversions = 0;

  const content = original
    .replace(KNOWN_INTERNAL_NAME, () => {
      redactions += 1;
      return '[internal configuration]';
    })
    .replace(GENERIC_SECRET_NAME, () => {
      redactions += 1;
      return '[internal configuration]';
    })
    .replace(INTERNAL_PATH, (match) => {
      redactions += 1;
      const trailing = match.match(/[.,;:!?]+$/)?.[0] ?? '';
      return `[internal path]${trailing}`;
    });

  const convertSegment = (segment) =>
    segment.replace(/\*\*([^*\n]+)\*\*/g, (_match, body) => {
      markdownConversions += 1;
      const escapedBody = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<b>${escapedBody}</b>`;
    });

  const lower = content.toLowerCase();
  let converted = '';
  let cursor = 0;
  for (;;) {
    MONOSPACE_OPEN.lastIndex = cursor;
    const open = MONOSPACE_OPEN.exec(content);
    if (!open) {
      converted += convertSegment(content.slice(cursor));
      break;
    }
    converted += convertSegment(content.slice(cursor, open.index));
    const openTag = open[0].toLowerCase();
    const closer = openTag.startsWith('<pre')
      ? '</pre>'
      : openTag.startsWith('<code')
        ? '</code>'
        : openTag === '```'
          ? '```'
          : '`';
    const closeIdx = lower.indexOf(closer, open.index + open[0].length);
    if (closeIdx === -1) {
      converted += content.slice(open.index);
      break;
    }
    const regionEnd = closeIdx + closer.length;
    converted += content.slice(open.index, regionEnd);
    cursor = regionEnd;
  }

  return {
    content: converted,
    changed: converted !== original,
    redactions,
    markdownConversions,
  };
}
