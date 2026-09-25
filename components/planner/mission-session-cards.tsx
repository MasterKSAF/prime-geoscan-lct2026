'use client';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import { workLabels } from '@/lib/planner/mission-editing';
import { Download, Pencil, Play, Trash2, Upload } from 'lucide-react';
export default function MissionSessionCards(p: {
  documents: MissionDocument[];
  rows: readonly MissionOperation[];
  onEdit: (d: MissionDocument) => void;
  onOpen: (r: MissionOperation) => void;
  onDelete: (id: string) => void;
  onRemove: (id: string) => void;
  onDownload: (d: MissionDocument) => void;
  onImport: () => void;
}) {
  const descriptions: Record<string, string> = {
    'demo-01-survey': 'Съёмка участка: выбор аппаратов, расчёт и выполнение.',
    'demo-02-expert-obstacles':
      'Два участка экспертов: обход препятствий и разнесение БВС.',
    'demo-03-repair': 'Недостаточный заряд: отказ и варианты исправления.',
  };
  return (
    <section
      className="expert-demos demo-mission-cards"
      aria-label="Миссии и загрузка"
    >
      {p.documents.map((d, i) => {
        const run = p.rows.find((r) => r.document.id === d.id);
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
                : 'Сохранена в сессии'}
            </small>
            <strong>{d.name.replace(/^Демо \d+ · /, '')}</strong>
            <span>
              {descriptions[d.id] ??
                `${[...new Set(d.jobs.map((j) => workLabels[j.job.type]))].join(' · ')} · участков: ${d.jobs.length}`}
            </span>
            <div className="mw-actions">
              <button className="mw-button primary" onClick={() => p.onEdit(d)}>
                <Pencil size={15} />
                {run ? 'Редактировать копию' : 'Редактировать'}
              </button>
              {run && (
                <button className="mw-button" onClick={() => p.onOpen(run)}>
                  <Play size={15} />
                  Выполнение
                </button>
              )}
              <button
                className="mw-button small"
                aria-label={`Скачать миссию: ${d.name}`}
                onClick={() => p.onDownload(d)}
              >
                <Download size={15} />
              </button>
              <button
                className="mw-button demo-delete"
                aria-label={`${run ? 'Удалить запуск' : 'Удалить миссию'}: ${d.name}`}
                title={
                  run
                    ? 'Удалить выполнение; карточка останется'
                    : 'Удалить карточку миссии'
                }
                onClick={() => (run ? p.onDelete(d.id) : p.onRemove(d.id))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        );
      })}
      <article className="expert-demo mission-upload-card">
        <button className="mw-button primary" onClick={p.onImport}>
          <Upload size={22} />
          Загрузить миссию
        </button>
        <span>Новая карточка из JSON. Существующие миссии сохранятся.</span>
        <a
          className="mw-button small"
          href="/planner/scenarios/demo-01-survey.mission.json"
          download
        >
          Скачать образец JSON
        </a>
      </article>
    </section>
  );
}
