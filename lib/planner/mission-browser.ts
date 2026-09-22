import type { MissionDocument } from './mission-schema.ts';
import type { SavedMission } from './mission-library.ts';
import type { MissionOperation } from './mission-operations.ts';

export type MissionBrowserStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';
export function plannedWindowCountdown(start: string, now: number) {
  const minutes = Math.ceil((Date.parse(start) - now) / 60000);
  if (!Number.isFinite(minutes)) return 'Время не определено';
  if (minutes <= 0) return 'Плановое время наступило · запуск вручную';
  return `До окна ${Math.floor(minutes / 60)} ч ${minutes % 60} мин · запуск вручную`;
}
export type MissionBrowserRow = {
  id: string;
  name: string;
  document: MissionDocument;
  status: MissionBrowserStatus;
  editing: boolean;
  changed: boolean;
  updatedAt: string;
  saved?: SavedMission;
  operation?: MissionOperation;
  runs: MissionOperation[];
  archived?: boolean;
};
export const missionStatusNames: Record<MissionBrowserStatus, string> = {
  draft: 'Черновик',
  scheduled: 'Запланирована',
  running: 'Выполняется',
  paused: 'На паузе',
  completed: 'Завершена',
  cancelled: 'Остановлена',
};
/** Join by persistent identity, never by name. Runs and draft revisions stay separate. */
export function missionBrowserRows(
  saved: readonly SavedMission[],
  operations: readonly MissionOperation[],
  current?: { document: MissionDocument; changed: boolean; editing: boolean },
  includeArchived = false,
): MissionBrowserRow[] {
  const rows = new Map<string, MissionBrowserRow>();
  for (const item of [...saved]
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    .filter((s) => includeArchived || !s.archived))
    rows.set(item.document.revisionSource?.rootMissionId ?? item.id, {
      id: item.document.revisionSource?.rootMissionId ?? item.id,
      name: item.document.name,
      document: item.document,
      status: 'draft',
      editing: false,
      changed: false,
      updatedAt: item.savedAt,
      saved: item,
      runs: [],
      archived: item.archived,
    });
  for (const op of [...operations].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )) {
    let row = rows.get(
      op.document.revisionSource?.rootMissionId ?? op.document.id,
    );
    if (!row) {
      row = {
        id: op.document.revisionSource?.rootMissionId ?? op.document.id,
        name: op.document.name,
        document: op.document,
        status: op.status,
        editing: false,
        changed: false,
        updatedAt: op.updatedAt,
        runs: [],
      };
      rows.set(row.id, row);
    }
    row.runs.push(op);
    const active = (o: MissionOperation) =>
      !['completed', 'cancelled'].includes(o.status);
    if (!row.operation || (active(op) && !active(row.operation)))
      row.operation = op;
    row.status = row.operation.status;
    if (op.updatedAt > row.updatedAt) row.updatedAt = op.updatedAt;
  }
  if (current?.editing) {
    const d = current.document,
      row = rows.get(d.revisionSource?.rootMissionId ?? d.id);
    if (row) {
      row.editing = true;
      row.changed = current.changed;
      row.name = d.name;
      row.document = d;
    } else
      rows.set(d.id, {
        id: d.id,
        name: d.name,
        document: d,
        status: 'draft',
        editing: true,
        changed: current.changed,
        updatedAt: '',
        runs: [],
      });
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(b.editing && b.changed) - Number(a.editing && a.changed) ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.id.localeCompare(b.id),
  );
}
