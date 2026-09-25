import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareDemoDocument, DEMO_IDS } from '../../lib/planner/demo-session.ts';
import { MISSION_ENGINE_VERSION, parseMissionDocument } from '../../lib/planner/mission-schema.ts';
import { solveMissionDocument } from '../../lib/planner/mission-engine.ts';
import { missionImprovementTrials } from '../../lib/planner/mission-insights.ts';
import { validateExportedCandidate } from '../../lib/planner/mission-validation.ts';
const results=[];
for(const id of DEMO_IDS){
  const document=prepareDemoDocument(parseMissionDocument(JSON.parse(await readFile(`public/planner/scenarios/${id}.mission.json`,'utf8'))));
  const result=await solveMissionDocument(document);
  const plans=await Promise.all(result.candidates.map(async c=>({id:c.id,status:c.status,vehicleCount:c.metrics.vehicleCount,
    elapsedSec:c.metrics.makespanSec,flightTimeSec:c.metrics.flightTimeSec,
    maxAltitudeM:Math.max(0,...c.sorties.flatMap(s=>s.segments.flatMap(p=>[p.altitudeFromM,p.altitudeToM]))),
    failures:(await validateExportedCandidate(result.document,c)).filter(c=>c.status==='fail').map(c=>c.id),
  })));
  for(const p of plans) if(p.status==='feasible_model'){assert.ok(p.maxAltitudeM<150);assert.equal(p.failures.length,0);}
  let repair:unknown=null;
  if(id==='demo-03-repair'){
    assert.ok(plans.every(p=>p.status!=='feasible_model'));
    const trial=missionImprovementTrials(result.document,result.candidates[0]).find(t=>t.id.startsWith('battery-full-'));assert.ok(trial);
    const checked=await solveMissionDocument(trial.document), best=checked.candidates.find(c=>c.status==='feasible_model');assert.ok(best);
    assert.equal((await validateExportedCandidate(checked.document,best)).filter(c=>c.status==='fail').length,0);
    assert.ok(document.scenario.vehicles.some(v=>v.batteryPct<100),'hypothesis does not overwrite original charge');
    repair={id:trial.id,title:trial.title,status:best.status,vehicleCount:best.metrics.vehicleCount};
  } else assert.ok(plans.some(p=>p.status==='feasible_model'));
  results.push({id,declaredWorkHeightsM:document.jobs.map(j=>j.job.altitudeM),plans,repair});
}
console.log(JSON.stringify({version:MISSION_ENGINE_VERSION,checkedAt:new Date().toISOString(),results},null,2));
