import type { MissionOperation } from './mission-operations.ts';

export type OperationJournalSource = Pick<
  MissionOperation,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'startedAt'
  | 'finishedAt'
  | 'status'
  | 'progressSec'
  | 'safety'
> & { candidate: Pick<MissionOperation['candidate'], 'events'> };

const statuses: Record<MissionOperation['status'], string> = {
  scheduled: 'В очереди',
  running: 'Идёт симуляция',
  paused: 'Пауза',
  completed: 'Завершена',
  cancelled: 'Остановлена',
};

/** A read-only projection of one verified checkpoint, never telemetry or a fabricated action history. */
export function operationJournal(row: OperationJournalSource) {
  const cutoff = row.startedAt
    ? Math.min(row.progressSec, row.safety?.modelTimeSec ?? row.progressSec)
    : -1;
  const control = [
    {
      at: row.createdAt,
      text: 'План подтверждён и поставлен в очередь',
      kind: 'checkpoint',
    },
  ];
  if (row.startedAt)
    control.push({
      at: row.startedAt,
      text: 'Начало симуляции',
      kind: 'checkpoint',
    });
  for (const event of row.safety?.events ?? [])
    control.push({ ...event, kind: 'incident' });
  if (row.finishedAt)
    control.push({
      at: row.finishedAt,
      text: statuses[row.status],
      kind: 'checkpoint',
    });
  else if (row.updatedAt !== row.createdAt)
    control.push({
      at: row.updatedAt,
      text: `Последнее сохранённое состояние: ${statuses[row.status]}`,
      kind: 'checkpoint',
    });
  return {
    operationId: row.id,
    modelOnly: true as const,
    status: statuses[row.status],
    progressSec: row.progressSec,
    modelEvents: row.candidate.events.filter(
      (event) => event.timeSec <= cutoff,
    ),
    controlEvents: control.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  };
}
