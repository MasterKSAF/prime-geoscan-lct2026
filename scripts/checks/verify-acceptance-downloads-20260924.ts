import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readStoredZip, verifyArchiveFiles } from '../../lib/planner/mission-archive.ts';
import { verifyMissionRunReport } from '../../lib/planner/mission-run-export.ts';
import { parseMissionDocument, sha256 } from '../../lib/planner/mission-schema.ts';

const root='output/playwright/acceptance-2026-09-24/ui';
const results:Record<string,unknown>[]=[];
const fresh=async(file:string,suite:string)=>{
  const run=JSON.parse(await readFile(`${root}/${suite}.result.json`,'utf8'));
  assert.equal(run.passed,true,`${suite} must pass before its files are admitted`);
  const modified=(await stat(`${root}/${file}`)).mtimeMs;
  assert.ok(modified>=Date.parse(run.startedAt)-1000&&modified<=Date.parse(run.finishedAt)+1000,`${file} is not from the latest ${suite}`);
};
const verify=async(file:string,diagnostic=false,completed=true)=>{
  const bytes=await readFile(`${root}/${file}`), files=readStoredZip(bytes);
  const result=await verifyArchiveFiles(files);
  assert.equal(result.status,diagnostic?'diagnostic-only-not-flight-approved':'passes-declared-model');
  const record:Record<string,unknown>={file,status:result.status,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),files:Object.keys(files).length};
  if(completed){
    const report=await verifyMissionRunReport(JSON.parse(files['data/run/report.json']));
    assert.equal(report.operation.status,'completed');
    record.runStatus=report.operation.status;
  }
  const changed={...files,'data/input/mission.json':files['data/input/mission.json']+' '};
  await assert.rejects(verifyArchiveFiles(changed),/Контрольная сумма/);
  record.tamperRejected=true;results.push(record);
  return files;
};
for(const name of ['demo1','demo2','demo3','custom-completed']){
  await fresh(`queue-prod-${name}.evidence.zip`,'queue-plans-20260924-browser');
  const files=await verify(`queue-prod-${name}.evidence.zip`,name==='demo3',name!=='demo3');
  if(name==='demo1'||name==='demo2')for(const ext of ['kml','geojson']){
    await fresh(`queue-prod-${name}-routes-${ext}.zip`,'queue-plans-20260924-browser');
    const routes=readStoredZip(await readFile(`${root}/queue-prod-${name}-routes-${ext}.zip`));
    const keys=Object.keys(files).filter(p=>p.startsWith('data/routes/')&&p.endsWith(`.${ext}`)).sort();
    assert.ok(keys.length);assert.deepEqual(Object.keys(routes).filter(p=>p.endsWith(`.${ext}`)).sort(),keys.map(p=>p.slice('data/routes/'.length)));
    for(const p of keys)assert.equal(routes[p.slice('data/routes/'.length)],files[p]);
    results.push({file:`queue-prod-${name}-routes-${ext}.zip`,status:'byte-identical-to-full-archive',routes:keys.length});
  }
}
for(const n of [1,2,3]){
  await fresh(`acceptance039-demo${n}${n===3?'-diagnostic':'.evidence'}.zip`,'release38-browser');
  const files=await verify(`acceptance039-demo${n}${n===3?'-diagnostic':'.evidence'}.zip`,n===3,n!==3);
  if(n<3){
    await fresh(`acceptance039-demo${n}.checks.json`,'release38-browser');
    await fresh(`acceptance039-demo${n}-run.mission.json`,'release38-browser');
    assert.deepEqual(JSON.parse(await readFile(`${root}/acceptance039-demo${n}.checks.json`,'utf8')),JSON.parse(files['data/checks/validation.json']));
    const input=parseMissionDocument(JSON.parse(await readFile(`${root}/acceptance039-demo${n}-run.mission.json`,'utf8')));
    assert.equal(await sha256(input),await sha256(parseMissionDocument(JSON.parse(files['data/input/mission.json']))));
  }
}
await fresh('dense-completed.evidence.zip','acceptance-dense-20260924-browser');
await verify('dense-completed.evidence.zip');
await fresh('editor-gaps-second-candidate.evidence.zip','acceptance-editor-gaps-20260924-browser');
await verify('editor-gaps-second-candidate.evidence.zip');
for(const file of ['acceptance039-demo1.mp4','acceptance039-demo2.mp4','release-webm-converted.mp4']){
  await fresh(file,file.startsWith('release-webm')?'release-webm-browser':'release38-browser');
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration,format_name:stream=codec_name,width,height,avg_frame_rate','-of','json',`${root}/${file}`],{encoding:'utf8'}));
  assert.ok(Number(probe.format.duration)>1&&probe.streams.some((s:{width:number;height:number})=>s.width>=640&&s.height>=360));
  if(file==='release-webm-converted.mp4')assert.ok(probe.streams.every((s:{avg_frame_rate:string})=>{const[n,d]=s.avg_frame_rate.split('/').map(Number);return n/d>0&&n/d<=30;}),'WebM conversion must not inflate video to 1000 fps');
  results.push({file,status:'readable-video',probe});
}
const report={checkedAt:new Date().toISOString(),status:'pass',modelOnly:true,flightReady:false,results};
await writeFile(`${root}/download-verification.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
