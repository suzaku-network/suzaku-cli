import { pathToFileURL } from 'node:url';

const expectedJobs = new Map([
  ['suzaku-monitor-heartbeat-tuesday-v1', {
    name: 'heartbeat-tuesday',
    expr: '10 14 * * 2',
  }],
  ['suzaku-monitor-heartbeat-saturday-v1', {
    name: 'heartbeat-saturday',
    expr: '10 2 * * 6',
  }],
]);

export function verifyHeartbeatCron(payload) {
  const jobs = Array.isArray(payload) ? payload : payload.jobs;
  if (!Array.isArray(jobs)) throw new Error('cron list JSON has no jobs array');
  if (jobs.length !== expectedJobs.size) {
    throw new Error(`expected exactly two cron jobs, found ${jobs.length}`);
  }

  const seen = new Set();
  for (const job of jobs) {
    const declarationKey = job.declarationKey ?? job.declaration?.key ?? job.declaration_key;
    const expected = expectedJobs.get(declarationKey);
    if (!expected || seen.has(declarationKey)) {
      throw new Error(`unexpected or duplicate declaration key: ${String(declarationKey)}`);
    }
    seen.add(declarationKey);
    if ((job.agentId ?? job.agent) !== 'heartbeat') throw new Error('heartbeat job uses the wrong agent');
    if (job.enabled !== true) throw new Error('heartbeat job is disabled');
    if (job.name !== expected.name) throw new Error(`unexpected heartbeat job name: ${String(job.name)}`);
    if (job.schedule?.kind !== 'cron'
      || job.schedule.expr !== expected.expr
      || job.schedule.tz !== 'UTC'
      || job.schedule.staggerMs !== 0) {
      throw new Error(`heartbeat job schedule must be exact "${expected.expr}" in UTC`);
    }
    if (job.sessionTarget !== 'isolated') throw new Error('heartbeat job must use an isolated session');
    if (job.payload?.kind !== 'agentTurn') throw new Error('heartbeat job must run an agent turn');
    if (job.payload.thinking !== 'low') throw new Error('heartbeat job thinking must be low');
    if (job.payload.timeoutSeconds !== 600) throw new Error('heartbeat job timeout must be 600 seconds');
    const expectedTools = ['message', 'read', 'suzaku__deployment_heartbeat', 'write'];
    const actualTools = Array.isArray(job.payload.toolsAllow)
      ? [...job.payload.toolsAllow].sort()
      : [];
    if (actualTools.length !== expectedTools.length
      || actualTools.some((tool, index) => tool !== expectedTools[index])) {
      throw new Error(`unexpected heartbeat tool allowlist: ${actualTools.join(',')}`);
    }
    if (job.delivery?.mode !== 'none') throw new Error('heartbeat job fallback delivery must be disabled');
  }
  return jobs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try {
    verifyHeartbeatCron(JSON.parse(input));
    process.stdout.write('heartbeat cron verified: two low-thinking epoch-aligned UTC isolated no-delivery declarations\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
