import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { handlePlannerVideo } from '../../lib/server/planner-video.ts';

const execute = promisify(execFile);
const out = 'output/playwright/acceptance-2026-09-24/engine';
const source = `${out}/video-1000fps-fixture.webm`;
const target = `${out}/video-30fps-http.mp4`;
await execute('ffmpeg', ['-y', '-nostdin', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=1000', '-t', '1.2',
  '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-threads', '2', source],
  { timeout: 30000, windowsHide: true });
const server = createServer((req, res) => void handlePlannerVideo(req, res));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const start = performance.now();
  const response = await fetch(`http://127.0.0.1:${address.port}`, {
    method: 'POST', headers: { 'content-type': 'video/webm' }, body: await readFile(source),
  });
  assert.equal(response.status, 200, await response.clone().text());
  await writeFile(target, new Uint8Array(await response.arrayBuffer()));
  const conversionMs = performance.now() - start;
  const probe = async (path: string) => JSON.parse((await execute('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_frames,time_base:format=duration,size',
    '-of', 'json', path], { timeout: 30000, windowsHide: true })).stdout);
  const input = await probe(source), output = await probe(target);
  const stream = output.streams[0];
  assert.equal(stream.avg_frame_rate, '30/1');
  assert.equal(stream.codec_name, 'h264');
  assert.equal(stream.width, 1280);
  assert.equal(stream.height, 720);
  assert.equal(Number(stream.nb_frames), 36);
  assert.ok(Math.abs(Number(output.format.duration) - Number(input.format.duration)) < 0.034);
  const report = { generatedAt: new Date().toISOString(), pass: true, httpStatus: response.status,
    conversionMs, input, output, scope: 'Local Windows FFmpeg through actual HTTP handler; synthetic 1.2-second high-fps fixture, not browser capture or final Docker timing.' };
  await writeFile(`${out}/video-fps-http-verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  server.closeAllConnections();
  server.close();
}
