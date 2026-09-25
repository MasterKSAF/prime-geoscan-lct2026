'use client';

import { BookOpen, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { getOperationStartBlockers } from '@/lib/planner/mission-operations';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import { InfoHint } from './mission-help';

const examples = [
  { id: 'demo-01-survey', name: 'Съёмка участка' },
  { id: 'demo-02-expert-obstacles', name: 'Препятствия экспертов' },
] as const;

export function operationLabel(row: MissionOperation): string {
  if (row.safety && row.status !== 'cancelled') {
    if (row.safety.stage === 'landed') return 'Возврат завершён';
    if (row.safety.stage === 'returning') return 'Возврат';
    return 'Требуется внимание';
  }
  return {
    scheduled: 'В очереди',
    paused: 'На паузе',
    running: 'Выполняется',
    completed: 'Завершено',
    cancelled: 'Остановлено',
  }[row.status];
}

/** Navigation only: never creates operations or starts an example automatically. */
export default function MissionExecutionQueue({
  rows,
  selectedId,
  busy = false,
  startBlocked = false,
  onOpen,
  onStart,
  onOpenExample,
  onJournal,
  onOpenAll,
  compact = false,
  onDelete,
}: {
  rows: readonly MissionOperation[];
  selectedId?: string | null;
  busy?: boolean;
  startBlocked?: boolean;
  onOpen: (row: MissionOperation) => void;
  onStart: (row: MissionOperation) => void;
  onOpenExample: (id: string) => void;
  onJournal: (row: MissionOperation) => void;
  onOpenAll: () => void;
  compact?: boolean;
  onDelete?: (row: MissionOperation) => void;
}) {
  const [examplesOpen, setExamplesOpen] = useState(false);
  const selected =
    rows.find((row) => row.id === selectedId) ??
    rows.find((row) => row.status === 'running');
  const remaining = rows.filter(
    (row) =>
      row.id !== selected?.id &&
      (row.status === 'scheduled' || row.status === 'paused'),
  );
  const shown = [...(selected ? [selected] : []), ...remaining].slice(0, 3);
  if (compact)
    return rows.length ? (
      <section className="demo-run-picker" aria-label="Выполняемые миссии">
        {rows.map((row) => (
          <div key={row.id}>
            <button
              className="mw-button"
              aria-pressed={row.id === selectedId}
              disabled={busy}
              onClick={() => onOpen(row)}
            >
              <span>{row.document.name}</span>
              <small>{operationLabel(row)}</small>
            </button>
            {onDelete && (
              <button
                className="mw-button demo-delete"
                disabled={busy}
                aria-label={`Удалить из выполнения: ${row.document.name}`}
                onClick={() => onDelete(row)}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </section>
    ) : null;
  return (
    <section className="meq-strip" aria-label="Выбор миссии для выполнения">
      <div className="meq-heading">
        <strong>
          Миссии
          <InfoHint label="Выбор выполнения и журнал">
            Здесь выбранная миссия и до двух ожидающих запусков. «Открыть»
            переключает карту и показатели, значок журнала открывает события
            только этой миссии. Запуск выполняется отдельно после проверки
            ресурсов и безопасности; переключение само по себе не запускает
            полёт. Переключение на другую миссию ставит текущую симуляцию на
            паузу. Открытие журнала не переключает миссию. Готовые примеры
            сначала требуют расчёта и подтверждения.
          </InfoHint>
        </strong>
        <div className="meq-actions">
          {!!rows.length && (
            <button
              type="button"
              className="meq-all"
              aria-pressed={examplesOpen}
              onClick={() => setExamplesOpen((value) => !value)}
            >
              {examplesOpen ? 'К запускам' : 'Демо-миссии'}
            </button>
          )}
          <button type="button" className="meq-all" onClick={onOpenAll}>
            Выбрать запуск{rows.length ? ` · ${rows.length}` : ''}
          </button>
        </div>
      </div>
      <div className="meq-cards">
        {!rows.length || examplesOpen ? (
          examples.map((example) => (
            <article
              key={example.id}
              className="meq-card meq-example"
              data-template-id={example.id}
            >
              <div className="meq-copy">
                <strong title={example.name}>{example.name}</strong>
                <span className="meq-meta">Пример · нужен расчёт</span>
              </div>
              <button
                type="button"
                className="meq-open"
                disabled={busy}
                onClick={() => onOpenExample(example.id)}
                aria-label={`Подготовить пример: ${example.name}`}
              >
                Подготовить
              </button>
            </article>
          ))
        ) : shown.length ? (
          shown.map((row) => {
            const canStartState =
              row.status === 'scheduled' || row.status === 'paused';
            const blockers = canStartState
              ? getOperationStartBlockers(row, rows)
              : [];
            const blocked =
              canStartState && (startBlocked || blockers.length > 0);
            const selectedRow = row.id === selectedId;
            const fleetCount = new Set(
              row.candidate.sorties.map((sortie) => sortie.vehicleId),
            ).size;
            return (
              <article
                key={row.id}
                className={`meq-card meq-${row.status}${selectedRow ? ' is-selected' : ''}`}
                data-operation-id={row.id}
                aria-label={`Миссия: ${row.document.name}`}
              >
                <div className="meq-copy">
                  <strong title={row.document.name}>{row.document.name}</strong>
                  <div className="meq-meta">
                    <span className="meq-state">{operationLabel(row)}</span>
                    <span>{fleetCount} БВС</span>
                    {blocked && (
                      <span className="meq-blocked">
                        Запуск заблокирован
                        <InfoHint
                          label={`Причины блокировки запуска: ${row.document.name}`}
                        >
                          {startBlocked
                            ? 'Сохранённое выполнение требует проверки. Откройте центр уведомлений и проверьте старые снимки. '
                            : ''}
                          {blockers.map((item) => item.detail).join(' ')}
                        </InfoHint>
                      </span>
                    )}
                  </div>
                </div>
                <div className="meq-actions">
                  <button
                    type="button"
                    className="meq-open"
                    disabled={busy}
                    onClick={() => onOpen(row)}
                    aria-label={`Открыть миссию: ${row.document.name}`}
                    aria-pressed={selectedRow}
                  >
                    {selectedRow ? 'На карте' : 'Показать на карте'}
                  </button>
                  <button
                    type="button"
                    className="meq-icon"
                    disabled={busy}
                    onClick={() => onJournal(row)}
                    title="Журнал этой миссии"
                    aria-label={`Журнал миссии: ${row.document.name}`}
                  >
                    <BookOpen size={15} />
                  </button>
                  {canStartState && (
                    <button
                      type="button"
                      className="meq-icon meq-start"
                      disabled={busy || blocked}
                      onClick={() => onStart(row)}
                      title={
                        row.status === 'paused'
                          ? 'Продолжить выполнение'
                          : 'Выполнить миссию'
                      }
                      aria-label={`${row.status === 'paused' ? 'Продолжить' : 'Начать'} симуляцию: ${row.document.name}`}
                    >
                      <Play size={15} />
                    </button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <p className="meq-empty">Нет ожидающих миссий.</p>
        )}
      </div>
    </section>
  );
}
