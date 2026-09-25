import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readStoredZip, verifyArchiveFiles } from '../../lib/planner/mission-archive.ts';
import { verifyMissionRunReport } from '../../lib/planner/mission-run-export.ts';
import { MISSION_ENGINE_VERSION } from '../../lib/planner/mission-schema.ts';

const root='output/playwright/acceptance-2026-09-25/ui';
const manifests=[
  {suite:'demo2-20260925-browser',evidence:'demo2.completed.evidence.zip',routes:'demo2',checks:'demo2.checks.json',completed:true},
  {suite:'demo3-20260925-browser',evidence:'demo3.refused.evidence.zip',completed:false,diagnostic:true},
  {suite:'demo3-20260925-browser',evidence:'demo3.repaired.evidence.zip',routes:'demo3.repaired',checks:'demo3.repaired.checks.json',completed:true},
  {suite:'dense-20260925-browser',evidence:'dense.completed.evidence.zip',routes:'dense',completed:true},
  {suite:'camera-20260925-browser',evidence:'camera.replanned.evidence.zip',completed:true},
];
const checks:{name:string;pass:boolean}[]=[],artifacts:Record<string,unknown>[]=[],suites:Record<string,unknown>[]=[];
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
for(const name of [...new Set(manifests.map(x=>x.suite))]){
  const report=JSON.parse(await readFile(`${root}/${name}.result.json`,'utf8'));
  assert.equal(report.passed,true,`${name} must pass`);assert.ok(report.result.checks.length>0&&report.result.checks.every((c:{pass:boolean})=>c.pass));
  suites.push({name,startedAt:report.startedAt,finishedAt:report.finishedAt,passed:true,checks:report.result.checks.length,inputHash:report.result.inputHash??report.result.repaired?.inputHash});
  checks.push(...report.result.checks.map((c:{name:string;pass:boolean})=>({name:`${name}: ${c.name}`,pass:c.pass})));
}
async function fileEvidence(file:string,suite:string){
  const report=suites.find(s=>s.name===suite)!,fileStat=await stat(`${root}/${file}`);
  assert.ok(fileStat.mtimeMs>=Date.parse(String(report.startedAt))-1000&&fileStat.mtimeMs<=Date.parse(String(report.finishedAt))+1000,`${file} freshness`);
  const bytes=await readFile(`${root}/${file}`);
  return {bytes,record:{path:`${root}/${file}`,bytes:bytes.length,sha256:hash(bytes),modifiedAt:fileStat.mtime.toISOString(),suite}};
}
for(const entry of manifests){
  const {bytes,record}=await fileEvidence(entry.evidence,entry.suite),files=readStoredZip(bytes),result=await verifyArchiveFiles(files);
  assert.equal(result.status,entry.diagnostic?'diagnostic-only-not-flight-approved':'passes-declared-model',entry.evidence);
  const reproduce=JSON.parse(files['data/reproduce.json']);assert.equal(reproduce.engine,'0.4.0');
  let run;
  if(entry.completed){run=await verifyMissionRunReport(JSON.parse(files['data/run/report.json']));assert.equal(run.operation.status,'completed');}
  await assert.rejects(verifyArchiveFiles({...files,'data/input/mission.json':files['data/input/mission.json']+' '}),/Контрольная сумма/);
  await writeFile(`${root}/${entry.evidence}.verification.json`,JSON.stringify(result,null,2));
  artifacts.push({...record,kind:'evidence',status:result.status,fileCount:Object.keys(files).length,engineVersion:reproduce.engine,inputHash:reproduce.inputHash,runStatus:run?.operation.status,tamperRejected:true});
  checks.push({name:`${entry.evidence}: current engine, repeated validation, completed/diagnostic semantics, tamper rejection`,pass:true});
  if(entry.routes)for(const ext of ['kml','geojson']){
    const filename=`${entry.routes}.routes-${ext}.zip`,item=await fileEvidence(filename,entry.suite),routes=readStoredZip(item.bytes);
    const paths=Object.keys(files).filter(p=>p.startsWith('data/routes/')&&p.endsWith(`.${ext}`)).sort();assert.ok(paths.length);
    assert.deepEqual(Object.keys(routes).filter(p=>p.endsWith(`.${ext}`)).sort(),paths.map(p=>p.slice('data/routes/'.length)));
    for(const p of paths)assert.equal(routes[p.slice('data/routes/'.length)],files[p]);
    artifacts.push({...item.record,kind:'routes',status:'byte-identical-to-full-archive',routes:paths.length});checks.push({name:`${filename}: byte-identical per-aircraft routes`,pass:true});
  }
  if(entry.checks){const item=await fileEvidence(entry.checks,entry.suite);assert.deepEqual(JSON.parse(item.bytes.toString('utf8')),JSON.parse(files['data/checks/validation.json']));artifacts.push({...item.record,kind:'checks',status:'identical-to-full-archive'});}
}
assert.equal(MISSION_ENGINE_VERSION,'0.4.0');
const summary={status:'pass',engineVersion:MISSION_ENGINE_VERSION,imageId:'sha256:610fd4a5c708e5de21d479a5e78dbd2aa0c0f94bbd30b35b1b2f737f347450a5',checkedAt:new Date().toISOString(),modelOnly:true,flightReady:false,uiChecks:suites.reduce((n,s)=>n+Number(s.checks),0),checks,suites,artifacts,scope:'Fresh isolated UI Demo2, Demo3 refusal and explicit battery repair, dense real obstacles with moved base/flight-boundary reload, changed-camera invalidation/recalculation/approval/run. Demo1 take-03 is preserved and verified separately. Historical 2026-09-24 acceptance is not claimed as current.',limitations:['No physical flight, real imagery, external live weather or radio telemetry tested.','Camera edit revokes approval in UI; archived-profile refusal is covered by current unit regression, not by tampering browser storage.','All possible buttons and arbitrary input combinations are not claimed tested.']};
await writeFile(`${root}/summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({status:summary.status,uiChecks:summary.uiChecks,checks:checks.length,artifacts:artifacts.length}));
