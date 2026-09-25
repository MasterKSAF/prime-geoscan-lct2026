import type { MissionDocument, MissionCandidate } from './mission-schema.ts';
import { recoveryOptions, recoverySnapshot } from './mission-safety.ts';
import type { SafetySession } from './mission-safety.ts';

/** Phase-boundary regression guard, NOT a continuous/all-emergencies certificate. */
export function recoveryPreflight(d: MissionDocument, c: MissionCandidate) {
  const times = [
    ...new Set(
      c.sorties.flatMap((s) =>
        s.segments
          .filter((seg) =>
            ['takeoff', 'transit', 'survey', 'return'].includes(seg.phase),
          )
          .flatMap((seg) => [
            seg.startSec + Math.min(0.1, (seg.endSec - seg.startSec) / 2),
          ]),
      ),
    ),
  ].sort((a, b) => a - b);
  // Always check launch transitions; other phases are evenly sampled in this guard.
  const required = c.sorties.flatMap((s) =>
    s.segments
      .filter((seg) => seg.phase === 'takeoff')
      .map(
        (seg) => seg.startSec + Math.min(0.1, (seg.endSec - seg.startSec) / 2),
      ),
  );
  const selected = [
    ...new Set([
      ...required,
      ...times.filter(
        (_, i) => i % Math.max(1, Math.ceil(times.length / 24)) === 0,
      ),
    ]),
  ].sort((a, b) => a - b);
  const samples: { timeSec: number; valid: boolean; reasons: string[] }[] = [];
  for (const time of selected) {
    const vehicle = recoverySnapshot(d, c, time).find((v) => v.airborne);
    if (!vehicle) continue;
    const s: SafetySession = {
      id: '00000000-0000-4000-8000-000000000001',
      source: 'simulation',
      kind: 'reserve',
      vehicleId: vehicle.vehicleId,
      batteryPct: vehicle.batteryPct,
      windMps: d.scenario.wind.speedMps,
      modelTimeSec: time,
      progressSec: time,
      detectedAt: d.window.start,
      stage: 'pending',
      delaySec: 0,
      policy: 'home',
      decision: 'none',
      events: [
        {
          at: d.window.start,
          text: 'Предпусковая проверка группового возврата',
        },
      ],
    };
    const options = recoveryOptions(d, c, s);
    const valid = options.some((o) => o.valid);
    samples.push({
      timeSec: time,
      valid,
      reasons: valid ? [] : [...new Set(options.flatMap((o) => o.reasons))],
    });
    if (!valid) break;
  }
  return {
    protocol: 'group-recovery-phase-samples-v1',
    valid: samples.length > 0 && samples.every((s) => s.valid),
    samples,
    scope:
      'Контрольные моменты исходной модели; не доказательство возврата из каждой точки при любых изменениях.',
  };
}
