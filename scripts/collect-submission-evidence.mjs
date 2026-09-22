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
 ['output/playwright/dispatcher/browser-report.json',25],
 ['output/playwright/eight-points/report.json',18],
 ['output/playwright/eight-parallel/report.json',7],
 ['output/submission-20260922/api/report.json',11],
];
for(const [file,count] of checks){
 const r=await read(file);
 if(r.checks.length!==count||r.checks.some(c=>c.pass===false||c.status==='fail'))throw Error('Failed checks: '+file);
 if(r.status&&r.status!=='pass')throw Error('Failed status: '+file);
 if(!(r.at||r.createdAt).startsWith('2026-09-22'))throw Error('Stale evidence: '+file);
}
const copy=async(from,to)=>{await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(from,to,{recursive:true,force:true});};
await copy('output/mission-benchmark/submission-20260922',path.join(target,'benchmark'));
await copy('output/submission-20260922/api',path.join(target,'api'));
for(const name of ['typecheck.log','unit-tests.log','acceptance.log','clean-docker-build.log','npm-audit.json','benchmark.log','benchmark-verification.log'])
 await copy('output/submission-20260922/'+name,path.join(target,'checks',name));
await copy('output/playwright/dispatcher/browser-report.json',path.join(target,'browser/dispatcher.json'));
await copy('output/playwright/eight-points/report.json',path.join(target,'browser/eight-points.json'));
await copy('output/playwright/eight-parallel/report.json',path.join(target,'browser/parallel.json'));
for(const name of ['run.report.json','run.report.html','01-fleet.png','02-missions.png','03-execution.png','04-report.png','05-mobile.png'])
 await copy('output/playwright/dispatcher/'+name,path.join(target,'browser',name));
await copy('output/playwright/eight-points/revision.png',path.join(target,'browser/revision.png'));
await copy('output/playwright/eight-parallel/two-missions.png',path.join(target,'browser/two-missions.png'));
await copy('output/submission-20260922/run-verification.json',path.join(target,'browser/run-verification.json'));
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
