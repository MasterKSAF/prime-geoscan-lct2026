'use client';
import { useState } from 'react';
import type { Coordinate, Polygon } from '@/lib/planner/schema';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import type { GeometryRole } from '@/lib/planner/mission-io';
import {
  baseVehicleIds,
  missionBases,
  type BaseEdit,
} from '@/lib/planner/mission-bases';
import { InfoHint } from './mission-help';
import { MissionDateField } from './mission-date-field';
import MissionBaseEditor, { type BaseAction } from './mission-base-editor';

export default function MissionMapObjects(p: {
  document: MissionDocument;
  busy: boolean;
  selectedBase: string | null;
  action?: BaseAction | null;
  onSelectBase: (id: string | null) => void;
  picked: { kind: 'base' | 'reserve'; point: Coordinate; key: number } | null;
  onPick: (kind: 'base' | 'reserve', baseId?: string) => void;
  onCancelPick: () => void;
  onDraw: (kind: 'airspace' | 'exclusion') => void;
  onEditBoundary: (editing: boolean) => void;
  onImport: (role: GeometryRole) => void;
  onChange: (d: MissionDocument) => void;
  onBaseChange: (d: MissionDocument) => Promise<void>;
  onLayers: () => void;
}) {
  const d = p.document,
    bases = missionBases(d);
  const [tab, setTab] = useState<'bases' | 'boundary' | 'restrictions'>(
    'bases',
  );
  const [draft, setDraft] = useState<BaseEdit | null>(null);
  const [reserve, setReserve] = useState<Coordinate | null>(null);
  const [error, setError] = useState('');
  const [restore, setRestore] = useState<Polygon | null>(null);
  const [boundaryBefore, setBoundaryBefore] = useState<Polygon | null>(null);
  const [loadedBase, setLoadedBase] = useState<string | null>(null);
  const [pickedKey, setPickedKey] = useState<number | null>(null);
  const selection = p.selectedBase
    ? JSON.stringify(bases.find((b) => b.id === p.selectedBase))
    : null;
  // Refresh after a map move, but never discard typing on an unrelated render.
  if (selection !== loadedBase) {
    setLoadedBase(selection ?? null);
    const b = bases.find((b) => b.id === p.selectedBase);
    if (b) {
      setTab('bases');
      setDraft({ ...b, vehicleIds: baseVehicleIds(d, b), purpose: 'both' });
      setError('');
    }
  }
  if (p.picked && p.picked.key !== pickedKey) {
    setPickedKey(p.picked.key);
    if (p.picked.kind === 'base')
      setDraft((v) => (v ? { ...v, coordinate: p.picked!.point } : v));
    else setReserve(p.picked.point);
  }
  const applyBase = async (next: MissionDocument) => {
    try {
      await p.onBaseChange(next);
      setDraft(null);
      p.onSelectBase(null);
      setError('');
      p.onCancelPick();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="mission-map-objects" aria-label="Объекты карты">
      <h3>
        Объекты карты{' '}
        <InfoHint label="Объекты карты">
          Участки выбираются у работы. Здесь — общие базы, разрешённая граница и
          ограничения миссии. После изменения нужен новый расчёт.
        </InfoHint>
      </h3>
      <div className="mw-actions" role="tablist" aria-label="Тип объектов">
        {(
          [
            ['bases', 'Базы и посадка'],
            ['boundary', 'Граница полётов'],
            ['restrictions', 'Запреты и препятствия'],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`mw-button small ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mw-alert">
          {error}
        </p>
      )}
      {tab === 'bases' && (
        <>
          <div className="mw-actions">
            <button
              className="mw-button small mw-action-add"
              disabled={p.busy}
              onClick={() => {
                p.onSelectBase(null);
                setDraft({
                  id: `base-${crypto.randomUUID().slice(0, 12)}`,
                  name: `База ${bases.length + 1}`,
                  coordinate: [...d.scenario.vehicles[0].start],
                  vehicleIds: [],
                  purpose: 'both',
                });
                setError('');
                p.onPick('base');
              }}
            >
              Добавить базу
            </button>
            <button
              className="mw-button small"
              onClick={() => {
                setReserve(null);
                p.onPick('reserve');
              }}
            >
              Добавить запасную площадку
            </button>
            <button
              className="mw-button small"
              onClick={() => p.onImport('reserve')}
            >
              Площадки из файла
            </button>
          </div>
          <div className="map-object-list">
            {bases.map((b) => (
              <button
                key={b.id}
                className={`mw-button small ${draft?.id === b.id ? 'active' : ''}`}
                onClick={() => {
                  p.onSelectBase(b.id);
                  setDraft({
                    ...b,
                    vehicleIds: baseVehicleIds(d, b),
                    purpose: 'both',
                  });
                  setError('');
                }}
              >
                <strong>{b.name}</strong> · {baseVehicleIds(d, b).length} БВС
              </button>
            ))}
          </div>
          {draft && (
            <MissionBaseEditor
              key={draft.id}
              document={d}
              draft={draft}
              busy={p.busy}
              action={p.action}
              onDraft={setDraft}
              onMove={() =>
                p.onPick(
                  'base',
                  bases.some((b) => b.id === draft.id) ? draft.id : undefined,
                )
              }
              onApply={applyBase}
              onError={setError}
              onClose={() => {
                setDraft(null);
                p.onSelectBase(null);
                p.onCancelPick();
                setError('');
              }}
            />
          )}
          {reserve && (
            <div className="map-object-form">
              Новая запасная площадка:{' '}
              {reserve.map((x) => x.toFixed(6)).join(', ')}
              <div className="mw-actions">
                <button
                  className="mw-button primary small"
                  disabled={d.scenario.reserveSites.length >= 10}
                  onClick={() => {
                    p.onChange({
                      ...d,
                      scenario: {
                        ...d.scenario,
                        reserveSites: [...d.scenario.reserveSites, reserve],
                      },
                    });
                    setReserve(null);
                  }}
                >
                  Добавить площадку
                </button>
                <button
                  className="mw-button small"
                  onClick={() => {
                    setReserve(null);
                    p.onCancelPick();
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
          {d.scenario.reserveSites.map((point, i) => (
            <div className="map-object-row" key={i}>
              <span>
                Запасная площадка {i + 1} ·{' '}
                {point.map((n) => n.toFixed(5)).join(', ')}
              </span>
              <button
                className="mw-button small mw-action-remove"
                aria-label={`Удалить запасную площадку ${i + 1}`}
                onClick={() =>
                  p.onChange({
                    ...d,
                    scenario: {
                      ...d.scenario,
                      reserveSites: d.scenario.reserveSites.filter(
                        (_, n) => n !== i,
                      ),
                    },
                  })
                }
              >
                Удалить
              </button>
            </div>
          ))}
        </>
      )}
      {tab === 'boundary' && (
        <>
          <p>
            {d.scenario.airspace.coordinates.length
              ? 'Общая граница показана зелёным пунктиром.'
              : 'Граница удалена. Задайте новую перед расчётом.'}
          </p>
          <div className="mw-actions">
            <button
              className="mw-button small mw-action-add"
              onClick={() => p.onDraw('airspace')}
            >
              Нарисовать границу
            </button>
            <button
              className="mw-button small"
              disabled={!d.scenario.airspace.coordinates.length}
              onClick={() => {
                setBoundaryBefore(structuredClone(d.scenario.airspace));
                p.onEditBoundary(true);
              }}
            >
              Изменить точки
            </button>
            {boundaryBefore && (
              <>
                <button
                  className="mw-button small primary"
                  onClick={() => {
                    setBoundaryBefore(null);
                    p.onEditBoundary(false);
                  }}
                >
                  Готово
                </button>
                <button
                  className="mw-button small"
                  onClick={() => {
                    p.onChange({
                      ...d,
                      scenario: { ...d.scenario, airspace: boundaryBefore },
                    });
                    setBoundaryBefore(null);
                    p.onEditBoundary(false);
                  }}
                >
                  Отмена правки границы
                </button>
              </>
            )}
            <button
              className="mw-button small"
              onClick={() => p.onImport('airspace')}
            >
              Загрузить границу
            </button>
            <button
              className="mw-button small mw-action-remove"
              disabled={!d.scenario.airspace.coordinates.length}
              onClick={() => {
                setRestore(d.scenario.airspace);
                setBoundaryBefore(null);
                p.onEditBoundary(false);
                p.onChange({
                  ...d,
                  scenario: {
                    ...d.scenario,
                    airspace: { type: 'Polygon', coordinates: [] },
                  },
                });
              }}
            >
              Очистить границу
            </button>
            {restore && (
              <button
                className="mw-button small"
                onClick={() => {
                  p.onChange({
                    ...d,
                    scenario: { ...d.scenario, airspace: restore },
                  });
                  setRestore(null);
                }}
              >
                Восстановить границу
              </button>
            )}
          </div>
        </>
      )}
      {tab === 'restrictions' && (
        <>
          <div className="mw-actions">
            <button
              className="mw-button small mw-action-add"
              onClick={() => p.onDraw('exclusion')}
            >
              Добавить запретную зону
            </button>
            <button
              className="mw-button small"
              onClick={() => p.onImport('exclusion')}
            >
              Загрузить запретные зоны
            </button>
            <button className="mw-button small" onClick={p.onLayers}>
              Загрузить препятствия
            </button>
          </div>
          {d.restrictions.map((r) => (
            <details key={r.id}>
              <summary>
                {r.name} · {r.kind === 'noFlight' ? 'запрет' : 'препятствие'}
              </summary>
              <label className="mw-field">
                Название
                <input
                  value={r.name}
                  onChange={(e) =>
                    p.onChange({
                      ...d,
                      restrictions: d.restrictions.map((x) =>
                        x.id === r.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label className="mw-checkbox">
                <input
                  type="checkbox"
                  checked={!!r.startAt}
                  onChange={(e) =>
                    p.onChange({
                      ...d,
                      restrictions: d.restrictions.map((x) =>
                        x.id === r.id
                          ? {
                              ...x,
                              startAt: e.target.checked ? d.window.start : null,
                              endAt: e.target.checked ? d.window.end : null,
                            }
                          : x,
                      ),
                    })
                  }
                />
                Действует только в выбранный период
              </label>
              {r.startAt &&
                (['startAt', 'endAt'] as const).map((key) => (
                  <MissionDateField
                    key={key}
                    label={key === 'startAt' ? 'Запрет с' : 'Запрет до'}
                    timezone={d.window.timezone}
                    value={r[key]!}
                    onChange={(value) =>
                      p.onChange({
                        ...d,
                        restrictions: d.restrictions.map((x) =>
                          x.id === r.id ? { ...x, [key]: value } : x,
                        ),
                      })
                    }
                  />
                ))}
              <details>
                <summary>Высоты ограничения</summary>
                <InfoHint label="Высоты ограничения">
                  Высоты над принятой поверхностью модели, в метрах. Пустое
                  верхнее значение — без верхнего предела. Это параметры
                  оператора, не автоматически выданное разрешение.
                </InfoHint>
                <div className="mw-field-row">
                  <label className="mw-field">
                    От, м
                    <input
                      type="number"
                      min={0}
                      max={6000}
                      value={r.minAltitudeM}
                      onChange={(e) =>
                        p.onChange({
                          ...d,
                          restrictions: d.restrictions.map((x) =>
                            x.id === r.id
                              ? { ...x, minAltitudeM: e.target.valueAsNumber }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="mw-field">
                    До, м
                    <input
                      type="number"
                      min={0}
                      max={6000}
                      placeholder="Без предела"
                      value={r.maxAltitudeM ?? ''}
                      onChange={(e) =>
                        p.onChange({
                          ...d,
                          restrictions: d.restrictions.map((x) =>
                            x.id === r.id
                              ? {
                                  ...x,
                                  maxAltitudeM:
                                    e.target.value === ''
                                      ? null
                                      : e.target.valueAsNumber,
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              </details>
              <button
                className="mw-button small mw-action-remove"
                onClick={() =>
                  p.onChange({
                    ...d,
                    restrictions: d.restrictions.filter((x) => x.id !== r.id),
                  })
                }
              >
                Удалить ограничение
              </button>
            </details>
          ))}
          {d.scenario.exclusions.map((_, i) => (
            <div className="map-object-row" key={i}>
              <span>Запретная зона {i + 1}</span>
              <button
                className="mw-button small mw-action-remove"
                onClick={() =>
                  p.onChange({
                    ...d,
                    scenario: {
                      ...d.scenario,
                      exclusions: d.scenario.exclusions.filter(
                        (_, n) => n !== i,
                      ),
                    },
                  })
                }
              >
                Удалить зону
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
