import type { KeeperRunResult } from './keeper';

export function logTickStructured(result: KeeperRunResult, durationMs: number): void {
    const entry = {
        level: result.errors.length > 0 ? 'warn' : 'info',
        ts: new Date().toISOString(),
        tick: result,
        durationMs,
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
}
