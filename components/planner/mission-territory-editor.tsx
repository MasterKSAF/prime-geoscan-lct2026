'use client';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import { workLabels } from '@/lib/planner/mission-editing';
import { InfoHint } from './mission-help';

type Props = {
  workType?: MissionDocument['jobs'][number]['job']['type'];
  document: MissionDocument;
  selected: number;
  clearedId: string | null;
  onSelect: (index: number) => void;
  onChange: (next: MissionDocument) => void;
  onDelete: () => void;
  onAdd: () => void;
  onRestore: () => void;
  onDraw: (tool: 'polygon' | 'freehand' | 'circle' | 'ellipse') => void;
  onImport: () => void;
  onBoundary: () => void;
  onBase: (vehicleId: string, role: 'start' | 'landing') => void;
};
export default function MissionTerritoryEditor(p: Props) {
  const job = p.document.jobs[p.selected] ?? p.document.jobs[0];
  return (
    <div className="mt-editor">
      <div className="mt-heading">
        <h3>Участки</h3>
        <InfoHint label="Редактирование территории">
          Выберите участок в списке или на карте. Тяните круглые вершины, чтобы
          изменить границу. Пересечение при рисовании замыкает первую петлю и
          отсекает хвосты. Отверстия сохраняются при изменении внешней границы.
        </InfoHint>
      </div>
      <div className="mt-area-list">
        {p.document.jobs.map(
          (j, index) =>
            (!p.workType || j.job.type === p.workType) && (
              <button
                key={j.id}
                className="mt-area-item"
                aria-pressed={job.id === j.id}
                onClick={() => p.onSelect(index)}
              >
                <span className="mt-area-number">{index + 1}</span>
                <span>
                  <strong>{j.name}</strong>
                  <small>
                    {p.clearedId === j.id
                      ? 'Нет территории'
                      : workLabels[j.job.type]}
                  </small>
                </span>
              </button>
            ),
        )}
      </div>
      <label className="mw-field">
        Название участка
        <input
          value={job.name}
          maxLength={100}
          onChange={(e) =>
            p.onChange({
              ...p.document,
              jobs: p.document.jobs.map((j) =>
                j.id === job.id ? { ...j, name: e.target.value } : j,
              ),
            })
          }
        />
      </label>
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
          disabled={p.document.jobs.length >= 8 || !!p.clearedId}
          onClick={p.onAdd}
        >
          <Plus size={14} />
          Добавить участок
        </button>
        <button
          className="mw-button small mw-action-remove"
          onClick={p.onDelete}
          disabled={p.clearedId === job.id && p.document.jobs.length === 1}
        >
          <Trash2 size={14} />
          Удалить участок
        </button>
        <button className="mw-button small" onClick={p.onImport}>
          <Upload size={14} />
          GeoJSON / KML
        </button>
      </div>
      {p.clearedId === job.id && (
        <div className="mt-empty-area">
          Территория не задана.
          <button className="mw-button small" onClick={p.onRestore}>
            Восстановить контур
          </button>
        </div>
      )}
      {p.clearedId !== job.id && job.area.coordinates.length > 1 && (
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
      <details>
        <summary>
          Допустимая граница полётов{' '}
          <InfoHint label="Граница полётов">
            Это заданный оператором допустимый контур, а не разрешение
            воздушного пространства. Участки работ и все перелёты должны
            оставаться внутри него.
          </InfoHint>
        </summary>
        <div className="mw-actions">
          <button className="mw-button small" onClick={p.onBoundary}>
            Перерисовать границу полётов
          </button>
        </div>
      </details>
      <details className="mt-bases">
        <summary>
          Базы и резервные площадки{' '}
          <InfoHint label="Базы аппаратов">
            Каждому БВС нужны точки взлёта и посадки. Их можно перенести на
            карте. Чтобы исключить базу из расчёта, перенесите все назначенные
            на неё БВС или выключите их в парке. Резервную площадку можно
            удалить.
          </InfoHint>
        </summary>
        {p.document.scenario.vehicles.map((v) => (
          <div className="mt-base" key={v.id}>
            <strong>{v.name}</strong>
            <small>
              {v.start[1].toFixed(5)}, {v.start[0].toFixed(5)}
            </small>
            <div className="mw-actions">
              <button
                className="mw-button small"
                onClick={() => p.onBase(v.id, 'start')}
              >
                Перенести взлёт
              </button>
              <button
                className="mw-button small"
                onClick={() => p.onBase(v.id, 'landing')}
              >
                Перенести посадку
              </button>
            </div>
          </div>
        ))}
        {p.document.scenario.reserveSites.map((point, index) => (
          <div className="mt-base" key={index}>
            <span>
              Резерв {index + 1} · {point[1].toFixed(5)}, {point[0].toFixed(5)}
            </span>
            <button
              className="mw-button small mw-action-remove"
              onClick={() =>
                p.onChange({
                  ...p.document,
                  scenario: {
                    ...p.document.scenario,
                    reserveSites: p.document.scenario.reserveSites.filter(
                      (_, i) => i !== index,
                    ),
                  },
                })
              }
            >
              Удалить
            </button>
          </div>
        ))}
      </details>
    </div>
  );
}
