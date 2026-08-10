import { describe, expect, it } from 'vitest';
import { verifyHeartbeatCron } from '../deploy/openclaw/verify-heartbeat-cron.mjs';

function makeJob(declarationKey, name, expr) {
  return {
    declarationKey,
    agentId: 'heartbeat',
    name,
    enabled: true,
    schedule: {
      kind: 'cron', expr, tz: 'UTC', staggerMs: 0,
    },
    sessionTarget: 'isolated',
    payload: {
      kind: 'agentTurn',
      thinking: 'low',
      timeoutSeconds: 600,
      toolsAllow: ['suzaku__deployment_heartbeat', 'read', 'write', 'message'],
    },
    delivery: { mode: 'none' },
  };
}

const validTuesday = makeJob(
  'suzaku-monitor-heartbeat-tuesday-v1',
  'heartbeat-tuesday',
  '10 14 * * 2',
);
const validSaturday = makeJob(
  'suzaku-monitor-heartbeat-saturday-v1',
  'heartbeat-saturday',
  '10 2 * * 6',
);
const validJobs = [validTuesday, validSaturday];

describe('heartbeat cron verifier', () => {
  it('accepts exactly two low-thinking, epoch-aligned UTC declarations', () => {
    expect(verifyHeartbeatCron({
      jobs: validJobs,
    })).toHaveLength(2);
  });

  it.each([
    { jobs: [] },
    { jobs: [validTuesday] },
    { jobs: [validTuesday, { ...validSaturday, declarationKey: 'legacy-alerts' }] },
    { jobs: [validTuesday, { ...validTuesday }] },
    { jobs: [...validJobs, { ...validTuesday, declarationKey: 'legacy-digest' }] },
  ])('fails closed for missing, wrong, or duplicate jobs', (payload) => {
    expect(() => verifyHeartbeatCron(payload)).toThrow();
  });

  it.each([
    ['disabled', { enabled: false }],
    ['wrong cadence', { schedule: { ...validTuesday.schedule, expr: '* * * * *' } }],
    ['wrong timezone', { schedule: { ...validTuesday.schedule, tz: 'Europe/Paris' } }],
    ['staggered', { schedule: { ...validTuesday.schedule, staggerMs: 300_000 } }],
    ['shared session', { sessionTarget: 'main' }],
    ['wrong payload', { payload: { ...validTuesday.payload, kind: 'systemEvent' } }],
    ['wrong thinking', { payload: { ...validTuesday.payload, thinking: 'max' } }],
    ['wrong timeout', { payload: { ...validTuesday.payload, timeoutSeconds: 60 } }],
    ['extra tool', { payload: { ...validTuesday.payload, toolsAllow: [...validTuesday.payload.toolsAllow, 'exec'] } }],
    ['announce delivery', { delivery: { mode: 'announce' } }],
  ])('rejects an operationally unsafe job: %s', (_label, patch) => {
    expect(() => verifyHeartbeatCron({
      jobs: [{ ...validTuesday, ...patch }, validSaturday],
    })).toThrow();
  });
});
