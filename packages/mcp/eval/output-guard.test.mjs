import { describe, expect, it } from 'vitest';
import { guardOutboundText } from '../deploy/openclaw/plugins/suzaku-output-guard/transform.mjs';

describe('production outbound guard', () => {
  it('redacts sensitive configuration names and internal paths', () => {
    const result = guardOutboundText(
      'SNOWSCAN_API_KEY failed; inspect /run/secrets/delegate_pk or /home/node/.openclaw.',
    );
    expect(result.content).toBe(
      '[internal configuration] failed; inspect [internal path] or [internal path].',
    );
    expect(result.redactions).toBe(3);
  });

  it('normalizes the observed Markdown bold defect to Telegram HTML', () => {
    const result = guardOutboundText('Please provide **your NodeID** or <b>operator address</b>.');
    expect(result.content).toBe('Please provide <b>your NodeID</b> or <b>operator address</b>.');
    expect(result.markdownConversions).toBe(1);
  });

  it('escapes Telegram HTML metacharacters inside converted bold text', () => {
    expect(guardOutboundText('Use **A < B & C > D**.').content).toBe(
      'Use <b>A &lt; B &amp; C &gt; D</b>.',
    );
  });

  it('does not hide unsupported Markdown from the evaluator', () => {
    const text = '# Heading\n| a | b |\n|---|---|';
    expect(guardOutboundText(text).content).toBe(text);
  });

  it('is idempotent', () => {
    const once = guardOutboundText('Use **care**; [internal configuration] is private.').content;
    expect(guardOutboundText(once).content).toBe(once);
  });
});
