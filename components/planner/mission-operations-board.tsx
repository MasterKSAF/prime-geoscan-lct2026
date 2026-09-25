'use client';

import { useState } from 'react';
import { InfoHint } from './mission-help';
import { incidentLabels } from '@/lib/planner/mission-safety';
import { vehicleDisplayName } from '@/lib/planner/mission-vehicle-label';

import {
  deriveOperationVehicleStates,
  getOperationStartBlockers,
  MAX_MISSION_OPERATIONS,
} from '@/lib/planner/mission-operations';
import type {
  MissionOperation,
  MissionOperationStatus,
  OperationVehicleState,
} from '@/lib/planner/mission-operations';

export type MissionOperationsBoardProps = {
  rows: readonly MissionOperation[];
  selectedId?: string | null;
  busy?: boolean;
  error?: string;
  onOpen: (row: MissionOperation) => void;
  onJournal?: (row: MissionOperation) => void;
  onStart?: (row: MissionOperation) => void;
  onPause?: (row: MissionOperation) => void;
  onCancel: (row: MissionOperation) => void;
  onRefresh?: () => void;
  /** Only affects presentation. All rows remain available to start blockers. */
  view?: 'all' | 'active' | 'history';
  compact?: boolean;
};
const labels: Record<MissionOperationStatus, string> = {
  scheduled: 'В очереди',
  running: 'Выполняется',
  paused: 'На паузе',
  completed: 'Завершено',
  cancelled: 'Отменено',
};
const vehicleLabels: Record<OperationVehicleState['status'], string> = {
  disabled: 'Исключён',
  not_assigned: 'Не назначен',
  preparing: 'Подготовка',
  waiting: 'Ожидание старта',
  in_flight: 'В полёте · модель',
  servicing: 'Обслуживание · модель',
  ready: 'Назначенные работы завершены',
  unavailable: 'Готовность не подтверждена',
};
const elapsed = (sec: number) =>
  `${Math.floor(sec / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(sec % 60)
    .toString()
    .padStart(2, '0')}`;
const stamp = (value: string) => new Date(value).toLocaleString('ru-RU');

/** Present only rows returned by the verified operations store. No timers or
 * auto-selection here: the parent owns the one explicit model simulator.
 */
export default function MissionOperationsBoard({
  rows,
  selectedId,
  busy = false,
  error,
  onOpen,
  onJournal,
  onStart,
  onPause,
  onCancel,
  onRefresh,
  view = 'all',
  compact = false,
}: MissionOperationsBoardProps) {
  const [filter, setFilter] = useState<MissionOperationStatus | 'all'>('all');
  const DetailContainer = compact ? 'details' : 'div';
  const isTerminal = (row: MissionOperation) =>
    row.status === 'completed' || row.status === 'cancelled';
  const viewRows = rows.filter((row) =>
    view === 'all'
      ? true
      : view === 'history'
        ? isTerminal(row)
        : !isTerminal(row),
  );
  const visibleRows = viewRows.filter(
    (row) => compact || filter === 'all' || row.status === filter,
  );
  return (
    <section
      className={`mo-board${compact ? ' mo-compact' : ''}`}
      aria-label="Мои миссии — модельные выполнения"
    >
      <div className="mo-header">
        <div>
          <h2>
            {view === 'active'
              ? 'В работе'
              : view === 'history'
                ? 'История'
                : 'Очередь и история'}{' '}
            <InfoHint label="Статусы миссий">
              Сохранённые миссии находятся отдельно. Здесь только подтверждённые
              планы: в очереди, в симуляции и завершённые. Очередь запускается
              оператором; после закрытия страницы симуляция не продолжается.
              Чтобы добавить выполнение, рассчитайте и подтвердите план. В
              истории остаются завершённые и остановленные миссии; модельное
              время не меняется само по реальным часам.
            </InfoHint>
          </h2>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="mw-button"
            disabled={busy}
            onClick={onRefresh}
          >
            {compact ? 'Обновить' : 'Обновить журнал'}
          </button>
        )}
      </div>
      {!compact && (
        <div className="mo-stats" aria-label="Состояния выполнений">
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            <strong>{viewRows.length}</strong>
            <span>Все</span>
          </button>
          {(Object.keys(labels) as MissionOperationStatus[])
            .filter(
              (status) =>
                view === 'all' ||
                (view === 'history'
                  ? ['completed', 'cancelled'].includes(status)
                  : !['completed', 'cancelled'].includes(status)),
            )
            .map((status) => (
              <button
                type="button"
                key={status}
                data-status={status}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                <strong>
                  {viewRows.filter((row) => row.status === status).length}
                </strong>
                <span>{labels[status]}</span>
              </button>
            ))}
        </div>
      )}
      {error && (
        <p className="mw-alert error" role="alert">
          {error}
        </p>
      )}
      {!viewRows.length && (
        <div className="mo-empty">
          <h3>
            {view === 'history'
              ? 'Завершённых выполнений пока нет'
              : 'Выполнений пока нет'}
          </h3>
        </div>
      )}
      {!!viewRows.length && !visibleRows.length && (
        <output className="mo-empty">В этом разделе миссий нет.</output>
      )}
      <div className="mo-list">
        {visibleRows.map((row) => {
          const terminal =
            row.status === 'completed' || row.status === 'cancelled';
          const blockers = getOperationStartBlockers(row, rows);
          const duration = row.candidate.metrics.makespanSec;
          const vehicles = deriveOperationVehicleStates(row);
          return (
            <article
              className={`mo-run ${selectedId === row.id ? 'mo-selected' : ''}`}
              key={row.id}
              aria-label={`Выполнение ${row.document.name}`}
            >
              <div className="mo-run-top">
                <div>
                  <h3>{row.document.name}</h3>
                </div>
                <span className={`mo-status mo-${row.status}`}>
                  {row.safety
                    ? row.status === 'cancelled'
                      ? 'Остановлено'
                      : row.safety.stage === 'landed'
                        ? 'Возврат завершён'
                        : 'Нештатное событие'
                    : labels[row.status]}
                </span>
              </div>
              <div className="mo-progress">
                <label htmlFor={`operation-progress-${row.id}`}>
                  Модельное время{' '}
                  <strong>
                    {elapsed(row.progressSec)} / {elapsed(duration)}
                  </strong>
                </label>
                <progress
                  id={`operation-progress-${row.id}`}
                  value={row.progressSec}
                  max={duration}
                />
              </div>
              {row.safety && !terminal && (
                <output className="mo-blockers" role="alert">
                  <strong>{incidentLabels[row.safety.kind]}</strong>
                  <span>
                    {' '}
                    ·{' '}
                    {row.safety.stage === 'landed'
                      ? 'Возврат завершён. Завершите выполнение.'
                      : row.safety.stage === 'returning'
                        ? 'Выполняется модельный возврат.'
                        : 'Требуется внимание оператора.'}
                  </span>
                </output>
              )}
              {!terminal && row.status !== 'running' && blockers.length > 0 && (
                <output className="mo-blockers">
                  <strong>Запуск заблокирован</strong>
                  <ul>
                    {blockers.map((blocker, index) => (
                      <li key={`${blocker.code}-${index}`}>{blocker.detail}</li>
                    ))}
                  </ul>
                </output>
              )}
              {compact && (
                <div className="mo-actions mo-primary-actions">
                  <button
                    type="button"
                    className="mw-button"
                    disabled={busy}
                    onClick={() => onOpen(row)}
                  >
                    Открыть выполнение
                  </button>
                  {onPause && row.status === 'running' && (
                    <button
                      type="button"
                      className="mw-button"
                      disabled={busy}
                      onClick={() => onPause(row)}
                    >
                      Пауза
                    </button>
                  )}
                </div>
              )}
              <DetailContainer className={compact ? 'mo-row-more' : undefined}>
                {compact && <summary>Подробности и действия</summary>}
                {onJournal && (
                  <button
                    type="button"
                    className="mw-button"
                    onClick={() => onJournal(row)}
                  >
                    Журнал этой миссии
                  </button>
                )}
                <details className="mw-details">
                  <summary>Данные сохранённого выполнения</summary>
                  <p className="mo-id">
                    Миссия {row.document.id} · выполнение {row.id} · версия{' '}
                    {row.revision}
                  </p>
                  <p className="mo-caption">
                    Последняя контрольная точка: {stamp(row.updatedAt)}.{' '}
                    {row.status === 'running'
                      ? 'Непрерывность выполнения и работа другой вкладки не подтверждены. После открытия зафиксируйте паузу и возобновите явно.'
                      : ''}
                  </p>
                  <p className="mo-caption">
                    План:{' '}
                    {row.candidate.id === 'balanced'
                      ? 'Уложиться в срок'
                      : row.candidate.objective === 'makespan'
                        ? 'Раньше завершить'
                        : 'Снизить общий налёт'}{' '}
                    · {row.candidate.metrics.sortieCount} вылетов · налёт{' '}
                    {elapsed(row.candidate.metrics.flightTimeSec)} · ядро{' '}
                    {row.engineVersion}
                  </p>
                </details>
                <details className="mo-vehicles">
                  <summary>
                    БВС и доступность в этом снимке · {vehicles.length}
                  </summary>
                  <ul>
                    {vehicles.map((vehicle) => {
                      const profile = row.document.scenario.vehicles.find(
                        (item) => item.id === vehicle.vehicleId,
                      );
                      return (
                        <li key={vehicle.vehicleId}>
                          <div>
                            <strong>
                              {profile
                                ? vehicleDisplayName(profile)
                                : vehicle.name}
                            </strong>
                            <span>{vehicleLabels[vehicle.status]}</span>
                          </div>
                          <p>{vehicle.detail}</p>
                          <small>
                            {vehicle.batteryId
                              ? `${vehicle.batteryId}: ${vehicle.batteryPct?.toFixed(1)}% · расчёт. `
                              : ''}
                            {vehicle.readyAtSec !== null
                              ? `Ресурс/обслуживание не ранее t=${elapsed(vehicle.readyAtSec)}. `
                              : ''}
                            {vehicle.nextSortieSec !== null
                              ? `Следующий вылет t=${elapsed(vehicle.nextSortieSec)}.`
                              : ''}
                          </small>
                          {!row.document.planning.batteryPolicy && (
                            <small>
                              АКБ доступны в модели:{' '}
                              {
                                vehicle.batteries.filter(
                                  (b) => b.status === 'ready',
                                ).length
                              }
                              /{vehicle.batteries.length}; зарядка:{' '}
                              {
                                vehicle.batteries.filter(
                                  (b) => b.status === 'charging',
                                ).length
                              }
                              .
                            </small>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
                <div className="mo-actions">
                  {!compact && (
                    <button
                      type="button"
                      className="mw-button"
                      disabled={busy}
                      onClick={() => onOpen(row)}
                    >
                      Открыть выполнение
                    </button>
                  )}
                  {onStart &&
                    (row.status === 'scheduled' || row.status === 'paused') && (
                      <button
                        type="button"
                        className="mw-button primary"
                        disabled={busy || blockers.length > 0}
                        onClick={() => onStart(row)}
                      >
                        {row.status === 'paused'
                          ? 'Продолжить симуляцию'
                          : 'Начать симуляцию'}
                      </button>
                    )}
                  {!compact && onPause && row.status === 'running' && (
                    <button
                      type="button"
                      className="mw-button"
                      disabled={busy}
                      onClick={() => onPause(row)}
                    >
                      Пауза
                    </button>
                  )}
                  {!terminal &&
                    (!row.safety ||
                      ['landed', 'blocked', 'crashed'].includes(
                        row.safety.stage,
                      )) && (
                      <button
                        type="button"
                        className="mw-button danger"
                        disabled={busy}
                        onClick={() => onCancel(row)}
                      >
                        Отменить выполнение
                      </button>
                    )}
                </div>
              </DetailContainer>
            </article>
          );
        })}
      </div>
      <p className="mo-caption mo-local-note">
        В журнале: {rows.length}/{MAX_MISSION_OPERATIONS}
        <InfoHint label="Где хранится журнал миссий">
          История симуляции хранится локально в этом браузере, только на этом
          устройстве. Заряд и доступность в снимке — расчётные значения, а не
          измерения с борта.
        </InfoHint>
      </p>
    </section>
  );
}
