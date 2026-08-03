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
  return job;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try {
    verifyHeartbeatCron(JSON.parse(input));
    process.stdout.write('heartbeat cron verified: exactly one declaration\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
