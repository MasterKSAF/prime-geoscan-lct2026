'use client';
import { useEffect, useRef, useState } from 'react';
import { Plane, Drone, Save, RefreshCw, MapPin, X } from 'lucide-react';
import MissionMap from './mission-map';
import {
  baseChangeBlocker,
  vehicleAssignments,
} from '@/lib/planner/fleet-availability';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import type { Coordinate } from '@/lib/planner/schema';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import {
  type FleetRegistry,
  fleetBases,
  fleetRegistryTemplate,
} from '@/lib/planner/fleet-registry';
import { addMissionVehicle } from '@/lib/planner/mission-fleet';
import {
  parseFleetText,
  MAX_FLEET_FILE_BYTES,
} from '@/lib/planner/mission-fleet';
import { demoMission } from '@/lib/planner/mission-demo';
import { MISSION_VEHICLE_CATALOG } from '@/lib/planner/mission-vehicle-catalog';
import { vehicleDisplayName } from '@/lib/planner/mission-vehicle-label';
import type { FleetState } from '@/lib/planner/mission-fleet-state';
import MissionFleetEditor from './mission-fleet-editor';
import MissionFleetStatePanel from './mission-fleet-state-panel';
import type { FleetReport } from '@/lib/planner/mission-fleet-state';
import { InfoHint } from './mission-help';

export default function FleetWorkspace({
  registry,
  seed,
  states,
  busy,
  onSave,
  onRefresh,
  onNotice,
  onReport,
  onApply,
  operations = [],
  onOpenOperation,
  recalculations = [],
  onOpenRecalculation,
}: {
  registry: FleetRegistry | null;
  seed: MissionDocument;
  states: readonly FleetState[];
  busy: boolean;
  onSave: (d: MissionDocument) => Promise<boolean>;
  onRefresh: () => void;
  onNotice: (s: string) => void;
  onReport: (r: FleetReport) => Promise<FleetState>;
  onApply: () => void;
  operations?: readonly MissionOperation[];
  onOpenOperation?: (row: MissionOperation) => void;
  recalculations?: { id: string; name: string; status: string }[];
  onOpenRecalculation?: (id: string) => void;
}) {
  const [draft, setDraft] = useState<MissionDocument | null>(null);
  const [baseSelection, setBaseSelection] = useState<Record<string, string>>(
    {},
  );
  const [mapVehicleId, setMapVehicleId] = useState<string | null>(null);
  const [mapPoint, setMapPoint] = useState<Coordinate | null>(null);
  const baseDialog = useRef<HTMLDialogElement>(null);
  const baseClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (mapVehicleId) {
      baseDialog.current?.showModal();
      baseClose.current?.focus({ preventScroll: true });
    } else baseDialog.current?.close();
  }, [mapVehicleId]);
  useEffect(() => {
    if (!draft) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  const file = useRef<HTMLInputElement>(null);
  const d = draft ?? registry?.document;
  const bases = d ? fleetBases(d) : [];
  return (
    <section className="fw-workspace" aria-label="Общий парк БВС">
      <div className="fw-heading">
        <h1>Парк БВС</h1>
        <div className="mw-actions">
          <button
            className="mw-button"
            disabled={busy || !!draft}
            onClick={onRefresh}
          >
            <RefreshCw size={15} />
            Обновить состояние
          </button>
          {draft && (
            <>
              <button className="mw-button" onClick={() => setDraft(null)}>
                Отменить правки
              </button>
              <button
                className="mw-button primary"
                disabled={busy}
                onClick={() =>
                  void onSave(draft).then((ok) => {
                    if (ok) setDraft(null);
                  })
                }
              >
                <Save size={15} />
                Сохранить парк
              </button>
            </>
          )}
        </div>
      </div>
      {!!recalculations.length && (
        <details className="fw-config">
          <summary>
            Пересчёт после изменения парка · {recalculations.length}
          </summary>
          <div className="fw-recalculations">
            {recalculations.map((r) => (
              <button
                className="mw-button"
                key={r.id}
                onClick={() => onOpenRecalculation?.(r.id)}
              >
                {r.name} · {r.status}
              </button>
            ))}
          </div>
        </details>
      )}
      <div className="fw-summary">
        {d
          ? `${d.scenario.vehicles.length} БВС · ${bases.length} баз${draft ? ' · есть изменения' : ''}`
          : 'Общий парк пока пуст'}{' '}
        <InfoHint label="Общий парк и состояние">
          Это единый каталог ресурсов для всех миссий. Изменения сохраняются
          отдельно. Миссии используют снимок парка; обновление требует
          пересчёта. «Обновить состояние» перечитывает зарегистрированные данные
          оператора и симуляции. Реального подключения к БВС пока нет. Время
          сохранения профиля не является временем опроса.
        </InfoHint>
      </div>
      {!d ? (
        <div className="fw-empty">
          <h2>Добавить первый аппарат</h2>
          <button className="mw-button" onClick={() => file.current?.click()}>
            Загрузить парк JSON
          </button>
          <input
            type="file"
            accept=".json"
            hidden
            ref={file}
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              e.target.value = '';
              if (!selected) return;
              try {
                if (selected.size > MAX_FLEET_FILE_BYTES)
                  throw new Error('Файл парка превышает 200 КБ.');
                const fleet = parseFleetText(await selected.text());
                setDraft(
                  fleetRegistryTemplate({
                    scenario: { ...seed.scenario, vehicles: fleet.vehicles },
                    batteries: fleet.batteries,
                    bases: fleet.bases,
                  }),
                );
              } catch (error) {
                onNotice(
                  error instanceof Error ? error.message : 'Парк не загружен.',
                );
              }
            }}
          />
          <div className="mw-actions">
            {MISSION_VEHICLE_CATALOG.map((model) => (
              <button
                className="mw-button mw-action-add"
                key={model.model}
                onClick={() => {
                  const base = fleetRegistryTemplate(demoMission(1));
                  const next = addMissionVehicle(base, model.model);
                  const v = next.scenario.vehicles.at(-1)!;
                  setDraft({
                    ...next,
                    jobs: next.jobs.map((j) => ({
                      ...j,
                      assignedVehicleIds: [],
                    })),
                    scenario: { ...next.scenario, vehicles: [v] },
                    batteries: next.batteries.filter(
                      (b) => b.vehicleId === v.id,
                    ),
                  });
                }}
              >
                {model.name}
              </button>
            ))}
          </div>
          <button
            className="mw-button"
            onClick={() => {
              try {
                setDraft(fleetRegistryTemplate(seed));
              } catch (e) {
                onNotice(
                  e instanceof Error ? e.message : 'Проверьте профили БВС.',
                );
              }
            }}
          >
            Подготовить парк из открытой миссии
          </button>
        </div>
      ) : (
        <>
          <div className="fw-roster">
            {d.scenario.vehicles.map((v) => {
              const state = states.find((s) => s.id === v.id);
              const assignments = vehicleAssignments(v.id, operations, state);
              const blocker = baseChangeBlocker(v.id, operations, state);
              const base = bases.find(
                (b) => b.coordinate.join(',') === v.start.join(','),
              );
              return (
                <article key={v.id}>
                  <span className="fw-drone-icon">
                    {v.kind === 'fixedWing' ? (
                      <Plane size={24} />
                    ) : (
                      <Drone size={24} />
                    )}
                  </span>
                  <div>
                    <strong>{vehicleDisplayName(v)}</strong>
                    <small>
                      {v.id} · {v.jobs.join(' / ')}
                    </small>
                  </div>
                  <label>
                    База
                    <select
                      aria-label={`База: ${v.name}`}
                      value={baseSelection[v.id] ?? base?.id ?? ''}
                      disabled={busy || !!blocker}
                      title={blocker ?? 'Выберите базу и нажмите «Применить»'}
                      onChange={(e) =>
                        setBaseSelection({
                          ...baseSelection,
                          [v.id]: e.target.value,
                        })
                      }
                    >
                      {bases.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <div className="fw-base-actions">
                      <button
                        className="mw-button small"
                        disabled={
                          busy ||
                          !!draft ||
                          !!blocker ||
                          !baseSelection[v.id] ||
                          baseSelection[v.id] === base?.id
                        }
                        onClick={() => {
                          const chosen = bases.find(
                            (b) => b.id === baseSelection[v.id],
                          );
                          if (!chosen) return;
                          void onSave({
                            ...d,
                            bases,
                            scenario: {
                              ...d.scenario,
                              vehicles: d.scenario.vehicles.map((x) =>
                                x.id === v.id
                                  ? {
                                      ...x,
                                      start: [...chosen.coordinate],
                                      landing: [...chosen.coordinate],
                                    }
                                  : x,
                              ),
                            },
                          }).then((ok) => {
                            if (ok)
                              setBaseSelection((old) => {
                                const next = { ...old };
                                delete next[v.id];
                                return next;
                              });
                          });
                        }}
                      >
                        Применить
                      </button>
                      <button
                        className="mw-button small"
                        aria-label={`Указать базу на карте: ${v.name}`}
                        title={blocker ?? 'Указать базу на карте'}
                        disabled={busy || !!draft || !!blocker}
                        onClick={() => {
                          setMapPoint(null);
                          setMapVehicleId(v.id);
                        }}
                      >
                        <MapPin size={15} />
                      </button>
                    </div>
                    {blocker && (
                      <InfoHint label={`Почему нельзя сменить базу ${v.name}`}>
                        {blocker}
                      </InfoHint>
                    )}
                  </label>
                  <span>
                    {state?.vehicle.batteryPct ?? v.batteryPct}%
                    <small>
                      {state
                        ? `${state.source === 'simulation' ? 'Симуляция' : 'Оператор'} · ${new Date(state.observedAt).toLocaleTimeString('ru-RU')}`
                        : 'Не опрошен'}
                    </small>
                  </span>
                  <span
                    className={`mb-status ${state?.operationId ? 'mb-running' : 'mb-draft'}`}
                  >
                    {state?.operationId
                      ? 'Занят'
                      : state?.ready && state.grounded
                        ? 'Готовность заявлена'
                        : 'Требует проверки'}
                  </span>
                  <div className="fw-assignment-list">
                    <details>
                      <summary>
                        Миссии {assignments.assigned.length} · активные{' '}
                        {assignments.active.length}
                      </summary>
                      <div>
                        {assignments.assigned.map((o) => (
                          <button
                            className="mw-button small"
                            key={o.id}
                            onClick={() => onOpenOperation?.(o)}
                          >
                            {o.document.name} ·{' '}
                            {o.status === 'scheduled'
                              ? 'В плане'
                              : o.status === 'paused'
                                ? 'Пауза'
                                : 'Выполняется'}
                          </button>
                        ))}
                        {!assignments.assigned.length && (
                          <span>Нет назначенных миссий</span>
                        )}
                      </div>
                    </details>
                    <span className="fw-availability">{assignments.label}</span>
                  </div>
                </article>
              );
            })}
          </div>
          {registry && !draft && (
            <details className="fw-config">
              <summary>Состояние и готовность БВС</summary>
              <MissionFleetStatePanel
                document={registry.document}
                states={[...states]}
                onReport={onReport}
                onApply={onApply}
              />
            </details>
          )}
          <details className="fw-config">
            <summary>
              Добавить / импортировать БВС и изменить комплектации
            </summary>
            <MissionFleetEditor
              fleetOnly
              document={d}
              onChange={setDraft}
              onNotice={onNotice}
            />
          </details>
          <details className="fw-config">
            <summary>Базы · {bases.length}</summary>
            <button
              className="mw-button mw-action-add"
              onClick={() =>
                setDraft({
                  ...d,
                  bases: [
                    ...bases,
                    {
                      id: 'base-' + crypto.randomUUID(),
                      name: 'Новая база',
                      coordinate: [
                        bases[0].coordinate[0] + 0.001 * (bases.length + 1),
                        bases[0].coordinate[1],
                      ],
                    },
                  ],
                })
              }
            >
              Добавить базу
            </button>
            {bases.map((b) => (
              <div className="fw-base" key={b.id}>
                <input
                  aria-label={`Название базы ${b.id}`}
                  value={b.name}
                  maxLength={100}
                  onChange={(e) =>
                    setDraft({
                      ...d,
                      bases: bases.map((x) =>
                        x.id === b.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <code>{b.id}</code>
                {([1, 0] as const).map((axis) => (
                  <label key={axis}>
                    {axis === 1 ? 'Широта' : 'Долгота'}
                    <input
                      type="number"
                      step="0.000001"
                      aria-label={`${axis === 1 ? 'Широта' : 'Долгота'} базы ${b.id}`}
                      value={b.coordinate[axis]}
                      onChange={(e) => {
                        if (!Number.isFinite(e.target.valueAsNumber)) return;
                        const point: [number, number] = [...b.coordinate];
                        point[axis] = e.target.valueAsNumber;
                        setDraft({
                          ...d,
                          bases: bases.map((x) =>
                            x.id === b.id ? { ...x, coordinate: point } : x,
                          ),
                          scenario: {
                            ...d.scenario,
                            vehicles: d.scenario.vehicles.map((v) => ({
                              ...v,
                              start:
                                v.start.join(',') === b.coordinate.join(',')
                                  ? point
                                  : v.start,
                              landing:
                                v.landing.join(',') === b.coordinate.join(',')
                                  ? point
                                  : v.landing,
                            })),
                          },
                        });
                      }}
                    />
                  </label>
                ))}
                <button
                  className="mw-button small mw-action-remove"
                  disabled={d.scenario.vehicles.some((v) =>
                    [v.start.join(','), v.landing.join(',')].includes(
                      b.coordinate.join(','),
                    ),
                  )}
                  onClick={() =>
                    setDraft({
                      ...d,
                      bases: bases.filter((x) => x.id !== b.id),
                    })
                  }
                >
                  Удалить базу
                </button>
              </div>
            ))}
            <InfoHint label="Координаты баз">
              В карточках БВС задаются координаты старта и посадки; одинаковые
              координаты образуют общую базу. Выбор базы переносит обе точки.
              Размещение нескольких БВС в одной точке может потребовать
              отдельных посадочных мест — расчёт проверит занятость и
              разнесение.
            </InfoHint>
          </details>
        </>
      )}
      <dialog
        ref={baseDialog}
        className="fw-base-dialog"
        onCancel={() => setMapVehicleId(null)}
      >
        <header>
          <strong>База аппарата</strong>
          <InfoHint label="Размещение БВС на базе">
            Выбор базы — заявление оператора о наземном положении, не команда
            перелёта и не телеметрия. Заряд не меняется. После применения
            связанные черновики пересчитываются; запуска автоматически не будет.
          </InfoHint>
          <button
            className="mw-button small"
            aria-label="Закрыть карту баз"
            ref={baseClose}
            onClick={() => setMapVehicleId(null)}
          >
            <X size={18} />
          </button>
        </header>
        {d && mapVehicleId && (
          <div className="fw-base-map">
            <MissionMap
              scenario={{
                ...d.scenario,
                vehicles: d.scenario.vehicles.map((v) =>
                  v.id === mapVehicleId && mapPoint
                    ? { ...v, start: mapPoint, landing: mapPoint }
                    : v,
                ),
              }}
              bases={bases}
              plan={null}
              time={0}
              selected={mapVehicleId}
              draft={[]}
              mode="start"
              onPoint={setMapPoint}
              fit={0}
              showTiles
              showTransit={false}
              workAreas={[]}
              showAirspace={false}
            />
          </div>
        )}
        <footer>
          <span>
            {mapPoint
              ? `${mapPoint[1].toFixed(6)}, ${mapPoint[0].toFixed(6)}`
              : 'Выберите точку на карте'}
          </span>
          <button
            className="mw-button primary"
            disabled={!mapPoint || busy}
            onClick={() => {
              if (!d || !mapPoint || !mapVehicleId) return;
              const blocker = baseChangeBlocker(
                mapVehicleId,
                operations,
                states.find((s) => s.id === mapVehicleId),
              );
              if (blocker) {
                onNotice(blocker);
                return;
              }
              const chosen = bases.find(
                (b) => b.coordinate.join(',') === mapPoint.join(','),
              );
              const next = {
                ...d,
                bases: chosen
                  ? bases
                  : [
                      ...bases,
                      {
                        id: 'base-' + crypto.randomUUID(),
                        name: `База ${bases.length + 1}`,
                        coordinate: mapPoint,
                      },
                    ],
                scenario: {
                  ...d.scenario,
                  vehicles: d.scenario.vehicles.map((v) =>
                    v.id === mapVehicleId
                      ? { ...v, start: mapPoint, landing: mapPoint }
                      : v,
                  ),
                },
              };
              void onSave(next).then((ok) => {
                if (ok) setMapVehicleId(null);
              });
            }}
          >
            Применить базу
          </button>
        </footer>
      </dialog>
    </section>
  );
}
