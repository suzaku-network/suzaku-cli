import { pathToFileURL } from 'node:url';

export function verifyHeartbeatCron(payload) {
  const jobs = Array.isArray(payload) ? payload : payload.jobs;
  if (!Array.isArray(jobs)) throw new Error('cron list JSON has no jobs array');
  if (jobs.length !== 1) throw new Error(`expected exactly one cron job, found ${jobs.length}`);
  const job = jobs[0];
  const declarationKey = job.declarationKey ?? job.declaration?.key ?? job.declaration_key;
  if (declarationKey !== 'suzaku-monitor-heartbeat-v1') {
    throw new Error(`unexpected declaration key: ${String(declarationKey)}`);
  }
  if ((job.agentId ?? job.agent) !== 'heartbeat') throw new Error('heartbeat job uses the wrong agent');
  if (job.enabled !== true) throw new Error('heartbeat job is disabled');
  if (job.name !== 'heartbeat') throw new Error(`unexpected heartbeat job name: ${String(job.name)}`);
  if (job.schedule?.kind !== 'cron'
    || job.schedule.expr !== '10 */4 * * *'
    || job.schedule.tz !== 'UTC'
    || job.schedule.staggerMs !== 0) {
    throw new Error('heartbeat job schedule must be exact "10 */4 * * *" in UTC');
  }
  if (job.sessionTarget !== 'isolated') throw new Error('heartbeat job must use an isolated session');
  if (job.payload?.kind !== 'agentTurn') throw new Error('heartbeat job must run an agent turn');
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
  return job;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try {
    verifyHeartbeatCron(JSON.parse(input));
    process.stdout.write('heartbeat cron verified: one enabled exact UTC isolated no-delivery declaration\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
