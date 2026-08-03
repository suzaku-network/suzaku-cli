import { describe, expect, it } from 'vitest';
import { verifyHeartbeatCron } from '../deploy/openclaw/verify-heartbeat-cron.mjs';

const validJob = {
  declarationKey: 'suzaku-monitor-heartbeat-v1',
  agentId: 'heartbeat',
  name: 'heartbeat',
  enabled: true,
  schedule: {
    kind: 'cron', expr: '10 */4 * * *', tz: 'UTC', staggerMs: 0,
  },
  sessionTarget: 'isolated',
  payload: {
    kind: 'agentTurn',
    timeoutSeconds: 600,
    toolsAllow: ['suzaku__deployment_heartbeat', 'read', 'write', 'message'],
  },
  delivery: { mode: 'none' },
};

describe('heartbeat cron verifier', () => {
  it('accepts exactly one enabled, exact UTC, isolated, no-delivery declaration', () => {
    expect(verifyHeartbeatCron({
      jobs: [validJob],
    })).toMatchObject({ declarationKey: 'suzaku-monitor-heartbeat-v1' });
  });

  it.each([
    { jobs: [] },
    { jobs: [{ ...validJob, declarationKey: 'legacy-alerts' }] },
    { jobs: [
      validJob,
      { ...validJob, declarationKey: 'legacy-digest' },
    ] },
  ])('fails closed for missing, wrong, or duplicate jobs', (payload) => {
    expect(() => verifyHeartbeatCron(payload)).toThrow();
  });

  it.each([
    ['disabled', { enabled: false }],
    ['wrong cadence', { schedule: { ...validJob.schedule, expr: '* * * * *' } }],
    ['wrong timezone', { schedule: { ...validJob.schedule, tz: 'Europe/Paris' } }],
    ['staggered', { schedule: { ...validJob.schedule, staggerMs: 300_000 } }],
    ['shared session', { sessionTarget: 'main' }],
    ['wrong payload', { payload: { ...validJob.payload, kind: 'systemEvent' } }],
    ['wrong timeout', { payload: { ...validJob.payload, timeoutSeconds: 60 } }],
    ['extra tool', { payload: { ...validJob.payload, toolsAllow: [...validJob.payload.toolsAllow, 'exec'] } }],
    ['announce delivery', { delivery: { mode: 'announce' } }],
  ])('rejects an operationally unsafe job: %s', (_label, patch) => {
    expect(() => verifyHeartbeatCron({ jobs: [{ ...validJob, ...patch }] })).toThrow();
  });
});
