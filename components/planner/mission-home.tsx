'use client';

import { useEffect, useState } from 'react';
import {
  Search,
  MoreHorizontal,
  Download,
  Trash2,
  BookOpen,
  Pencil,
} from 'lucide-react';
import type { SavedMission } from '@/lib/planner/mission-library';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import {
  missionBrowserRows,
  plannedWindowCountdown,
  missionStatusNames,
  type MissionBrowserStatus,
} from '@/lib/planner/mission-browser';
import type { MissionOperationsBoardProps } from './mission-operations-board';
import { InfoHint } from './mission-help';

export type MissionHomeProps = {
  document: MissionDocument;
  dirty?: boolean;
  editing: boolean;
  savedEntries: readonly SavedMission[];
  onEditCurrent: () => void;
  onOpenSaved: (entry: SavedMission) => void;
  onArchive: (entry: SavedMission) => void;
  onRestore: (entry: SavedMission) => void;
  onDelete: (entry: SavedMission) => void;
  onRename: (entry: SavedMission) => void;
  onExport: (document: MissionDocument) => void;
  onCopy: (document: MissionDocument) => void;
  journalAttentionCount?: number;
  onReviewJournal?: () => void;
  operations: MissionOperationsBoardProps;
};
const filters: readonly {
  id: 'all' | 'editing' | 'attention' | 'archived' | MissionBrowserStatus;
  label: string;
}[] = [
  { id: 'all', label: 'Все' },
  { id: 'editing', label: 'Редактируется' },
  { id: 'draft', label: 'Черновики' },
  { id: 'scheduled', label: 'Запланированы' },
  { id: 'running', label: 'Выполняются' },
  { id: 'paused', label: 'Пауза' },
  { id: 'completed', label: 'Завершены' },
  { id: 'cancelled', label: 'Остановлены' },
  { id: 'attention', label: 'Внимание' },
  { id: 'archived', label: 'Архив' },
];
export default function MissionHome(p: MissionHomeProps) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = missionBrowserRows(
    p.savedEntries,
    p.operations.rows,
    {
      document: p.document,
      changed: !!p.dirty,
      editing: p.editing,
    },
    true,
  );
  const match = (row: (typeof rows)[number], key: typeof filter) =>
    key === 'archived'
      ? !!row.archived
      : !row.archived &&
        (key === 'all' ||
          (key === 'editing'
            ? row.editing
            : key === 'attention'
              ? !!row.operation?.safety
              : row.status === key));
  const shown = rows.filter(
    (row) =>
      match(row, filter) &&
      `${row.name} ${row.id}`
        .toLocaleLowerCase('ru')
        .includes(query.trim().toLocaleLowerCase('ru')),
  );
  return (
    <section className="mb-browser" aria-label="Список миссий">
      <div className="mb-search-row">
        <label className="mb-search">
          <Search size={17} />
          <input
            aria-label="Поиск миссий"
            placeholder="Поиск по названию или ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <InfoHint label="Миссии и запуски">
          Одна строка — одна миссия. Черновик ещё не поставлен в очередь.
          Отметка «Редактируется» относится к открытой версии. История запусков
          и их неизменные снимки раскрываются в строке. Плановое время не
          запускает полёт автоматически.
        </InfoHint>
      </div>
      <div className="mb-filters" aria-label="Фильтры миссий">
        {filters.map((f) => {
          const count = rows.filter((row) => match(row, f.id)).length;
          if (
            !count &&
            ![
              'all',
              'draft',
              'scheduled',
              'running',
              'completed',
              'archived',
            ].includes(f.id)
          )
            return null;
          return (
            <button
              key={f.id}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span>{count}</span>
            </button>
          );
        })}
      </div>
      {!!p.journalAttentionCount && (
        <button className="mw-button small" onClick={p.onReviewJournal}>
          Проверить старые снимки · {p.journalAttentionCount}
        </button>
      )}
      <div className="mb-list" aria-label="Найденные миссии">
        {!shown.length && (
          <p className="mb-empty">
            {query ? 'Миссии не найдены.' : 'В этом списке пока нет миссий.'}
          </p>
        )}
        {shown.map((row) => {
          const active = row.runs.some(
            (run) => !['completed', 'cancelled'].includes(run.status),
          );
          const op = row.operation;
          const open = () =>
            op
              ? p.operations.onOpen(op)
              : row.editing
                ? p.onEditCurrent()
                : row.saved && p.onOpenSaved(row.saved);
          return (
            <article
              key={row.id}
              className="mb-record"
              data-mission-id={row.id}
            >
              <div className="mb-row">
                <button className="mb-name" onClick={open}>
                  <strong>{row.name || 'Новая миссия'}</strong>
                  <small>
                    {row.updatedAt
                      ? new Date(row.updatedAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Новая миссия'}
                    {row.editing
                      ? ` · Редактируется${row.changed ? ' · не сохранено' : ''}`
                      : ''}
                  </small>
                </button>
                <span className={`mb-status mb-${row.status}`}>
                  {row.operation?.safety &&
                  !['completed', 'cancelled'].includes(row.status)
                    ? 'Требуется внимание'
                    : row.archived
                      ? 'В архиве'
                      : missionStatusNames[row.status]}
                </span>
                <span
                  className="mb-timing"
                  title={
                    op
                      ? `Плановый период: ${op.document.window.start} — ${op.document.window.end}`
                      : undefined
                  }
                >
                  {op &&
                    (op.status === 'scheduled'
                      ? plannedWindowCountdown(op.document.window.start, clock)
                      : op.status === 'running' || op.status === 'paused'
                        ? `${Math.round((100 * op.progressSec) / Math.max(1, op.candidate.metrics.makespanSec))}% · осталось ${Math.ceil(Math.max(0, op.candidate.metrics.makespanSec - op.progressSec) / 60)} мин модели`
                        : `${Math.round(op.progressSec / 60)} мин модели`)}
                </span>
                <div className="mb-row-actions">
                  <button
                    className="mw-button small"
                    disabled={p.operations.busy}
                    onClick={open}
                  >
                    {op
                      ? ['completed', 'cancelled'].includes(op.status)
                        ? 'Отчёт'
                        : 'Наблюдать'
                      : 'Открыть'}
                  </button>
                  <button
                    className="mw-button square small"
                    aria-label={`Действия: ${row.name}`}
                    aria-expanded={expanded === row.id}
                    onClick={() =>
                      setExpanded(expanded === row.id ? null : row.id)
                    }
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </div>
              </div>
              {expanded === row.id && (
                <div className="mb-detail">
                  <code>{row.id}</code>
                  <div className="mw-actions">
                    {row.saved && row.archived && (
                      <button
                        className="mw-button small mw-action-add"
                        onClick={() => p.onRestore(row.saved!)}
                      >
                        Восстановить
                      </button>
                    )}
                    {row.saved && !active && !row.archived && (
                      <button
                        className="mw-button small"
                        onClick={() => p.onRename(row.saved!)}
                      >
                        Переименовать
                      </button>
                    )}
                    {row.saved && !active && !row.runs.length && (
                      <button
                        className="mw-button small mw-action-remove"
                        onClick={() => p.onDelete(row.saved!)}
                      >
                        Удалить черновик
                      </button>
                    )}
                    {!active && (
                      <button
                        className="mw-button small"
                        onClick={() =>
                          row.editing
                            ? p.onEditCurrent()
                            : row.saved
                              ? p.onOpenSaved(row.saved)
                              : p.onCopy(row.document)
                        }
                      >
                        <Pencil size={14} />
                        Редактировать
                      </button>
                    )}
                    <button
                      className="mw-button small"
                      onClick={() => p.onCopy(row.document)}
                    >
                      Создать копию
                    </button>
                    <button
                      className="mw-button small"
                      onClick={() => p.onExport(row.document)}
                    >
                      <Download size={14} />
                      Миссия JSON
                    </button>
                    {row.saved && !active && !row.archived && (
                      <button
                        className="mw-button small mw-action-remove"
                        onClick={() => p.onArchive(row.saved!)}
                      >
                        <Trash2 size={14} />В архив
                      </button>
                    )}
                  </div>
                  {row.runs.map((run) => (
                    <div className="mb-run" key={run.id}>
                      <span>
                        {new Date(run.createdAt).toLocaleString('ru-RU')} ·{' '}
                        {missionStatusNames[run.status]}
                      </span>
                      <button
                        className="mw-button small"
                        onClick={() => p.operations.onOpen(run)}
                      >
                        Открыть запуск
                      </button>
                      <button
                        className="mw-button small"
                        onClick={() => p.operations.onJournal?.(run)}
                      >
                        <BookOpen size={14} />
                        Журнал
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
