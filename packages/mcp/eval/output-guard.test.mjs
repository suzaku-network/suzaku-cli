import { readFileSync } from 'node:fs';
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

describe('monospace-aware bold conversion', () => {
  it('leaves bold inside <pre> untouched while converting outside', () => {
    const text = 'Note <pre>**literal** table</pre> and **real bold** outside.';
    expect(guardOutboundText(text).content).toBe(
      'Note <pre>**literal** table</pre> and <b>real bold</b> outside.',
    );
  });

  it('leaves bold inside <code> and fenced blocks untouched', () => {
    const text = 'Run <code>**flags**</code> or:\n```\n**raw**\n```\nthen **done**.';
    expect(guardOutboundText(text).content).toBe(
      'Run <code>**flags**</code> or:\n```\n**raw**\n```\nthen <b>done</b>.',
    );
  });

  it('protects everything after an unclosed monospace opener', () => {
    const text = 'Before **bold** <pre>**stuck** and **more**';
    expect(guardOutboundText(text).content).toBe(
      'Before <b>bold</b> <pre>**stuck** and **more**',
    );
  });

  it('still redacts internal names inside monospace regions', () => {
    const result = guardOutboundText('<pre>SNOWSCAN_API_KEY=abc **keep**</pre>');
    expect(result.content).toBe('<pre>[internal configuration]=abc **keep**</pre>');
    expect(result.redactions).toBe(1);
    expect(result.markdownConversions).toBe(0);
  });

  it('handles openers with attributes and mixed-case tags', () => {
    const text = '<PRE language="c">**x**</PRE> outside **y**';
    expect(guardOutboundText(text).content).toBe(
      '<PRE language="c">**x**</PRE> outside <b>y</b>',
    );
  });

  it('remains idempotent with monospace regions present', () => {
    const once = guardOutboundText('a **b** <pre>**c**</pre> d **e**').content;
    expect(guardOutboundText(once).content).toBe(once);
  });
});

describe('redaction parity corpus (shared with the MCP sanitizer)', () => {
  const { cases } = JSON.parse(
    readFileSync(new URL('./fixtures/redaction-parity.json', import.meta.url), 'utf8'),
  );

  for (const testCase of cases) {
    it(`delivery layer: ${testCase.name}`, () => {
      const { content } = guardOutboundText(testCase.input);
      for (const banned of testCase.mustNotContain ?? []) expect(content).not.toContain(banned);
      for (const kept of testCase.mustContain ?? []) expect(content).toContain(kept);
    });
  }
});
