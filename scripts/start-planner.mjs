import { spawn } from 'node:child_process';
import { createPlannerIngress } from '../lib/server/planner-ingress.ts';

const port = Number(process.env.PORT ?? 3000);
const upstreamPort = Number(process.env.PLANNER_WORKER_PORT ?? 3001);
const host = process.env.PLANNER_HOST ?? '127.0.0.1';
if (
  ![port, upstreamPort].every(
    (x) => Number.isInteger(x) && x > 0 && x < 65536,
  ) ||
  port === upstreamPort
)
  throw new Error('Invalid planner ports');
const worker = spawn(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--ip',
    '127.0.0.1',
    '--port',
    String(upstreamPort),
    '--local',
  ],
  { stdio: 'inherit' },
);
const ingress = createPlannerIngress({ upstreamPort });
let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  ingress.close();
  ingress.closeAllConnections();
  worker.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
}
worker.on('exit', (code) => shutdown(code ?? 1));
worker.on('error', (error) => {
  console.error(error);
  shutdown(1);
});
ingress.on('error', (error) => {
  console.error(error);
  shutdown(1);
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => shutdown());
ingress.listen(port, host, () =>
  console.log(
    `Planner ingress: http://${host}:${port} (worker loopback:${upstreamPort})`,
  ),
);
