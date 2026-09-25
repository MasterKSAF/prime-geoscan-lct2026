'use client';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import { Pencil, Play, Trash2 } from 'lucide-react';
export default function DemoMissionCards({
  documents,
  rows,
  onEdit,
  onOpen,
  onDelete,
}: {
  documents: MissionDocument[];
  rows: readonly MissionOperation[];
  onEdit: (d: MissionDocument) => void;
  onOpen: (r: MissionOperation) => void;
  onDelete: (id: string) => void;
}) {
  const descriptions = [
    'Съёмка участка: выбор аппаратов, расчёт и выполнение.',
    'Два участка экспертов: съёмка без лишней посадки, обход препятствий и разнесение БВС.',
    'Недостаточный заряд: отказ и варианты исправления.',
  ];
  return (
    <section
      className="expert-demos demo-mission-cards"
      aria-label="Три сценария проверки"
    >
      {documents.map((d, i) => {
        const run = rows.find((r) => r.document.id === d.id);
        return (
          <article className="expert-demo" key={d.id} data-scenario-id={d.id}>
            <small>
              МИССИЯ {i + 1} ·{' '}
              {run
                ? {
                    running: 'Выполняется',
                    paused: 'Пауза',
                    scheduled: 'В плане',
                    completed: 'Завершена',
                    cancelled: 'Остановлена',
                  }[run.status]
                : 'Готова к редактированию'}
            </small>
            <strong>{d.name.replace(/^Демо \d+ · /, '')}</strong>
            <span>{descriptions[i]}</span>
            <div className="mw-actions">
              <button
                className="mw-button primary"
                disabled={!!run}
                title={run ? 'Удалите запуск перед редактированием' : undefined}
                onClick={() => onEdit(d)}
              >
                <Pencil size={15} />
                Редактировать
              </button>
              {run && (
                <>
                  <button className="mw-button" onClick={() => onOpen(run)}>
                    <Play size={15} />
                    Выполнение
                  </button>
                  <button
                    className="mw-button demo-delete"
                    aria-label={`Удалить запуск: ${d.name}`}
                    onClick={() => onDelete(d.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
