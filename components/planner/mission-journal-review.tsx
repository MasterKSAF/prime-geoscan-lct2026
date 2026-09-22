'use client';

import { useState } from 'react';
import { Archive, Download, FilePenLine } from 'lucide-react';
import type { RejectedMissionOperation } from '@/lib/planner/mission-operations';
import { InfoHint } from './mission-help';

export type MissionJournalReviewProps = {
  rejected: readonly RejectedMissionOperation[];
  busy?: boolean;
  onExport: (id: string) => void | Promise<void>;
  onRecover: (id: string) => void | Promise<void>;
  onArchive: (id: string, originalHash: string) => void | Promise<void>;
};

/** A quarantined snapshot is history, never a runnable plan or live telemetry. */
export default function MissionJournalReview({
  rejected,
  busy = false,
  onExport,
  onRecover,
  onArchive,
}: MissionJournalReviewProps) {
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  async function act(key: string, action: () => void | Promise<void>) {
    if (pending || busy) return;
    setPending(key);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure({
        key,
        message:
          error instanceof Error
            ? error.message
            : 'Действие не выполнено. Исходная запись сохранена.',
      });
    } finally {
      setPending(null);
    }
  }
  if (!rejected.length)
    return (
      <p className="mjr-empty">Архивных записей, требующих пересчёта, нет.</p>
    );
  return (
    <section className="mjr-review" aria-label="Архивные записи журнала">
      <div className="mjr-list">
        {rejected.map((row, index) => {
          const key = `${row.id ?? index}:${row.originalHash ?? 'unverified'}`;
          const disabled = busy || pending !== null;
          const canArchive =
            row.id !== null &&
            row.originalHash !== null &&
            row.blocksExecution &&
            !row.archived &&
            row.status !== null &&
            ['scheduled', 'running', 'paused'].includes(row.status);
          return (
            <article
              className="mjr-record"
              key={key}
              aria-label={`Запись ${row.id ?? index + 1}`}
            >
              <header className="mjr-heading">
                <div>
                  <h3>
                    {row.name}{' '}
                    <InfoHint label="Архивная запись">
                      Исходная запись сохранена. Её старый план не запускается;
                      задание можно открыть и пересчитать заново.
                    </InfoHint>
                  </h3>
                  <span className="mjr-id">{row.id ?? 'ID не распознан'}</span>
                </div>
                <span
                  className={`mjr-status${row.blocksExecution ? ' mjr-status-blocked' : ''}`}
                >
                  {row.archived
                    ? 'Остановлена и сохранена'
                    : row.blocksExecution
                      ? 'Нужна проверка остановки'
                      : 'Нужен пересчёт'}
                </span>
              </header>
              <details className="mjr-reason">
                <summary>
                  {row.archived
                    ? 'Что сохранено'
                    : 'Почему старый план не запускается'}
                </summary>
                <p>{row.reason}</p>
                {row.checkIds.length > 0 && (
                  <p className="mjr-codes">
                    Проверки: <code>{row.checkIds.join(', ')}</code>
                  </p>
                )}
              </details>
              <div className="mjr-actions">
                <button
                  type="button"
                  className="mw-button"
                  disabled={disabled || row.id === null}
                  onClick={() => void act(key, () => onExport(row.id!))}
                >
                  <Download size={14} /> Скачать исходную запись
                </button>
                <button
                  type="button"
                  className="mw-button"
                  disabled={
                    disabled || row.id === null || row.originalHash === null
                  }
                  onClick={() => void act(key, () => onRecover(row.id!))}
                >
                  <FilePenLine size={14} /> Открыть миссию для пересчёта
                </button>
              </div>
              {canArchive && (
                <div className="mjr-stop">
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed[key] ?? false}
                      disabled={disabled}
                      onChange={(event) =>
                        setConfirmed((value) => ({
                          ...value,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      Подтверждаю: старая симуляция остановлена. Это не команда
                      реальному БВС.
                    </span>
                  </label>
                  <p>
                    Оригинал останется в архиве. Заряд, координаты и готовность
                    БВС не изменятся — при необходимости подтвердите их отдельно
                    в парке.
                  </p>
                  <button
                    type="button"
                    className="mw-button"
                    disabled={disabled || !confirmed[key]}
                    onClick={() =>
                      void act(key, () => onArchive(row.id!, row.originalHash!))
                    }
                  >
                    <Archive size={14} /> Зафиксировать остановку
                  </button>
                </div>
              )}
              {row.blocksExecution && !canArchive && (
                <p className="mjr-notice">
                  Целостность или состояние записи не подтверждены. Сначала
                  сохраните исходный файл для проверки; автоматическая остановка
                  недоступна.
                </p>
              )}
              {failure?.key === key && (
                <p className="mjr-notice" role="alert">
                  {failure.message}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
