import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { readStoredZip } from '../lib/planner/mission-archive.ts';
const base = 'http://127.0.0.1:3016';
const files = readStoredZip(
  new Uint8Array(
    await readFile('output/obstacles-20260922/expert-mission.evidence.zip'),
  ),
);
const document = JSON.parse(files['data/input/mission.json']);
const candidate = JSON.parse(files['data/plan/candidate.json']);
const results: unknown[] = [];
async function post(
  path: string,
  payload: unknown,
  extra: Record<string, string> = {},
) {
  const start = performance.now();
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Connection: 'close',
      ...extra,
    },
    body: JSON.stringify(payload),
  });
  let transportNote: string | undefined;
  const body = (await response.json().catch((error) => {
    if (response.ok) throw error;
    transportNote =
      'Runtime closed rejected upload before full JSON error body';
    return {};
  })) as { code?: string; status?: string; candidates?: { status: string }[] };
  results.push({
    path,
    status: response.status,
    code: body.code,
    result: body.status,
    transportNote,
    ms: performance.now() - start,
  });
  console.log(
    JSON.stringify({
      path,
      status: response.status,
      error: response.ok ? undefined : body,
    }),
  );
  return { response, body };
}
assert.equal(
  (await post('/api/planner/missions/solve', document)).response.status,
  413,
);
assert.equal(
  (
    await post(
      '/api/planner/missions/solve-with-obstacles',
      {},
      { origin: 'https://untrusted.invalid' },
    )
  ).response.status,
  403,
);
const solved = await post(
  '/api/planner/missions/solve-with-obstacles',
  document,
);
assert.equal(solved.response.status, 200);
assert.ok(solved.body.candidates);
assert.equal(
  solved.body.candidates.filter(
    (c: { status: string }) => c.status === 'feasible_model',
  ).length,
  2,
);
assert.equal(
  (await post('/api/planner/missions/contingency', { document, candidate }))
    .response.status,
  413,
);
const certificate = await post(
  '/api/planner/missions/contingency',
  { document, candidate },
  { 'x-prime-obstacles': '1' },
);
assert.equal(certificate.response.status, 200);
assert.equal(certificate.body.status, 'certified_model');
const analysis = await post(
  '/api/planner/missions/analyze',
  { document, candidate },
  { 'x-prime-obstacles': '1' },
);
assert.equal(analysis.response.status, 200);
await writeFile(
  'output/obstacles-20260922/http-verification.json',
  JSON.stringify({ status: 'pass', results }, null, 2),
);
console.log(JSON.stringify({ status: 'pass', results }, null, 2));
