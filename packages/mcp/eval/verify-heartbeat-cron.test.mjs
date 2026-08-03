import { describe, expect, it } from 'vitest';
import { verifyHeartbeatCron } from '../deploy/openclaw/verify-heartbeat-cron.mjs';

describe('heartbeat cron verifier', () => {
  it('accepts exactly one expected declaration', () => {
    expect(verifyHeartbeatCron({
      jobs: [{ declarationKey: 'suzaku-monitor-heartbeat-v1', agentId: 'heartbeat' }],
    })).toMatchObject({ declarationKey: 'suzaku-monitor-heartbeat-v1' });
  });

  it.each([
    { jobs: [] },
    { jobs: [{ declarationKey: 'legacy-alerts', agentId: 'heartbeat' }] },
    { jobs: [
      { declarationKey: 'suzaku-monitor-heartbeat-v1', agentId: 'heartbeat' },
      { declarationKey: 'legacy-digest', agentId: 'heartbeat' },
    ] },
  ])('fails closed for missing, wrong, or duplicate jobs', (payload) => {
    expect(() => verifyHeartbeatCron(payload)).toThrow();
  });
});
