import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import type {MissionResult} from '../lib/planner/mission-schema.ts';
const first=process.argv[2]??'output/mission-docker-verification',second=process.argv[3]??'output/mission-docker-repeat';
const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const one=await read(`${first}/runtime.json`) as {imageId:string;containerId:string};
const two=await read(`${second}/runtime.json`) as {imageId:string;containerId:string};
assert.equal(one.imageId,two.imageId);assert.notEqual(one.containerId,two.containerId);
const checks=[];
for(const area of [1,10,100]){
 const a=await read(`${first}/result-${area}km2.json`) as MissionResult,b=await read(`${second}/result-${area}km2.json`) as MissionResult;
 assert.equal(a.inputHash,b.inputHash);
 const stable=(r:MissionResult)=>r.candidates.map(c=>({objective:c.objective,status:c.status,sorties:c.sorties,metrics:c.metrics,jobCoverage:c.jobCoverage,checks:c.checks}));
 assert.deepEqual(stable(a),stable(b));
 checks.push({areaKm2:area,inputHash:a.inputHash,identical:['objectives','statuses','sorties','metrics','coverage','checks']});
}
const report={createdAt:new Date().toISOString(),status:'pass',imageId:one.imageId,firstContainer:one.containerId,secondContainer:two.containerId,checks,
 scope:'Two fresh local containers from the same image; not two clean release builds or proof of cross-platform performance.'};
await writeFile(`${second}/reproducibility.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
