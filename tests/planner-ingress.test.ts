import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPlannerIngress } from '../lib/server/planner-ingress.ts';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return address.port;
}

void test('ingress isolates rejected uploads and retains strict worker limits', async (t) => {
  const forwarded: {
    path: string;
    size: number;
    origin?: string;
    host?: string;
  }[] = [];
  const upstream = createServer((req, res) => {
    let size = 0;
    req.on('data', (part: Buffer) => {
      size += part.length;
    });
    req.on('end', () => {
      forwarded.push({
        path: req.url!,
        size,
        origin: req.headers.origin,
        host: req.headers.host,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ size }));
    });
  });
  const upstreamPort = await listen(upstream);
  const ingress = createPlannerIngress({ upstreamPort, bodyTimeoutMs: 60 });
  const port = await listen(ingress),
    base = `http://127.0.0.1:${port}`;
  t.after(() => {
    ingress.closeAllConnections();
    ingress.close();
    upstream.closeAllConnections();
    upstream.close();
  });
  const post = async (
    path: string,
    body: string,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    });
    return {
      status: response.status,
      body: (await response.json()) as { code?: string; size?: number },
    };
  };
  const recover = async () =>
    assert.equal((await post('/api/planner/missions/solve', '{}')).status, 200);
  await t.test('malformed absolute request target cannot crash the ingress', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: 'http://[', method: 'GET' }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode!));
      });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 400);
    await recover();
  });
  await t.test(
    'declared oversize never reaches worker and next request succeeds repeatedly',
    async () => {
      for (let i = 0; i < 5; i++) {
        const count = forwarded.length;
        const result = await post(
          '/api/planner/missions/solve',
          'x'.repeat(205000),
        );
        assert.equal(result.status, 413);
        assert.equal(result.body.code, 'SIZE');
        assert.equal(forwarded.length, count);
        await recover();
      }
    },
  );
  await t.test(
    'origin and type refusals do not poison subsequent requests',
    async () => {
      for (const [headers, status, code] of [
        [{ Origin: 'https://untrusted.invalid' }, 403, 'ORIGIN'],
        [{ 'Content-Type': 'text/plain' }, 415, 'TYPE'],
        [{ 'Content-Encoding': 'gzip' }, 415, 'ENCODING'],
      ] as const) {
        const count = forwarded.length;
        const result = await post('/api/planner/missions/solve', '{}', headers);
        assert.equal(result.status, status);
        assert.equal(result.body.code, code);
        assert.equal(forwarded.length, count);
        await recover();
      }
    },
  );
  const stream = (write: (req: ReturnType<typeof request>) => void) =>
    new Promise<{ status: number; code: string }>((resolve, reject) => {
      const req = request(
        base + '/api/planner/missions/solve',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let text = '';
          res.on('data', (part) => {
            text += String(part);
          });
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              code: (JSON.parse(text) as { code: string }).code,
            }),
          );
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      write(req);
    });
  await t.test(
    'chunked oversize returns complete JSON and releases busy gate',
    async () => {
      const count = forwarded.length;
      const result = await stream((req) => {
        req.write('x'.repeat(204800));
        req.end('x');
      });
      assert.deepEqual(result, { status: 413, code: 'SIZE' });
      assert.equal(forwarded.length, count);
      await recover();
    },
  );
  await t.test(
    'slow upload times out without dispatch; BUSY also releases cleanly',
    async () => {
      const pending = stream((req) => {
        req.write('{');
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
      assert.equal(
        (await post('/api/planner/missions/solve-with-obstacles', '{}')).status,
        429,
      );
      assert.deepEqual(await pending, { status: 408, code: 'TIMEOUT' });
      await recover();
    },
  );
  await t.test(
    'aborted upload does not reach worker or strand the gate',
    async () => {
      const count = forwarded.length;
      const req = request(base + '/api/planner/missions/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      req.on('error', () => {});
      req.write('{');
      await new Promise((resolve) => setTimeout(resolve, 10));
      req.destroy();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(forwarded.length, count);
      await recover();
    },
  );
  await t.test(
    'exact size is accepted; one extra UTF-8 byte is refused',
    async () => {
      const body = 'я'.repeat(102400);
      const result = await post('/api/planner/missions/solve', body);
      assert.equal(result.status, 200);
      assert.equal(result.body.size, 204800);
      assert.equal(
        (await post('/api/planner/missions/solve', body + 'x')).status,
        413,
      );
      await recover();
    },
  );
  await t.test(
    'obstacle allowance is endpoint-specific, origin/host stay intact',
    async () => {
      const body = 'x'.repeat(2100000);
      assert.equal(
        (await post('/api/planner/missions/contingency', body)).status,
        413,
      );
      assert.equal(
        (
          await post('/api/planner/missions/contingency', body, {
            'x-prime-obstacles': '1',
            Origin: base,
          })
        ).status,
        200,
      );
      assert.equal(forwarded.at(-1)!.size, body.length);
      assert.equal(forwarded.at(-1)!.origin, base);
      assert.equal(forwarded.at(-1)!.host, `127.0.0.1:${port}`);
      assert.equal(
        (
          await post('/api/planner/missions/solve', body, {
            'x-prime-obstacles': '1',
          })
        ).status,
        413,
      );
      assert.equal(
        (await post('/api/planner/missions/solve-with-obstacles', body)).status,
        200,
      );
    },
  );
});
