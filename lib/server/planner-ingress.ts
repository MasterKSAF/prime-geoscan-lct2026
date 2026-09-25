import { createServer, request as upstreamRequest } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handlePlannerVideo } from './planner-video.ts';

const MiB = 1024 * 1024;
const routes: Record<string, { limit: number; group: string }> = {
  '/api/planner/solve': { limit: 200000, group: 'legacy' },
  '/api/planner/missions/solve': { limit: 200 * 1024, group: 'solve' },
  '/api/planner/missions/solve-with-obstacles': {
    limit: 12 * MiB,
    group: 'solve',
  },
  '/api/planner/missions/analyze': { limit: 2 * MiB, group: 'analyze' },
  '/api/planner/missions/contingency': { limit: 2 * MiB, group: 'contingency' },
};

function reply(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  code: string,
  error: string,
) {
  // Closing while upload bytes are still crossing Docker's TCP forwarding can
  // reset the connection before the client receives the JSON error. Drain the
  // rejected upload without buffering it, with a hard time/byte bound. It never
  // reaches Wrangler. Already timed-out clients must not gain another deadline.
  const finish = () => {
    if (res.destroyed || res.headersSent) return;
    const body = JSON.stringify({ code, error });
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Connection: 'close',
      ...(status === 429 ? { 'Retry-After': '3' } : {}),
    });
    res.end(body);
  };
  if (req.complete || req.readableEnded || status === 408) {
    req.resume(); finish(); return;
  }
  let discarded = 0;
  const timer = setTimeout(done, 5000);
  function onData(chunk: Buffer) {
    discarded += chunk.length;
    if (discarded > 32 * MiB) done();
  }
  function done() {
    clearTimeout(timer);
    req.off('data', onData); req.off('end', done); req.off('aborted', done);
    finish();
  }
  req.on('data', onData); req.once('end', done); req.once('aborted', done);
  req.resume();
}

/** Local production ingress, not public authentication or a flight gateway.
 * Buffers only accepted, bounded POSTs before forwarding; the worker retains all
 * schema/size/origin validation. No automatic replay of stateful requests.
 */
export function createPlannerIngress(options: {
  upstreamPort: number;
  bodyTimeoutMs?: number;
  upstreamTimeoutMs?: number;
}) {
  const busy = new Set<string>();
  const server = createServer((req, res) => {
    req.on('error', () => {
      /* Client disconnects are confined to this request. */
    });
    let path: string;
    try {
      path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/$/, '');
    } catch {
      reply(req, res, 400, 'URL', 'Некорректный адрес запроса.');
      return;
    }
    if (path === '/api/planner/video/mp4') { void handlePlannerVideo(req,res); return; }
    const route = routes[path];
    const pending: { group?: string; timer?: ReturnType<typeof setTimeout> } =
      {};
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(pending.timer);
      if (pending.group) busy.delete(pending.group);
    };
    const reject = (status: number, code: string, message: string) => {
      release();
      reply(req, res, status, code, message);
    };
    const forward = (body?: Buffer) => {
      clearTimeout(pending.timer);
      // Remove hop-by-hop headers (including names nominated by Connection).
      const headers = { ...req.headers };
      for (const key of [
        'connection',
        'keep-alive',
        'transfer-encoding',
        'upgrade',
        'expect',
        'trailer',
        'te',
        'proxy-authorization',
        'proxy-connection',
        ...(req.headers.connection ?? '')
          .toLowerCase()
          .split(',')
          .map((x) => x.trim()),
      ])
        delete headers[key];
      delete headers['content-length'];
      if (body) headers['content-length'] = String(body.length);
      const upstream = upstreamRequest(
        {
          hostname: '127.0.0.1',
          port: options.upstreamPort,
          path: req.url,
          method: req.method,
          headers,
          agent: false,
        },
        (incoming) => {
          if (!res.destroyed) {
            res.writeHead(incoming.statusCode ?? 502, incoming.headers);
            incoming.pipe(res);
          } else incoming.resume();
          // Do not abort the worker's upload/response when the browser goes away.
          // Consume it and release the gate only when the upstream really ends.
          res.on('close', () => {
            incoming.unpipe(res);
            incoming.resume();
          });
          incoming.on('end', release);
          incoming.on('error', () => {
            release();
            res.destroy();
          });
        },
      );
      upstream.setTimeout(options.upstreamTimeoutMs ?? 60000, () =>
        upstream.destroy(new Error('Upstream timeout')),
      );
      upstream.on('error', () => {
        release();
        if (!res.headersSent && !res.destroyed)
          reply(req, res, 502, 'UPSTREAM', 'Расчётный сервер недоступен.');
        else res.destroy();
      });
      upstream.end(body);
    };

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (
        req.headers['transfer-encoding'] ||
        Number(req.headers['content-length'] ?? 0) !== 0
      )
        return reject(400, 'BODY', 'Тело запроса здесь не поддерживается.');
      forward();
      return;
    }
    if (req.method !== 'POST' || !route)
      return reject(405, 'METHOD', 'Метод не поддерживается.');
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      return reject(403, 'ORIGIN', 'Недопустимый источник запроса.');
    if (
      (req.headers['content-type'] ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase() !== 'application/json'
    )
      return reject(415, 'TYPE', 'API принимает только application/json.');
    if (
      req.headers['content-encoding'] &&
      req.headers['content-encoding'] !== 'identity'
    )
      return reject(415, 'ENCODING', 'Сжатое тело запроса не поддерживается.');
    const limit =
      route.limit +
      (req.headers['x-prime-obstacles'] === '1' &&
      ['analyze', 'contingency'].includes(route.group)
        ? 12 * MiB
        : 0);
    if (Number(req.headers['content-length'] ?? 0) > limit)
      return reject(413, 'SIZE', `Превышен предел запроса ${limit} байт.`);
    if (busy.has(route.group))
      return reject(
        429,
        'BUSY',
        'Другой расчёт ещё выполняется. Повторите позже.',
      );
    pending.group = route.group;
    busy.add(route.group);
    let size = 0;
    let chunks: Buffer[] = [];
    let reading = true;
    const failUpload = (status: number, code: string, message: string) => {
      if (!reading) return;
      reading = false;
      chunks = [];
      reject(status, code, message);
    };
    pending.timer = setTimeout(
      () => failUpload(408, 'TIMEOUT', 'Превышено время передачи миссии.'),
      options.bodyTimeoutMs ?? 5000,
    );
    req.on('data', (chunk: Buffer) => {
      if (!reading) return;
      size += chunk.length;
      if (size > limit)
        failUpload(413, 'SIZE', `Превышен предел запроса ${limit} байт.`);
      else chunks.push(chunk);
    });
    req.on('aborted', () => {
      reading = false;
      chunks = [];
      release();
    });
    req.on('end', () => {
      if (!reading) return;
      reading = false;
      const body = Buffer.concat(chunks, size);
      chunks = [];
      forward(body);
    });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  return server;
}
