import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readStoredZip,
  verifyArchiveFiles,
} from '../../lib/planner/mission-archive.ts';

const prefix = process.argv[2] ?? 'queue-dev';
if (!/^(?:queue-(?:dev|prod)|airspace-prod)$/.test(prefix))
  throw new Error('Expected queue-dev, queue-prod or airspace-prod');
const checks = [];
for (const name of ['demo1', 'demo2', 'demo3', 'custom-completed']) {
  const filename = `output/playwright/${prefix}-${name}.evidence.zip`;
  const bytes = await readFile(filename),
    files = readStoredZip(bytes);
  const result = await verifyArchiveFiles(files);
  assert.equal(
    result.status,
    name === 'demo3'
      ? 'diagnostic-only-not-flight-approved'
      : 'passes-declared-model',
  );
  for (const ext of name === 'demo1' || name === 'demo2'
    ? ['kml', 'geojson']
    : []) {
    const routes = readStoredZip(
      await readFile(`output/playwright/${prefix}-${name}-routes-${ext}.zip`),
    );
    const expected = Object.keys(files)
      .filter((p) => p.startsWith('data/routes/') && p.endsWith(`.${ext}`))
      .sort();
    const actual = Object.keys(routes)
      .filter((p) => p.endsWith(`.${ext}`))
      .sort();
    assert.deepEqual(
      actual,
      expected.map((p) => p.slice('data/routes/'.length)),
    );
    assert.ok(expected.length);
    for (const path of expected)
      assert.equal(routes[path.slice('data/routes/'.length)], files[path]);
  }
  checks.push({
    filename,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    result,
  });
}
console.log(
  JSON.stringify({ prefix, archives: checks.length, checks }, null, 2),
);
