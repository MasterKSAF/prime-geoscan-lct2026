import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { handlePlannerVideo } from '../lib/server/planner-video.ts';
import {
  canDownloadRecording,
  finalizedRecordingBytes,
} from '../hooks/use-mission-recordings.ts';

void test('video download is gated by finalized nonempty data and the report export lock', () => {
  assert.equal(finalizedRecordingBytes(), 0);
  assert.equal(finalizedRecordingBytes(new Blob([])), 0);
  const blob = new Blob(['recorded frames']);
  const bytes = finalizedRecordingBytes(blob);
  assert.equal(bytes, blob.size);
  assert.equal(finalizedRecordingBytes(blob, true), 0);
  assert.equal(canDownloadRecording(undefined), false);
  assert.equal(canDownloadRecording({ status: 'ready', bytes: 0 }), false);
  assert.equal(canDownloadRecording({ status: 'recording', bytes }), false);
  assert.equal(canDownloadRecording({ status: 'converting', bytes }), false);
  assert.equal(canDownloadRecording({ status: 'ready', bytes }, true), false);
  assert.equal(canDownloadRecording({ status: 'ready', bytes }), true);
  // Recorder errors can arrive before onstop; raw chunks are not a file.
  assert.equal(canDownloadRecording({ status: 'error', bytes: finalizedRecordingBytes() }), false);
  // Conversion errors retain the completed source, so an explicit retry works.
  assert.equal(canDownloadRecording({ status: 'error', bytes }), true);
  assert.equal(canDownloadRecording({ status: 'error', bytes }, true), false);
});

void test('report video wiring shares the export guard and recorder discards clear stale availability', async () => {
  const report = await readFile('components/planner/mission-session-report.tsx', 'utf8');
  const hook = await readFile('hooks/use-mission-recordings.ts', 'utf8');
  assert.match(report, /canDownloadRecording\(\s*p\.recordings\?\.\[row\.id\],\s*p\.busy/);
  assert.match(hook, /records\.delete\(id\);\s*setInfo\([\s\S]*?delete next\[id\]/);
  assert.match(hook, /recorder\.onerror[\s\S]*?bytes: finalizedRecordingBytes\(r\.blob, r\.discarded\)/);
});

void test('server video resamples timestamps to 30 fps before expensive scaling', async () => {
  const server = await readFile('lib/server/planner-video.ts', 'utf8');
  assert.match(server, /'fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:\(ow-iw\)\/2:\(oh-ih\)\/2'/);
  assert.match(server, /'-threads',\s*'2'/);
  assert.match(server, /}, 90000\)/);
});

void test('video upload timeout is cleared after the body instead of killing conversion response', async (t) => {
  const timeouts: number[] = [];
  let finalTimeoutListeners = -1;
  let afterUploadSocketTimeout: number | undefined;
  const server = createServer((req, res) => {
    const originalTimeout = req.setTimeout.bind(req);
    req.setTimeout = (milliseconds, callback) => {
      timeouts.push(milliseconds);
      const result = originalTimeout(milliseconds, callback);
      if (milliseconds === 0 && afterUploadSocketTimeout === undefined)
        afterUploadSocketTimeout = req.socket.timeout;
      return result;
    };
    void handlePlannerVideo(req, res).then(() => {
      finalTimeoutListeners = req.listenerCount('timeout');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}`, {
    method: 'POST',
    headers: { 'content-type': 'video/webm' },
    body: 'wrong-header',
  });
  assert.equal(response.status, 400);
  await response.text();
  // Do not reset the HTTP keep-alive timer again after the response completes.
  assert.deepEqual(timeouts, [30000, 0]);
  assert.equal(afterUploadSocketTimeout, 0);
  assert.equal(finalTimeoutListeners, 0);
});

void test('video converter rejects unsafe or invalid input without poisoning next requests', async (t) => {
  const server = createServer((req, res) => {
    void handlePlannerVideo(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  await t.test('GET is not a conversion', async () =>
    assert.equal((await fetch(url)).status, 405),
  );
  await t.test('cross-origin request is rejected', async () =>
    assert.equal(
      (
        await fetch(url, {
          method: 'POST',
          headers: {
            origin: 'https://other.invalid',
            'content-type': 'video/webm',
          },
          body: 'data',
        })
      ).status,
      403,
    ),
  );
  await t.test('arbitrary MIME is rejected', async () =>
    assert.equal(
      (await fetch(url, { method: 'POST', body: 'data' })).status,
      415,
    ),
  );
  await t.test(
    'oversize declared length is rejected before reading body',
    async () => {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          url,
          {
            method: 'POST',
            headers: {
              'content-type': 'video/webm',
              'content-length': String(97 * 1024 * 1024),
            },
          },
          (res) => {
            res.resume();
            res.once('end', () => resolve(res.statusCode!));
          },
        );
        req.once('error', reject);
        req.end();
      });
      assert.equal(status, 413);
    },
  );
  await t.test('bad WebM header releases conversion slot', async () => {
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'video/webm' },
            body: 'wrong-header',
          })
        ).status,
        400,
      );
  });
});
