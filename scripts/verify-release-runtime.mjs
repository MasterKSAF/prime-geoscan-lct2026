/** Read-only comparison of selected planner source bytes and a running Docker container. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const container=process.argv[2],base=process.argv[3];
if(!/^[a-zA-Z0-9_.-]+$/.test(container??'')||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base??''))throw Error('Pass local container name and loopback URL');
const files=execFileSync('git',['ls-files','-z','app/planner','app/api/planner','components/planner','lib/planner','public/planner'],{encoding:'utf8'}).split('\0').filter(Boolean).sort();
const sha=b=>createHash('sha256').update(b).digest('hex');
const remoteCode="const fs=require('node:fs'),c=require('node:crypto');const files=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(files.map(path=>({path,sha256:c.createHash('sha256').update(fs.readFileSync('/app/'+path)).digest('hex')}))));";
const remote=JSON.parse(execFileSync('docker',['exec','-i',container,'node','-e',remoteCode],{input:JSON.stringify(files),encoding:'utf8'}));
const mismatches=remote.filter(r=>r.sha256!==sha(fs.readFileSync(r.path))).map(r=>r.path);
const health=await(await fetch(base+'/api/planner/health')).json();
const inspection=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
const report={checkedAt:new Date().toISOString(),status:mismatches.length?'fail':'pass',base,container,imageId:inspection.Image,files:files.length,mismatches,health,sourceHashes:remote,claimBoundary:'Selected source byte identity and health only; no flight certification or reproducible image digest guarantee.'};
console.log(JSON.stringify(report,null,2));if(mismatches.length||health.status!=='ok')process.exitCode=1;
