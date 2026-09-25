import { readFile } from 'node:fs/promises';
import { parseMissionDocument } from '../../lib/planner/mission-schema.ts';
import { prepareDemoDocument } from '../../lib/planner/demo-session.ts';
import { solveMissionDocument } from '../../lib/planner/mission-engine.ts';
import { createSafetySession, recoveryOptions } from '../../lib/planner/mission-safety.ts';
for (const id of ['demo-01-survey', 'demo-02-expert-obstacles']) {
  const document = prepareDemoDocument(parseMissionDocument(JSON.parse(await readFile(`public/planner/scenarios/${id}.mission.json`, 'utf8'))));
  const result = await solveMissionDocument(document), candidate = result.candidates[0];
  const s = candidate.sorties[0], segment = s.segments.find(x=>x.phase==='survey')!;
  const row = {document, candidate, progressSec: (segment.startSec+segment.endSec)/2};
  for (const [kind, windMps, batteryPct] of [['wind',4,100],['wind',8,100],['wind',20,100],['battery',1,30],['obstacle',1,100],['sensor',1,100],['deviation',1,100]] as const) {
    const t = performance.now();
    const safety = createSafetySession(row, {id:crypto.randomUUID(),kind,windMps,batteryPct,vehicleId:s.vehicleId},new Date());
    const options = recoveryOptions(document,candidate,safety);
    console.log(JSON.stringify({id,kind,windMps,ms:Math.round(performance.now()-t),stage:safety.stage, options:options.map(o=>({policy:o.policy,valid:o.valid,reason:o.reasons,sorties:o.sorties.length}))}));
  }
}
