import type { MissionOperation } from './mission-operations.ts';
import { recoveryOptions } from './mission-safety.ts';

type Advance = { type: 'advance'; progressSec: number };
type Decide = { type: 'decide'; policy: 'home' | 'nearest'; reason: 'timeout' };
type Clock = {
  key: string;
  time: number;
  end: number;
  last: number;
  saved: number;
  pending?: Promise<void>;
};
/** All recovery clocks belong to runs, not to the currently visible tab or mission. */
export function createRecoveryClock(port: {
  rows: () => readonly MissionOperation[];
  change: (id: string, action: Advance | Decide) => Promise<unknown>;
  rate: () => number;
  frame: (row: MissionOperation, time: number, playing: boolean) => void;
  error: (error: unknown) => void;
  now?: () => number;
  wallTime?: () => number;
  end?: (row: MissionOperation) => number;
}) {
  const clocks = new Map<string, Clock>(),
    paused = new Set<string>(),
    deciding = new Set<string>(),
    decisionFailed = new Set<string>();
  const now = port.now ?? (() => performance.now()),
    wallTime = port.wallTime ?? Date.now;
  function end(row: MissionOperation) {
    const choice = recoveryOptions(
      row.document,
      row.candidate,
      row.safety!,
    ).find((o) => o.policy === row.safety!.policy);
    if (!choice?.valid)
      throw Error(
        'Проверенный маршрут возврата недоступен. Откройте проверки миссии.',
      );
    return choice.endSec;
  }
  function save(row: MissionOperation, clock: Clock) {
    if (clock.pending) return clock.pending;
    const progressSec = clock.time;
    clock.saved = now();
    clock.pending = port
      .change(row.id, { type: 'advance', progressSec })
      .then(() => undefined)
      .catch((e) => {
        paused.add(row.id);
        port.error(e);
      })
      .finally(() => {
        clock.pending = undefined;
      });
    return clock.pending;
  }
  function tick() {
    const rows = port.rows(),
      present = new Set(rows.map((r) => r.id));
    for (const id of clocks.keys()) if (!present.has(id)) forget(id);
    for (const row of rows) {
      const s = row.safety;
      if (!s || row.status === 'cancelled') continue;
      if (
        s.stage === 'pending' &&
        wallTime() >= Date.parse(s.detectedAt) + 60_000 &&
        !deciding.has(row.id) &&
        !decisionFailed.has(row.id)
      ) {
        deciding.add(row.id);
        void port
          .change(row.id, {
            type: 'decide',
            policy: s.policy,
            reason: 'timeout',
          })
          .catch((e) => {
            decisionFailed.add(row.id);
            port.error(e);
          })
          .finally(() => deciding.delete(row.id));
      }
      if (s.stage !== 'returning') {
        port.frame(row, s.progressSec, false);
        continue;
      }
      try {
        const key = JSON.stringify([
          s.id,
          s.policy,
          s.delaySec,
          s.windMps,
          s.batteryPct,
        ]);
        let clock = clocks.get(row.id);
        if (!clock || clock.key !== key) {
          clock = {
            key,
            time: s.progressSec,
            end: (port.end ?? end)(row),
            last: now(),
            saved: now(),
          };
          clocks.set(row.id, clock);
        }
        const at = now(),
          dt = Math.max(0, Math.min(1, (at - clock.last) / 1000));
        clock.last = at;
        if (!paused.has(row.id))
          clock.time = Math.min(
            clock.end,
            Math.max(s.progressSec, clock.time) + dt * port.rate(),
          );
        port.frame(
          row,
          clock.time,
          !paused.has(row.id) && clock.time < clock.end,
        );
        if (
          !paused.has(row.id) &&
          (at - clock.saved >= 2000 || clock.time === clock.end)
        )
          void save(row, clock);
      } catch (e) {
        if (!paused.has(row.id)) port.error(e);
        paused.add(row.id);
      }
    }
  }
  async function pause(id: string) {
    paused.add(id);
    const clock = clocks.get(id);
    if (!clock) return;
    await clock.pending;
    const row = port.rows().find((r) => r.id === id);
    if (
      row?.safety?.stage === 'returning' &&
      clock.time > row.safety.progressSec
    )
      await save(row, clock);
  }
  function resume(id: string) {
    paused.delete(id);
    const clock = clocks.get(id);
    if (clock) clock.last = now();
  }
  function forget(id: string) {
    clocks.delete(id);
    paused.delete(id);
    deciding.delete(id);
    decisionFailed.delete(id);
  }
  return {
    tick,
    pause,
    resume,
    forget,
    time: (row: MissionOperation) =>
      Math.max(
        row.safety?.progressSec ?? row.progressSec,
        clocks.get(row.id)?.time ?? 0,
      ),
  };
}
