import * as http from 'node:http';
import type { Monitor } from './monitor';

export function startServer(
    monitor: Monitor,
    port: number,
    pollIntervalSeconds: number
): http.Server {
    const server = http.createServer(async (req, res) => {
        if (req.url === '/metrics' && req.method === 'GET') {
            try {
                const metrics = await monitor.registry.metrics();
                res.writeHead(200, { 'Content-Type': monitor.registry.contentType });
                res.end(metrics);
            } catch {
                res.writeHead(500);
                res.end('Error collecting metrics');
            }
        } else if (req.url === '/health' && req.method === 'GET') {
            const status = monitor.getHealthStatus(pollIntervalSeconds);
            const code = status.healthy ? 200 : 503;
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(port, () => {
        process.stderr.write(`Metrics server listening on port ${port}\n`);
    });

    return server;
}
