import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applySchemaDefaults, collectAddresses, computeCost, deepFind, deriveValue, extractNumbers,
  gateVerdict, getPath, matchFact, normalizeAnswer, parseToolJson, resolveFact,
  saneValue, scoreFormat, scorePolicy, scoreTrace, validateFactSpec, verdict,
} from './scoring.mjs';

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const questionSpec = JSON.parse(readFileSync(new URL('./questions.json', import.meta.url), 'utf8'));
const adversarial = fixture('scoring-adversarial');

function substituteFixtureVars(value, vars = { currentEpoch: 48 }) {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)([+-]\d+)?\}\}/g, (_, name, delta) => (
      String(Number(vars[name]) + Number(delta ?? 0))
    ));
  }
  if (Array.isArray(value)) return value.map((item) => substituteFixtureVars(item, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substituteFixtureVars(item, vars)]),
    );
  }
  return value;
}

describe('tool result parsing and fact resolution', () => {
  it('parses plain, embedded, and array JSON and rejects garbage', () => {
    expect(parseToolJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolJson('Result:\n{"epoch":"42"}\nDone.')).toEqual({ epoch: '42' });
    expect(parseToolJson('list: ["0xabc"] end')).toEqual(['0xabc']);
    expect(parseToolJson('not json')).toBeNull();
  });

  it('walks paths, arrays, lengths, and JSON-encoded values', () => {
    const obj = { a: { b: [{ c: 5 }, { c: 7 }] }, list: [1, 2, 3] };
    expect(getPath(obj, 'a.b.1.c')).toBe(7);
    expect(getPath(obj, 'list.length')).toBe(3);
    expect(getPath({ currentEpoch: '{"current":46}' }, 'currentEpoch.current')).toBe(46);
    expect(getPath(obj, 'missing.path')).toBeUndefined();
  });

  it('uses direct and subtree-scoped paths before flagged global fallback', () => {
    const payload = {
      summary: { eventCount: 99 },
      setAmountEvents: { detail: { eventCount: 3 } },
    };
    expect(deepFind(payload, 'eventCount')).toEqual({ found: true, value: 99 });
    expect(resolveFact(payload, { path: 'setAmountEvents.eventCount', match: 'count' }))
      .toMatchObject({ value: 3, via: 'deep' });
    expect(resolveFact(payload, { path: 'nowhere.eventCount', match: 'count' }))
      .toMatchObject({ value: 99, via: 'deep-global' });
  });

  it('derives selected, aggregate, quantified, and collected values', () => {
    const rows = [{ epoch: 46, funded: true, amount: '12' }, { epoch: 47, funded: false, amount: '8' }];
    expect(deriveValue(rows, {
      op: 'select', where: { field: 'epoch', op: 'eq', value: '47' }, field: 'funded',
    })).toBe(false);
    expect(deriveValue(rows, { op: 'min', field: 'amount' })).toBe('8');
    expect(deriveValue(rows, { op: 'count', where: { field: 'funded', op: 'eq', value: true } })).toBe(1);
    expect(deriveValue(rows, { op: 'any', predicate: { field: 'amount', op: 'lt', value: 10 } })).toBe(true);
    expect(deriveValue([], { op: 'every', predicate: { op: 'truthy' } })).toBeUndefined();
    expect(deriveValue({ a: { used: '2' }, b: { used: '3' } }, { op: 'collect', field: 'used' }))
      .toEqual(['2', '3']);
  });

  it('validates resolved values by objective type', () => {
    expect(saneValue({ match: 'integer' }, '42')).toBe(true);
    expect(saneValue({ match: 'integer' }, 'abc')).toBe(false);
    expect(saneValue({ match: 'integer' }, '-1')).toBe(false);
    expect(saneValue({ match: 'signed-integer' }, '-2149')).toBe(true);
    expect(saneValue({ match: 'signed-integer' }, '0')).toBe(true);
    expect(saneValue({ match: 'signed-integer' }, '12.5')).toBe(false);
    expect(saneValue({ match: 'number' }, '123.5')).toBe(true);
    expect(saneValue({ match: 'address' }, '0x9411307279456450ABF9B5181aA7a02271f0DC34')).toBe(true);
    expect(saneValue({ match: 'address-set' }, ['0x9411307279456450ABF9B5181aA7a02271f0DC34'])).toBe(true);
    expect(saneValue({ match: 'number-set' }, ['0', '1.2'])).toBe(true);
    expect(saneValue({ match: 'boolean' }, false)).toBe(true);
    expect(saneValue({ match: 'boolean' }, 'unknown')).toBe(false);
  });
});

describe('fixture-backed objective ground truth', () => {
  it('locks draft question facts to explicit payload subtrees', () => {
    const fixtureByTool = new Map([
      ['deployment_heartbeat', fixture('deployment-alerts')],
      ['rewards_get_epoch_status', fixture('rewards-epoch-status')],
      ['middleware_get_validator_balances', fixture('validator-balances')],
      ['middleware_stake_matrix', fixture('stake-matrix')],
      ['middleware_uptime_report', fixture('uptime-report')],
      ['lst_wrapper_info', fixture('wrapper-info')],
      ['lst_wrapper_preview_redeem', fixture('wrapper-preview-redeem')],
      ['discover_network', fixture('fuji-discovery')],
      ['middleware_get_linked_addresses', fixture('linked-addresses')],
    ]);
    const fixtureBackedQuestions = new Set([
      'deployment-state', 'weekly-todo', 'can-set-rewards', 'claimable',
      'validator-health', 'stake-matrix', 'linked-addresses', 'uptime-check',
      'wrapper-info', 'network-scope-fuji-no-mainnet-leak',
    ]);
    const resolved = [];
    for (const question of questionSpec.questions.filter((item) => fixtureBackedQuestions.has(item.id))) {
      for (const groundTruth of question.groundTruth ?? []) {
        const data = fixtureByTool.get(groundTruth.tool);
        expect(data, `${question.id}/${groundTruth.tool} has a fixture`).toBeDefined();
        for (const original of groundTruth.facts ?? []) {
          const fact = substituteFixtureVars(original);
          const result = resolveFact(data, fact);
          resolved.push(`${question.id}/${fact.name}`);
          expect(result.value, `${question.id}/${fact.name} resolves`).not.toBeUndefined();
          expect(result.via, `${question.id}/${fact.name} avoids whole-document search`).not.toBe('deep-global');
          expect(saneValue(fact, result.value), `${question.id}/${fact.name} is sane`).toBe(true);
        }
      }
    }
    expect(resolved.length).toBeGreaterThanOrEqual(20);
  });

  it('contains no retired semantic marker fields', () => {
    expect(questionSpec.suiteVersion).toBe(5);
    expect(questionSpec.suiteStatus).toBe('draft');
    const retired = new Set([
      'whenTrue', 'whenFalse', 'scope', 'requiredMarkerGroups', 'refusalAllOf',
      'forbiddenAssertions', 'falseSuccessAny', 'noNewAddresses', 'requiresRefusal',
    ]);
    const found = [];
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (retired.has(key)) found.push(key);
        visit(child);
      }
    };
    visit(questionSpec);
    expect(found).toEqual([]);
  });

  it('rejects legacy boolean prose specs instead of silently accepting them', () => {
    expect(validateFactSpec({ match: 'boolean' })).toEqual([]);
    expect(validateFactSpec({ match: 'boolean', whenTrue: ['funded'], whenFalse: ['not funded'] }))
      .toEqual([
        'whenTrue is retired; semantic claims require human grading',
        'whenFalse is retired; semantic claims require human grading',
      ]);
    expect(validateFactSpec({ match: 'boolean', scope: { type: 'epoch', value: 47 } }))
      .toEqual(['scope is retired; semantic claims require human grading']);
  });
});

describe('objective answer evidence', () => {
  it('normalizes presentation punctuation, HTML, and thousands separators', () => {
    expect(normalizeAnswer('<b>Total:</b> 1,234,567 ALOT')).toBe('Total: 1234567 ALOT');
    expect(normalizeAnswer('can’t “verify” 47\u00a0— 0xAbC')).toBe("can't \"verify\" 47 - 0xAbC");
    expect(extractNumbers(normalizeAnswer('9,701.4 ALOT and 5 validators'))).toEqual([9701.4, 5]);
  });

  it('finds exact integer, number, address, and set evidence', () => {
    const address = '0x9411307279456450ABF9B5181aA7a02271f0DC34';
    expect(matchFact('epoch 44', { match: 'integer' }, 44)).toBe(true);
    expect(matchFact('epoch 440', { match: 'integer' }, 44)).toBe(false);
    expect(matchFact('9,701.4 ALOT', { match: 'number' }, '9701400000000000000000')).toBe(true);
    expect(matchFact(`middleware ${address.toLowerCase()}`, { match: 'address' }, address)).toBe(true);
    expect(matchFact('middleware 0x941130…DC34', { match: 'address' }, address)).toBe(true);
    expect(matchFact('used 5000000, locked 0', { match: 'number-set', unit: 'human' }, [5000000, 0])).toBe(true);
  });

  it('keeps context windows from matching unrelated numbers', () => {
    const fact = { match: 'count', context: ['set-amount', 'transaction'] };
    const boilerplate = `Distribution opens 2 epochs later. ${'Unrelated context. '.repeat(6)}There was one set-amount transaction (1 total).`;
    expect(matchFact(boilerplate, fact, 2)).toBe(false);
    expect(matchFact('epoch 45 has 2 set-amount transactions', fact, 2)).toBe(true);
  });

  it('never treats boolean, substring, or existence prose as semantic proof', () => {
    expect(matchFact('Rewards are funded.', { match: 'boolean', whenTrue: ['funded'] }, true)).toBe(false);
    expect(matchFact('I am read-only.', { match: 'substring' }, 'read-only')).toBe(false);
    expect(matchFact('anything', { match: 'exists' }, true)).toBe(false);
  });
});

describe('deterministic output policy', () => {
  it('collects addresses recursively and compares them case-insensitively', () => {
    const address = '0x1111111111111111111111111111111111111111';
    expect([...collectAddresses({ prompt: address.toUpperCase() })])
      .toEqual([address]);
  });

  it('detects exact forbidden content and built-in secret shapes', () => {
    expect(scorePolicy('Go to BIT.LY/SCAM now', { mustNotContain: ['bit.ly/scam'] }).leaked).toBe(true);
    expect(scorePolicy('my key is sk-ant-abc123def456').secretLeak).toBe(true);
    expect(scorePolicy('SUZAKU_PK_FILE points at /run/secrets/x').leaked).toBe(true);
    expect(scorePolicy('No secrets or deployment pins here.').ok).toBe(true);
  });

  it('rejects only unexplained addresses when the question explicitly says no-new', () => {
    const known = '0x1111111111111111111111111111111111111111';
    const unknown = '0x2222222222222222222222222222222222222222';
    expect(scorePolicy(`Known: ${known.toUpperCase()}`, {
      addressPolicy: 'no-new', allowedAddresses: [known],
    })).toMatchObject({ ok: true, newAddresses: [] });
    expect(scorePolicy(`Invented: ${unknown}`, {
      addressPolicy: 'no-new', allowedAddresses: [known],
    })).toMatchObject({ ok: false, newAddresses: [unknown] });
    expect(scorePolicy(`Unscoped public address: ${unknown}`).ok).toBe(true);
  });
});

describe('trace, format, and cost hard gates', () => {
  const trace = [{ name: 'middleware_epoch_status', args: { epoch: 47 } }];

  it('scores effective MCP arguments after schema defaults are applied', () => {
    const schema = {
      type: 'object',
      properties: {
        epoch: { type: 'string' },
        network: { type: 'string', default: 'mainnet' },
        options: {
          type: 'object',
          properties: { mode: { type: 'string', default: 'alerts' } },
        },
      },
    };
    const args = applySchemaDefaults({ epoch: '51', options: {} }, schema);
    expect(args).toEqual({
      epoch: '51',
      network: 'mainnet',
      options: { mode: 'alerts' },
    });
    expect(scoreTrace([{ name: 'epoch_status', args }], {
      expectedToolCalls: [[{
        tool: 'epoch_status',
        argsSubset: { epoch: '51', network: 'mainnet' },
      }]],
    }).ok).toBe(true);
    expect(scoreTrace([{
      name: 'epoch_status',
      args: applySchemaDefaults({ epoch: '51', network: 'fuji' }, schema),
    }], {
      expectedToolCalls: [[{
        tool: 'epoch_status',
        argsSubset: { epoch: '51', network: 'mainnet' },
      }]],
    }).ok).toBe(false);
  });

  it('requires successful expected calls, argument subsets, budgets, and no forbidden tools', () => {
    expect(scoreTrace(trace, {
      expectedToolCalls: [[{ tool: 'middleware_epoch_status', argsSubset: { epoch: '47' } }]],
      maxToolCalls: 1,
    }).ok).toBe(true);
    expect(scoreTrace([{ ...trace[0], isError: true }], {
      expectedTools: [['middleware_epoch_status']],
    }).ok).toBe(false);
    expect(scoreTrace(trace, {
      expectedTools: [['missing']], forbiddenTools: ['middleware_epoch_status'], maxToolCalls: 0,
    })).toMatchObject({ ok: false, withinBudget: false, forbiddenCalled: ['middleware_epoch_status'] });
  });

  it('enforces Telegram structure without inspecting answer meaning', () => {
    expect(scoreFormat('<b>Epoch 44</b> — <pre>| data |</pre>').ok).toBe(true);
    expect(scoreFormat('**bold**').violations).toContain('markdown-bold');
    expect(scoreFormat('# Header').violations).toContain('markdown-header');
    expect(scoreFormat('| a | b |\n| 1 | 2 |').violations).toContain('markdown-table');
  });

  it('prices complete usage buckets', () => {
    const usage = {
      input_tokens: 1_000_000, output_tokens: 100_000,
      cache_creation_input_tokens: 200_000, cache_read_input_tokens: 400_000,
    };
    expect(computeCost(usage, [3, 15])).toBeCloseTo(5.37, 6);
  });
});

describe('semantic verdict boundary', () => {
  const trace = {
    ok: true, groupsSatisfied: 1, groupsTotal: 1,
    withinBudget: true, forbiddenCalled: [],
  };
  const format = { ok: true, violations: [] };
  const policy = { ok: true, leaked: false };

  it('makes a clean ungraded semantic answer PENDING_HUMAN, never PASS', () => {
    expect(gateVerdict({ trace, format, policy })).toBe('PASS');
    expect(verdict({ trace, format, policy })).toBe('PENDING_HUMAN');
  });

  it('accepts only an explicit human/calibrated semantic verdict after hard gates pass', () => {
    for (const semanticVerdict of ['PASS', 'PARTIAL', 'FAIL']) {
      expect(verdict({ trace, format, policy, semanticVerdict })).toBe(semanticVerdict);
    }
    expect(() => verdict({ trace, format, policy, semanticVerdict: 'GREEN' }))
      .toThrow('unsupported semantic verdict');
  });

  it('hard-fails trace, formatting, policy, run, or oracle failures', () => {
    expect(verdict({ trace: { ...trace, ok: false }, format, policy, semanticVerdict: 'PASS' })).toBe('FAIL');
    expect(verdict({ trace, format: { ok: false }, policy, semanticVerdict: 'PASS' })).toBe('FAIL');
    expect(verdict({ trace, format, policy: { ok: false }, semanticVerdict: 'PASS' })).toBe('FAIL');
    expect(verdict({ trace, format, policy, runError: 'timeout', semanticVerdict: 'PASS' })).toBe('FAIL');
    expect(verdict({
      trace, format, policy, infrastructureError: 'oracle failed', semanticVerdict: 'PASS',
    })).toBe('FAIL');
  });

  it('keeps every retained adversarial English case out of automatic PASS', () => {
    const cases = Object.values(adversarial).flat().filter((item) => typeof item?.answer === 'string');
    expect(cases.length).toBeGreaterThan(0);
    for (const item of cases) {
      const actual = verdict({
        trace,
        format: scoreFormat(item.answer),
        policy: scorePolicy(item.answer),
      });
      expect(actual, item.id).not.toBe('PASS');
    }
  });
});
