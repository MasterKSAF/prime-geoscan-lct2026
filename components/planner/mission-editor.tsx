'use client';
import { useEffect, useId, useState, type ComponentProps } from 'react';
import { Plane, Drone } from 'lucide-react';
import MissionWizard from './mission-wizard';
import { InfoHint } from './mission-help';
import { MissionDateField } from './mission-date-field';
import {
  appendMissionWork,
  removeMissionWorks,
  workLabels,
  setWorkPriority,
} from '@/lib/planner/mission-editing';
import type { MissionJob } from '@/lib/planner/mission-schema';
import { vehicleDisplayName } from '@/lib/planner/mission-vehicle-label';
import { vehiclePlanningEligibility } from '@/lib/planner/fixed-wing-profile';
import type { FleetState } from '@/lib/planner/mission-fleet-state';
import { missionFleetAdvice } from '@/lib/planner/mission-fleet-advice';

type Props = ComponentProps<typeof MissionWizard> & {
  onFleet: () => void;
  hasGlobalFleet: boolean;
  onUseGlobalFleet: () => void;
  fleetStates?: readonly FleetState[];
  status?: string;
  activeTab?: 'area' | 'quality' | 'vehicles' | 'time';
  onTabChange?: (tab: 'area' | 'quality' | 'vehicles' | 'time') => void;
};
export default function MissionEditor(p: Props) {
  const pickerId = useId();
  const tabsId = useId();
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const d = p.document,
    job = d.jobs[p.selectedJob] ?? d.jobs[0];
  const [tab, setLocalTab] = useState<'area' | 'quality' | 'vehicles' | 'time'>(
    'area',
  );
  const selectedTab = p.activeTab ?? tab;
  const setTab = (next: typeof tab) => {
    setLocalTab(next);
    p.onTabChange?.(next);
  };
  const patch = (value: Partial<MissionJob>) =>
    p.onChange({
      ...d,
      jobs: d.jobs.map((j) =>
        j.id === job.id ? { ...j, ...value, inheritsFrom: undefined } : j,
      ),
    });
  const types = [...new Set(d.jobs.map((j) => j.job.type))];
  const fleetAdvice = missionFleetAdvice(d).find((x) => x.jobId === job.id);
  return (
    <div className="me-editor">
      <div className="mission-resource-limits">
        <label className="mw-field">
          <span>
            БВС за всю миссию{' '}
            <InfoHint label="Лимит БВС">
              Максимум разных аппаратов, а не число одновременно летящих.
              Автовыбор подберёт подходящую группу из доступного парка.
              Повторные вылеты одного БВС считаются как один аппарат.
            </InfoHint>
          </span>
          <select
            aria-label="Лимит БВС"
            value={d.planning.maxVehicles ?? ''}
            onChange={(e) => {
              const planning = { ...d.planning };
              if (e.target.value) planning.maxVehicles = Number(e.target.value);
              else delete planning.maxVehicles;
              p.onChange({ ...d, planning });
            }}
          >
            <option value="">Автовыбор · без лимита</option>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Не более {n} БВС
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="me-works me-section">
        <summary>
          <span className="me-section-title">Выполняемые работы</span>
          <InfoHint label="Выполняемые работы">
            Выберите виды работ. Для каждой работы задайте участки, качество,
            подходящие БВС и время выполнения.
          </InfoHint>
        </summary>
        <div className="me-work-selection">
          <select
            aria-label="Выбранная работа"
            value={job.job.type}
            onChange={(e) => {
              p.onSelectJob(
                d.jobs.findIndex((j) => j.job.type === e.target.value),
              );
              p.onTerritoryEditing?.(selectedTab === 'area');
            }}
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {workLabels[type]}
              </option>
            ))}
          </select>
          <button
            className="mw-button small"
            popoverTarget={pickerId}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPickerPosition({
                top: Math.max(
                  8,
                  Math.min(rect.bottom + 6, window.innerHeight - 320),
                ),
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 302)),
              });
            }}
          >
            Виды работ
          </button>
          <details className="expert-priority">
            <summary>
              Приоритет{job.workPriority ? ` · ${job.workPriority}` : ''}
            </summary>
            <InfoHint label="Приоритет работы">
              Автоматически — порядок подбирает алгоритм. Приоритет 1 — самый
              высокий. При распределении ресурсов сначала учитывается приоритет
              работы, затем участка. Это предпочтение, не запрет параллельных
              вылетов; безопасность и сроки обязательны.
            </InfoHint>
            <select
              aria-label="Приоритет работы"
              value={job.workPriority ?? ''}
              onChange={(e) =>
                p.onChange(
                  setWorkPriority(
                    d,
                    job.job.type,
                    e.target.value ? Number(e.target.value) : undefined,
                  ),
                )
              }
            >
              <option value="">Автоматически</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Приоритет {n}
                </option>
              ))}
            </select>
          </details>
        </div>
        {fleetAdvice && (
          <output className="editor-fleet-warning">
            <strong>{fleetAdvice.title}</strong>
            <p>{fleetAdvice.action}</p>
            <button
              className="mw-button small"
              onClick={() =>
                fleetAdvice.destination === 'fleet'
                  ? p.onFleet()
                  : setTab('vehicles')
              }
            >
              {fleetAdvice.destination === 'fleet'
                ? 'Парк БВС'
                : 'Назначение БВС'}
            </button>
          </output>
        )}
        <div
          popover="auto"
          id={pickerId}
          className="me-work-picker-popover"
          style={pickerPosition}
        >
          <fieldset className="me-type-picker" aria-label="Виды работ">
            {Object.entries(workLabels).map(([key, label]) => {
              const type = key as MissionJob['job']['type'],
                selected = types.includes(type);
              return (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={
                      !selected &&
                      (d.jobs.length >= 8 ||
                        d.jobs.some((j) => !j.area.coordinates[0]?.length))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        p.onChange(
                          appendMissionWork(
                            d,
                            job.id,
                            type,
                            `job-${crypto.randomUUID()}`,
                          ),
                        );
                        p.onSelectJob(d.jobs.length);
                      } else {
                        const ids = d.jobs
                          .filter((j) => j.job.type === type)
                          .map((j) => j.id);
                        if (ids.length === d.jobs.length) {
                          p.onNotice?.('Оставьте хотя бы одну работу.');
                          return;
                        }
                        if (
                          window.confirm(
                            `Удалить работу «${label}» и её участки?`,
                          )
                        ) {
                          p.onChange(removeMissionWorks(d, ids));
                          p.onSelectJob(0);
                        }
                      }
                    }}
                  />
                  {label}
                </label>
              );
            })}
          </fieldset>
          <button
            className="mw-button small"
            popoverTarget={pickerId}
            popoverTargetAction="hide"
          >
            Готово
          </button>
        </div>
        {selectedTab !== 'area' && (
          <label className="mw-field">
            Участок
            <select
              aria-label="Выбранный участок"
              value={job.id}
              onChange={(e) =>
                p.onSelectJob(d.jobs.findIndex((j) => j.id === e.target.value))
              }
            >
              {d.jobs
                .filter((j) => j.job.type === job.job.type)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div
          className="me-local-tabs"
          role="tablist"
          aria-label="Параметры выбранной работы"
        >
          {(
            [
              ['area', 'Участки'],
              ['quality', 'Качество'],
              ['vehicles', 'БВС'],
              ['time', 'Время'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={`${tabsId}-${id}`}
              aria-selected={selectedTab === id}
              aria-controls={`${tabsId}-panel`}
              tabIndex={selectedTab === id ? 0 : -1}
              onKeyDown={(event) => {
                const keys = ['area', 'quality', 'vehicles', 'time'] as const;
                const index = keys.indexOf(id);
                const next =
                  event.key === 'ArrowRight'
                    ? keys[(index + 1) % 4]
                    : event.key === 'ArrowLeft'
                      ? keys[(index + 3) % 4]
                      : event.key === 'Home'
                        ? keys[0]
                        : event.key === 'End'
                          ? keys[3]
                          : null;
                if (next) {
                  event.preventDefault();
                  setTab(next);
                  p.onTerritoryEditing?.(next === 'area');
                  window.document.getElementById(`${tabsId}-${next}`)?.focus();
                }
              }}
              onClick={() => {
                setTab(id);
                p.onTerritoryEditing?.(id === 'area');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {selectedTab !== 'area' && (
          <details
            className="expert-inheritance"
            open={job.inheritsFrom ? true : undefined}
          >
            <summary>
              Общие настройки участков{job.inheritsFrom ? ' · связаны' : ''}
            </summary>
            <div className="mw-actions">
              <label className="mw-field">
                Использовать настройки
                <select
                  aria-label="Наследование параметров"
                  value={job.inheritsFrom ?? ''}
                  onChange={(e) =>
                    p.onChange({
                      ...d,
                      jobs: d.jobs.map((j) =>
                        j.id === job.id
                          ? { ...j, inheritsFrom: e.target.value || undefined }
                          : j,
                      ),
                    })
                  }
                >
                  <option value="">Этого участка</option>
                  {d.jobs
                    .filter(
                      (j) =>
                        j.id !== job.id &&
                        j.job.type === job.job.type &&
                        !j.inheritsFrom &&
                        !d.jobs.some((child) => child.inheritsFrom === job.id),
                    )
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        Как у «{j.name}»
                      </option>
                    ))}
                </select>
              </label>
              <InfoHint label="Общие параметры участков">
                Связанные участки используют высоту, качество, период и выбор
                БВС исходного участка. Контуры остаются разными. Выберите
                «Собственные», чтобы редактировать параметры независимо.
              </InfoHint>
              {job.inheritsFrom && (
                <button
                  className="mw-button small"
                  onClick={() =>
                    p.onSelectJob(
                      d.jobs.findIndex((j) => j.id === job.inheritsFrom),
                    )
                  }
                >
                  Изменить общие параметры
                </button>
              )}
            </div>
          </details>
        )}
        <section
          className="me-work-body"
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={`${tabsId}-${selectedTab}`}
        >
          <fieldset
            className="me-inherited-fields"
            disabled={selectedTab !== 'area' && !!job.inheritsFrom}
          >
            {selectedTab === 'area' && p.territoryEditor}
            {selectedTab === 'quality' && (
              <MissionWizard
                {...p}
                onChange={(next) =>
                  p.onChange({
                    ...next,
                    jobs: next.jobs.map((j) =>
                      j.id === job.id ? { ...j, inheritsFrom: undefined } : j,
                    ),
                  })
                }
                section="quality"
                onTerritoryEditing={undefined}
              />
            )}
            {selectedTab === 'time' && (
              <>
                <label className="mw-checkbox">
                  <input
                    type="checkbox"
                    checked={!!job.window}
                    onChange={(e) => {
                      if (e.target.checked)
                        patch({
                          window: { start: d.window.start, end: d.window.end },
                        });
                      else {
                        const next = { ...job };
                        delete next.window;
                        delete next.inheritsFrom;
                        p.onChange({
                          ...d,
                          jobs: d.jobs.map((j) => (j.id === job.id ? next : j)),
                        });
                      }
                    }}
                  />
                  Свой период выполнения
                </label>
                {(['start', 'end'] as const).map((key) => (
                  <MissionDateField
                    key={key}
                    label={
                      key === 'start'
                        ? 'Начало периода работы'
                        : 'Конец периода работы'
                    }
                    timezone={d.window.timezone}
                    disabled={!job.window}
                    value={(job.window ?? d.window)[key]}
                    onChange={(iso) =>
                      patch({
                        window: {
                          ...(job.window ?? {
                            start: d.window.start,
                            end: d.window.end,
                          }),
                          [key]: iso,
                        },
                      })
                    }
                  />
                ))}
                <label className="mw-field">
                  Освещённость
                  <select
                    value={job.daylight}
                    onChange={(e) =>
                      patch({
                        daylight: e.target.value as MissionJob['daylight'],
                      })
                    }
                  >
                    <option value="none">Без дополнительного правила</option>
                    <option value="sunAboveHorizon">
                      Солнце над горизонтом
                    </option>
                    <option value="topographicClearSky">
                      Топографическая RGB: Солнце ≥15°
                    </option>
                  </select>
                </label>
                <InfoHint label="Период работы">
                  Вылеты этой работы, включая возврат и посадку, должны
                  укладываться в выбранное окно. Даты указываются со смещением
                  часового пояса. Срок внутри общего периода миссии. Правило
                  освещённости не заменяет разрешение на полёт.
                </InfoHint>
              </>
            )}
            {selectedTab === 'vehicles' && (
              <>
                <div className="mw-actions">
                  <button className="mw-button small" onClick={p.onFleet}>
                    Общий парк БВС
                  </button>
                  {p.hasGlobalFleet && (
                    <button
                      className="mw-button small"
                      onClick={p.onUseGlobalFleet}
                    >
                      Обновить из общего парка
                    </button>
                  )}
                </div>
                <label className="mw-field">
                  Назначение
                  <select
                    value={job.assignedVehicleIds.length ? 'selected' : 'auto'}
                    onChange={(e) => {
                      if (e.target.value === 'auto')
                        patch({ assignedVehicleIds: [] });
                      else {
                        const v = d.scenario.vehicles.find(
                          (v) =>
                            v.enabled &&
                            v.jobs.includes(job.job.type) &&
                            vehiclePlanningEligibility(v).supported,
                        );
                        if (v) patch({ assignedVehicleIds: [v.id] });
                        else
                          p.onNotice?.(
                            'Нет совместимых аппаратов. Добавьте нужную комплектацию в парк.',
                          );
                      }
                    }}
                  >
                    <option value="auto">Автоматически</option>
                    <option value="selected">Из выбранных БВС</option>
                  </select>
                </label>
                <InfoHint label="Назначение БВС на работу">
                  Автовыбор использует включённые совместимые аппараты. Галочки
                  ограничивают разрешённый набор, но не требуют обязательного
                  вылета каждого. Окончательная выполнимость зависит от
                  маршрута, времени, погоды, заряда и остальных работ. Снятие
                  последней галочки возвращает автовыбор.
                </InfoHint>
                <div className="me-vehicle-list">
                  {d.scenario.vehicles.map((v) => {
                    const capability = vehiclePlanningEligibility(v);
                    const suitable =
                      v.enabled &&
                      v.jobs.includes(job.job.type) &&
                      capability.supported;
                    const state = p.fleetStates?.find((s) => s.id === v.id);
                    const reason = !suitable
                      ? !v.enabled
                        ? 'Недоступен'
                        : !v.jobs.includes(job.job.type)
                          ? 'Нет нужного оборудования'
                          : 'Неподдержанный профиль'
                      : state?.operationId
                        ? 'Занят в другой миссии'
                        : state && now - Date.parse(state.observedAt) > 300000
                          ? 'Состояние старше 5 минут — обновите'
                          : v.batteryPct <= d.scenario.reservePct
                            ? 'Заряд не превышает резерв'
                            : state && (!state.ready || !state.grounded)
                              ? 'Готовность не подтверждена'
                              : `Оборудование подходит · ${v.jobs.join(' / ')}`;
                    return (
                      <label
                        key={v.id}
                        className={`me-vehicle-option ${suitable ? 'is-compatible' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={job.assignedVehicleIds.includes(v.id)}
                          disabled={
                            !suitable && !job.assignedVehicleIds.includes(v.id)
                          }
                          onChange={(e) =>
                            patch({
                              assignedVehicleIds: e.target.checked
                                ? [...job.assignedVehicleIds, v.id]
                                : job.assignedVehicleIds.filter(
                                    (id) => id !== v.id,
                                  ),
                            })
                          }
                        />
                        {v.kind === 'fixedWing' ? (
                          <Plane size={18} />
                        ) : (
                          <Drone size={18} />
                        )}
                        <span>
                          <strong>{vehicleDisplayName(v)}</strong>
                          <small>{reason}</small>
                        </span>
                        <span>{v.batteryPct}%</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </fieldset>
        </section>
      </details>
      <details className="me-general me-section">
        <summary>
          <span className="me-section-title">Период и правила всей миссии</span>
          <InfoHint label="Общие правила миссии">
            Общий период ограничивает все работы. Вкладка «Время» задаёт более
            узкий период для выбранного участка. Сроки, погода и безопасное
            разнесение проверяются совместно.
          </InfoHint>
        </summary>
        <MissionWizard
          {...p}
          section="conditions"
          onTerritoryEditing={undefined}
        />
      </details>
    </div>
  );
}
