'use client';
import { useId, useState } from 'react';
import { Plus, Trash2, Upload, MoreHorizontal, Save } from 'lucide-react';
import type { MissionDocument, MissionJob } from '@/lib/planner/mission-schema';
import { workLabels } from '@/lib/planner/mission-editing';
import { InfoHint } from './mission-help';

type Props = {
  workType?: MissionJob['job']['type'];
  document: MissionDocument;
  selected: number;
  clearedId: string | null;
  onSelect: (index: number) => void;
  onChange: (next: MissionDocument) => void;
  onDelete: () => void;
  onAdd: () => void;
  onRestore?: () => void;
  onSave: () => void;
  canSave: boolean;
  onDraw: (tool: 'polygon' | 'freehand' | 'circle' | 'ellipse') => void;
  onImport: () => void;
};

function AreaMenu({
  job,
  onChange,
}: {
  job: MissionJob;
  onChange: (next: MissionJob) => void;
}) {
  const id = useId();
  const [name, setName] = useState(job.name);
  const [position, setPosition] = useState({ top: 200, left: 30 });
  return (
    <>
      <button
        className="mw-button small mt-more"
        aria-label={`Действия с участком ${job.name}`}
        popoverTarget={id}
        onClick={(e) => {
          setName(job.name);
          const box = e.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(
              8,
              Math.min(box.bottom + 6, window.innerHeight - 230),
            ),
            left: Math.max(
              8,
              Math.min(box.right - 280, window.innerWidth - 296),
            ),
          });
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      <div id={id} popover="auto" className="mt-area-popover" style={position}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onChange({ ...job, name: name.trim() });
            (e.currentTarget.parentElement as HTMLElement).hidePopover();
          }}
        >
          <label>
            Название{' '}
            <input
              aria-label="Новое название участка"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </label>
          <button
            className="mw-button small"
            type="submit"
            disabled={!name.trim()}
          >
            Переименовать
          </button>
        </form>
        <label>
          Приоритет участка
          <select
            aria-label={`Приоритет участка ${job.name}`}
            value={job.priority ?? ''}
            onChange={(e) => {
              const next = { ...job };
              if (e.target.value) next.priority = Number(e.target.value);
              else delete next.priority;
              onChange(next);
              (
                e.currentTarget.closest('[popover]') as HTMLElement
              ).hidePopover();
            }}
          >
            <option value="">Автоматически</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                Приоритет {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

export default function MissionTerritoryEditor(p: Props) {
  const job = p.document.jobs[p.selected] ?? p.document.jobs[0];
  const incomplete = !job.area.coordinates[0]?.length || p.clearedId === job.id;
  return (
    <div className="mt-editor">
      <div className="mt-heading">
        <h3>Участки</h3>
        <InfoHint label="Редактирование территории">
          Выберите участок. Перетаскивайте круглые вершины, затем нажмите
          «Сохранить изменения». Меню ⋯ меняет название и приоритет; 1 — самый
          высокий. Пустой участок не сохраняется и не участвует в расчёте.
        </InfoHint>
      </div>
      <div className="mt-area-list" aria-label="Участки работы">
        {p.document.jobs.map(
          (j, index) =>
            (!p.workType || j.job.type === p.workType) && (
              <div
                key={j.id}
                className="mt-area-row"
                data-selected={job.id === j.id}
              >
                <button
                  className="mt-area-item"
                  aria-pressed={job.id === j.id}
                  onClick={() => p.onSelect(index)}
                >
                  <span className="mt-area-number">{index + 1}</span>
                  <span>
                    <strong>{j.name}</strong>
                    <small>
                      {!j.area.coordinates[0]?.length || p.clearedId === j.id
                        ? 'Нарисуйте территорию'
                        : workLabels[j.job.type]}
                      {j.priority ? ` · приоритет ${j.priority}` : ''}
                    </small>
                  </span>
                </button>
                <AreaMenu
                  job={j}
                  onChange={(next) =>
                    p.onChange({
                      ...p.document,
                      jobs: p.document.jobs.map((item) =>
                        item.id === next.id ? next : item,
                      ),
                    })
                  }
                />
              </div>
            ),
        )}
      </div>
      <div className="mt-shape-tools">
        {(
          [
            ['polygon', 'По точкам'],
            ['freehand', 'От руки'],
            ['circle', 'Круг'],
            ['ellipse', 'Овал'],
          ] as const
        ).map(([tool, name]) => (
          <button
            key={tool}
            className="mw-button"
            onClick={() => p.onDraw(tool)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="mw-actions">
        <button
          className="mw-button small mw-action-add"
          disabled={
            p.document.jobs.length >= 8 ||
            p.document.jobs.some((j) => !j.area.coordinates[0]?.length)
          }
          onClick={p.onAdd}
        >
          <Plus size={14} />
          Добавить участок
        </button>
        <button
          className="mw-button small mw-action-remove"
          onClick={p.onDelete}
          disabled={incomplete && p.document.jobs.length === 1}
        >
          <Trash2 size={14} />
          Удалить участок
        </button>
        <button className="mw-button small" onClick={p.onImport}>
          <Upload size={14} />
          GeoJSON / KML
        </button>
      </div>
      {incomplete && (
        <div className="mt-empty-area">
          Территория не задана.
          {p.onRestore && (
            <button className="mw-button small" onClick={p.onRestore}>
              Восстановить контур
            </button>
          )}
        </div>
      )}
      {!incomplete && job.area.coordinates.length > 1 && (
        <details>
          <summary>Отверстия · {job.area.coordinates.length - 1}</summary>
          {job.area.coordinates.slice(1).map((_, i) => (
            <button
              key={i}
              className="mw-button small mw-action-remove"
              onClick={() => {
                if (
                  !window.confirm(
                    `Удалить отверстие ${i + 1}? Эта часть станет территорией работ.`,
                  )
                )
                  return;
                p.onChange({
                  ...p.document,
                  jobs: p.document.jobs.map((j) =>
                    j.id === job.id
                      ? {
                          ...j,
                          area: {
                            ...j.area,
                            coordinates: j.area.coordinates.filter(
                              (_, index) => index !== i + 1,
                            ),
                          },
                        }
                      : j,
                  ),
                });
              }}
            >
              Удалить отверстие {i + 1}
            </button>
          ))}
        </details>
      )}
      <div className="mt-save-row">
        <button
          className="mw-button primary"
          disabled={!p.canSave || incomplete}
          onClick={p.onSave}
        >
          <Save size={15} />
          Сохранить изменения
        </button>
      </div>
    </div>
  );
}
