import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Generates a dated inventory from completed runs; never turns missing/failed
// checks into a green status or rewrites the historic test result files.
const base = 'output/playwright/acceptance-2026-09-24';
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const hash = async p => createHash('sha256').update(await fs.readFile(p)).digest('hex');
const names = ['base-drag-20260924-browser', 'queue-layers-20260924-browser',
  'airspace-20260924-browser', 'queue-20260924-browser', 'recovery37-browser',
  'recovery37-blocked-browser', 'acceptance-controls-20260924-browser',
  'queue-plans-20260924-browser', 'acceptance-dense-20260924-browser',
  'release38-browser', 'release-webm-browser', 'acceptance-editor-gaps-20260924-browser'];
const runtime = await read(`${base}/engine/final-runtime.json`);
const buildInputs = ['package.json','package-lock.json','tsconfig.json','next.config.ts','vite.config.ts',
  'Dockerfile.planner','compose.planner.yaml','.dockerignore','.openai/hosting.json','scripts/start-planner.mjs',
  'scripts/verify-mission-evidence.ts','scripts/verify-mission-archive.ts','scripts/verify-mission-run-report.ts',
  'scripts/benchmark-missions.ts','scripts/verify-mission-robustness.ts','scripts/verify-mission-contingency.ts',
  'scripts/create-geometry-overflow-fixtures.ts'];
const transformed = new Set(runtime.sourceCandidate.transformedFiles.map(f=>f.path));
let matchedBuildFiles=0;
for(const entry of runtime.sourceCandidate.files){
  const file=entry.path.replace(/^source\//,'');
  if(transformed.has(entry.path)||!(entry.role==='runtime'||buildInputs.includes(file)||/originals\/.*\.kml$/.test(file)))continue;
  if(await hash(file)!==entry.sha256)throw Error(`Runtime changed after the tested build: ${file}`);
  matchedBuildFiles++;
}
const browser = [];
for (const name of names) {
  const path = `${base}/ui/${name}.result.json`, run = await read(path);
  const checks = run.result?.checks ?? [];
  if (!run.passed || !checks.length || checks.some(c => !c.pass)) throw Error(`Unsuccessful browser suite: ${name}`);
  if (Date.parse(run.startedAt) < Date.parse(runtime.startedAt)) throw Error(`Stale browser suite: ${name}`);
  browser.push({ name, passed:checks.length, failed:0, startedAt:run.startedAt,
    finishedAt:run.finishedAt, path, sha256:await hash(path) });
}
const unitLog = `${base}/engine/clean-package-final-build.log`;
const text = await fs.readFile(unitLog, 'utf8');
const passed = Number([...text.matchAll(/(?:#|ℹ) pass (\d+)/g)].at(-1)?.[1]);
const failed = Number([...text.matchAll(/(?:#|ℹ) fail (\d+)/g)].at(-1)?.[1]);
if (passed !== 666 || failed !== 0 || !/naming to .*prime-planner:acceptance-final-20260924/.test(text)) throw Error('Final build/test completion not established');
const algorithms = [];
for (const name of ['report.json', 'independent-report.json']) {
  const path = `${base}/engine/${name}`, data = await read(path);
  const checks = data.checks;
  if (data.status !== 'pass' || !Array.isArray(checks) || checks.some(c => !(c.pass ?? c.ok ?? c.status === 'pass'))) throw Error(`Algorithm report failed: ${name}`);
  algorithms.push({path,sha256:await hash(path),at:data.at,passed:checks.length,engineVersion:data.engineVersion,scope:data.scope??data.limits});
}
const downloadPath=`${base}/ui/download-verification.json`, downloads=await read(downloadPath);
if(downloads.status!=='pass')throw Error('Download replay failed');
const summary={schemaVersion:1,checkedAt:new Date().toISOString(),status:'pass',
  team:{name:'ПРАЙМ',developers:['Сергей Калеев','Револь Миняев']},engineVersion:'0.3.9',
  modelOnly:true,flightReady:false,frozen:false,published:false,runtime,
  currentRuntimeMatchesBuiltSource:{passed:true,matchedFiles:matchedBuildFiles,declaredTransformations:[...transformed]},
  automatedTests:{passed,failed,typecheck:'pass',build:'pass',path:unitLog,sha256:await hash(unitLog)},
  algorithms,browser,browserPassed:browser.reduce((n,r)=>n+r.passed,0),
  downloads:{path:downloadPath,sha256:await hash(downloadPath),results:downloads.results},
  claims:[
    'Browser suites ran after the final container restart in a separate acceptance profile; shared fleet state was preserved inside multi-mission suites.',
    'Algorithm fixtures and browser shared-fleet inputs differ; compare numerical metrics only for the same inputHash.',
    'A source-only isolated copy was built, not a clean Git clone or a published commit. The package landing page redirects to /planner as its sole declared source transformation.',
    'Finite regression coverage does not prove every possible UI action, global optimality, physical flight safety, regulatory certification, or 100 jury points.',
    'External live weather, physical telemetry, signed acceptance, public links and submission in the organizer account are not completed by this report.'
  ]};
const target='docs/planner/acceptance-2026-09-24-verification.json';
await fs.writeFile(target,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({target,status:summary.status,unitTests:passed,browserChecks:summary.browserPassed,artifacts:downloads.results.length},null,2));
