/**
 * Copies an already completed verification run. Does not run or invent tests.
 * Run from repo root after REVIEW-CHECKLIST.md; existing output stays untouched.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(), target=path.join(root,'docs/planner/submission/evidence');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const checks=[
 ['output/playwright/release-obstacles/browser-report.json',null],
 ['output/release-obstacles-20260922/api/report.json',11],
];
for(const [file,count] of checks){
 const r=await read(file);
 if((count!==null&&r.checks.length!==count)||!r.checks.length||r.checks.some(c=>c.pass===false||c.status==='fail'))throw Error('Failed checks: '+file);
 if(r.status&&r.status!=='pass')throw Error('Failed status: '+file);
 if(!(r.at||r.createdAt).startsWith('2026-09-22'))throw Error('Stale evidence: '+file);
}
const copy=async(from,to)=>{await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(from,to,{recursive:true,force:true});};
await copy('output/mission-benchmark/release-obstacles-20260922',path.join(target,'benchmark'));
await copy('output/release-obstacles-20260922/api',path.join(target,'api'));
for(const name of ['typecheck.log','unit-tests.log','acceptance.log','npm-audit.json','benchmark.log','benchmark-verification.log','obstacle-http.log','obstacle-http-repeat.log'])
 await copy('output/release-obstacles-20260922/'+name,path.join(target,'checks',name));
await copy('output/obstacle-docker-final-build.log',path.join(target,'checks/docker-build.log'));
for(const name of ['browser-report.json','run.report.json','run.report.html','mission.evidence.zip','archive-verification.json','zip-interop.json','run-verification.json'])
 await copy('output/playwright/release-obstacles/'+name,path.join(target,'browser',name));
for(const name of ['editor.png','fleet.png','missions.png','execution.png','report.png','calculated.png','refusal.png','mobile.png'])
 await copy('output/playwright/release-obstacles/'+name,path.join(root,'docs/planner/submission/assets',name));
for(const name of ['verification.json','contingency.json','http-verification.json','expert-mission.evidence.zip'])
 await copy('output/obstacles-20260922/'+name,path.join(target,'obstacles',name));
await copy('output/playwright/obstacles-final/QA.md',path.join(target,'obstacles/browser-layer-qa.md'));
await copy('output/playwright/obstacles-final/final-layer.png',path.join(root,'docs/planner/submission/assets/obstacle-layer.png'));
await copy('output/playwright/obstacles-final/final-console.txt',path.join(target,'obstacles/browser-layer-console.txt'));
const lock=await read('package-lock.json'), inventory=[], notices=[];
for(const [location,p] of Object.entries(lock.packages??{})){
 if(!location)continue;
 const packageName=p.name??location.slice(location.lastIndexOf('node_modules/')+13);
 inventory.push({name:packageName,version:p.version,location,license:p.license??'NOT_DECLARED',dev:!!p.dev,optional:!!p.optional,integrity:p.integrity??null,resolved:p.resolved??null});
 // Retain original, locally installed top-level license/notice texts as evidence.
 try{
  for(const item of await fs.readdir(location,{withFileTypes:true})){
   if(!item.isFile()||!/^(licen[sc]e|copying|notice)(\.|$|-)/i.test(item.name))continue;
   const file=path.join(location,item.name), st=await fs.stat(file);
   if(st.size>512*1024)continue;
   const data=await fs.readFile(file);
   if(data.includes(0))continue;
   notices.push({package:packageName,version:p.version,file:item.name,sha256:createHash('sha256').update(data).digest('hex'),text:data.toString('utf8')});
  }
 }catch{/* Optional platform packages may not be installed locally. */}
}
const generatedAt=new Date().toISOString();
await fs.mkdir(path.join(target,'licenses'),{recursive:true});
await fs.writeFile(path.join(target,'licenses/dependencies.json'),JSON.stringify({schemaVersion:1,generatedAt,source:'package-lock.json',entries:inventory},null,2)+'\n');
await fs.writeFile(path.join(target,'licenses/installed-license-texts.json'),JSON.stringify({schemaVersion:1,generatedAt,claimBoundary:'Top-level LICENSE/COPYING/NOTICE files found locally; not a legal compatibility certification.',entries:notices},null,2)+'\n');
console.log(JSON.stringify({copied:true,dependencyEntries:inventory.length,licenseTexts:notices.length,licenses:[...new Set(inventory.map(p=>p.license))].sort()},null,2));
