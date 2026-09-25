import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source=process.argv[2];
if(!source||!path.isAbsolute(source))throw Error('Supply the absolute source-only build directory');
const manifestPath=path.join(source,'../SOURCE-CANDIDATE.json');
const manifest=await fs.readFile(manifestPath);
const docker=process.env.DOCKER_EXE??'docker';
const run=(...args)=>execFileSync(docker,args,{encoding:'utf8',windowsHide:true}).trim();
const image=JSON.parse(run('image','inspect','prime-planner:acceptance-final-20260924'))[0];
const containerId=run('compose','-f','compose.planner.yaml','ps','-q','planner');
if(!containerId)throw Error('Planner service is not running');
const container=JSON.parse(run('inspect',containerId))[0];
if(container.Image!==image.Id)throw Error('Running service does not use the tested image');
const response=await fetch('http://127.0.0.1:3016/api/planner/health');
const health=await response.json();
if(!response.ok||health.missionEngineVersion!=='0.3.9')throw Error('Unexpected runtime health');
const result={startedAt:new Date().toISOString(),imageTag:'prime-planner:acceptance-final-20260924',
  imageId:image.Id,repoDigests:image.RepoDigests,imageCreated:image.Created,
  containerId:container.Id,containerStartedAt:container.State.StartedAt,
  memoryBytes:container.HostConfig.Memory,nanoCpus:container.HostConfig.NanoCpus,
  sourceDirectory:source,sourceCandidateManifestSha256:createHash('sha256').update(manifest).digest('hex'),
  health,sourceCandidate:JSON.parse(manifest),
  note:'Fresh source-copy build; no Git commit, push, publication, or freeze. Browser suites must start after this marker.'};
await fs.writeFile('output/playwright/acceptance-2026-09-24/engine/final-runtime.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({startedAt:result.startedAt,imageId:result.imageId,health},null,2));
