import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='tmp/resources37', output='docs/planner/release-0.3.7-evidence';
await fs.mkdir(output,{recursive:true});
const browser=[];
for(const name of ['browser-production','regression-production','recovery-returned','recovery-blocked']) {
  const raw=await fs.readFile(`${root}/${name}.log`,'utf8');
  const line=raw.split(/\r?\n/).find(l=>l.startsWith('{"checks"'));
  if(!line)throw Error(`No result: ${name}`);
  const r=JSON.parse(line);
  if(r.checks.some(c=>!c.pass)||r.errors?.length)throw Error(`Browser failure: ${name}`);
  await fs.writeFile(`${output}/${name}.json`,JSON.stringify(r,null,2)+'\n');
  browser.push({name,passed:r.checks.length,failed:0,evidence:`release-0.3.7-evidence/${name}.json`});
}
const archives=[];
for(const name of ['archive-demo2','archive-demo2-linux','archive-demo3','archive-returned','archive-blocked']) {
  const raw=await fs.readFile(`${root}/${name}.json`,'utf8'),r=JSON.parse(raw);
  await fs.writeFile(`${output}/${name}.json`,raw);
  archives.push({name,status:r.status,stage:r.stage,checkCounts:(r.checks??[]).reduce((m,c)=>({...m,[c.status]:(m[c.status]??0)+1}),{})});
}
const runtime=JSON.parse(await fs.readFile(`${root}/runtime.json`,'utf8'));
if(runtime.status!=='pass'||runtime.health.missionEngineVersion!=='0.3.7')throw Error('Runtime mismatch');
await fs.writeFile(`${output}/runtime.json`,JSON.stringify(runtime,null,2)+'\n');
const logs=['tests-windows.log','docker-build-final.log','typecheck.log','lint.log'];
for(const file of logs)await fs.copyFile(`${root}/${file}`,`${output}/${file}`);
for(const file of ['tests-windows.log','docker-build-final.log']) {
  const log=await fs.readFile(`${root}/${file}`,'utf8');
  if(!/tests 600/.test(log)||!/pass 600/.test(log)||!/fail 0/.test(log))throw Error('Test totals mismatch: '+file);
}
const artifacts=[];
for(const file of ['0.3.7-demo2-evidence.zip','0.3.7-demo3-evidence.zip','0.3.7-returned.incident.zip','0.3.7-blocked.incident.zip','0.3.7-demo2.mp4']) {
  const path=`output/playwright/${file}`,bytes=await fs.readFile(path);
  artifacts.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const report={version:'0.3.7',checkedAt:new Date().toISOString(),status:'pass',frozen:false,committed:false,pushed:false,
  unitTests:{windows:600,dockerLinux:600,failed:0},browser:{passed:browser.reduce((n,b)=>n+b.passed,0),failed:0,groups:browser},archives,
  runtime:{imageId:runtime.imageId,files:runtime.files,mismatches:runtime.mismatches,health:runtime.health},artifacts,
  limits:['Model checks, not physical flight validation or guaranteed jury score.','Search is budget limited; no global optimum claim.','Presentation is a working draft pending team details.']};
await fs.writeFile('docs/planner/release-0.3.7-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,tests:report.unitTests,browser:report.browser.passed,archives}));
