'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Camera,
  Check,
  Layers,
  MapPin,
  Plus,
  Radar,
  ScanLine,
  Thermometer,
  Trash2,
  Upload,
} from 'lucide-react';
import type { MissionDocument, MissionJob } from '@/lib/planner/mission-schema';
import {
  appendMissionWork,
  removeMissionWorks,
  workLabels,
} from '@/lib/planner/mission-editing';
import { Checkbox } from '@/components/ui/checkbox';
import MissionFleetEditor from './mission-fleet-editor';
import { qualityForJob } from '@/lib/planner/quality';
import { vehiclePlanningEligibility } from '@/lib/planner/fixed-wing-profile';
import { vehicleModelLabel } from '@/lib/planner/mission-vehicle-label';
import MissionWind from './mission-wind';
import { InfoHint } from './mission-help';

export const jobNames: Record<MissionJob['job']['type'], string> = {
  RGB: 'RGB · фотографии',
  MS: 'Мультиспектральная',
  IR: 'ИК · тепловая съёмка',
  LiDAR: 'LiDAR · лазерные точки',
  Geophysics: 'Геофизические измерения',
};
const editorGroups = [
  { title: 'Миссия', step: 0 },
  { title: 'Условия', step: 2 },
  { title: 'Парк', step: 3 },
] as const;
type Props = {
  section?: 'quality' | 'conditions';
  document: MissionDocument;
  onChange: (document: MissionDocument) => void;
  onNotice?: (message: string) => void;
  selectedJob: number;
  onSelectJob: (index: number) => void;
  onDraw: (
    mode: 'area' | 'airspace' | 'exclusion' | 'start' | 'landing' | 'reserve',
  ) => void;
  onImportGeometry: () => void;
  onExample: (area: 1 | 10 | 100) => void;
  onDone: () => void;
  onSave: () => void;
  territoryEditor?: ReactNode;
  onTerritoryEditing?: (value: boolean) => void;
  territoryIncomplete?: boolean;
};
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  unit = '',
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <label className="mw-field">
      <span>
        {label}
        {unit ? `, ${unit}` : ''}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          if (e.currentTarget.value !== '')
            onChange(Number(e.currentTarget.value));
        }}
      />
    </label>
  );
}
export default function MissionWizard({
  document: d,
  onChange,
  onNotice,
  selectedJob,
  onSelectJob,
  onDraw,
  onImportGeometry,
  onExample,
  territoryEditor,
  onTerritoryEditing,
  territoryIncomplete = false,
  section,
}: Props) {
  const [requestedStep, updateStep] = useState(territoryIncomplete ? 1 : 0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const step =
    section === 'quality'
      ? 4
      : section === 'conditions'
        ? 2
        : territoryIncomplete
          ? 1
          : requestedStep;
  const group = step <= 1 ? 0 : step;
  useEffect(() => {
    onTerritoryEditing?.(step === 1);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step, onTerritoryEditing]);
  const setStep = (value: number) => {
    if (territoryIncomplete && value !== 1) return;
    updateStep(value);
    onTerritoryEditing?.(value === 1);
  };
  const workControlId = useId();
  const job = d.jobs[selectedJob] ?? d.jobs[0];
  const derivedJob = qualityForJob(job).job;
  const patch = (value: Partial<MissionDocument>) =>
    onChange({ ...d, ...value });
  const patchScenario = (value: Partial<MissionDocument['scenario']>) =>
    patch({ scenario: { ...d.scenario, ...value } });
  const patchJob = (value: Partial<MissionJob>) =>
    patch({
      jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, ...value } : j)),
    });
  const patchPlanning = (value: Partial<MissionDocument['planning']>) =>
    patch({ planning: { ...d.planning, ...value } });
  const patchRestriction = (
    id: string,
    value: Partial<MissionDocument['restrictions'][number]>,
  ) =>
    patch({
      restrictions: d.restrictions.map((r) =>
        r.id === id ? { ...r, ...value } : r,
      ),
    });
  function selectType(type: MissionJob['job']['type'], checked: boolean) {
    if (territoryIncomplete) return;
    if (checked) {
      if (d.jobs.some((j) => j.job.type === type)) return;
      onChange(
        appendMissionWork(d, job.id, type, `job-${crypto.randomUUID()}`),
      );
      onSelectJob(d.jobs.length);
    } else {
      const removed = d.jobs.filter((j) => j.job.type === type);
      if (removed.length === d.jobs.length) return;
      if (
        !window.confirm(
          `Убрать «${workLabels[type]}» из миссии? Работы: ${removed.map((j) => j.name).join(', ')}. Их участки и настройки будут удалены из текущей миссии.`,
        )
      )
        return;
      const next = removeMissionWorks(
        d,
        removed.map((j) => j.id),
      );
      onChange(next);
      onSelectJob(
        Math.max(
          0,
          next.jobs.findIndex((j) => j.id === job.id),
        ),
      );
    }
  }
  function addJob() {
    if (territoryIncomplete) return;
    const clone: MissionJob = {
      ...structuredClone(job),
      id: `job-${crypto.randomUUID()}`,
      name: `${workLabels[job.job.type]} · участок ${d.jobs.length + 1}`,
      assignedVehicleIds: [],
    };
    patch({ jobs: [...d.jobs, clone] });
    onSelectJob(d.jobs.length);
  }
  return (
    <div className="mw-wizard mw-simple-editor">
      <nav
        className="mw-wizard-nav"
        aria-label="Разделы редактора"
        hidden={!!section}
      >
        {editorGroups.map(({ title, step: targetStep }) => (
          <button
            key={title}
            type="button"
            aria-label={title}
            disabled={territoryIncomplete && targetStep !== 0}
            aria-current={group === targetStep ? 'step' : undefined}
            title={title}
            onClick={() => setStep(territoryIncomplete ? 1 : targetStep)}
          >
            {title}
          </button>
        ))}
      </nav>
      <div className="mw-wizard-body" ref={bodyRef}>
        {group === 0 && (
          <div className="mw-editor-local-nav" aria-label="Состав миссии">
            <button
              type="button"
              aria-pressed={step === 0}
              disabled={territoryIncomplete}
              onClick={() => setStep(0)}
            >
              Работы
            </button>
            <button
              type="button"
              aria-pressed={step === 1}
              onClick={() => setStep(1)}
            >
              Территория
            </button>
          </div>
        )}
        {!section && step > 0 && step !== 3 && d.jobs.length > 1 && (
          <label className="mw-field mw-active-work">
            Настройки работы
            <select
              value={job.id}
              onChange={(e) =>
                onSelectJob(d.jobs.findIndex((j) => j.id === e.target.value))
              }
            >
              {d.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {step === 0 && (
          <>
            <label className="mw-field">
              Название миссии
              <input
                value={d.name}
                maxLength={100}
                onChange={(e) =>
                  patch({
                    name: e.target.value,
                    scenario: { ...d.scenario, name: e.target.value },
                  })
                }
              />
            </label>
            <fieldset className="mw-work-checklist" aria-label="Виды работ">
              {Object.entries(workLabels).map(([type, label], i) => {
                const Icon = [Camera, Layers, Thermometer, ScanLine, Radar][i];
                const typed = type as MissionJob['job']['type'];
                const count = d.jobs.filter((j) => j.job.type === type).length;
                return (
                  <label
                    className={`mw-work-option ${count ? 'active' : ''}`}
                    key={type}
                    htmlFor={`${workControlId}-${type}`}
                  >
                    <Icon size={20} />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {
                          [
                            'Цветные фотографии · RGB',
                            'Спектральные каналы · MS',
                            'Температура поверхности · ИК',
                            'Облако точек · LiDAR',
                            'Измерения физических полей',
                          ][i]
                        }
                        {count > 1 ? ` · ${count} участка` : ''}
                      </small>
                    </span>
                    <Checkbox
                      id={`${workControlId}-${type}`}
                      aria-label={label}
                      title={
                        count === d.jobs.length
                          ? 'Оставьте хотя бы один вид работ. Сначала добавьте другой.'
                          : label
                      }
                      checked={count > 0}
                      disabled={
                        count === d.jobs.length ||
                        (!count && d.jobs.length >= 8)
                      }
                      onCheckedChange={(checked) =>
                        selectType(typed, !!checked)
                      }
                    />
                  </label>
                );
              })}
            </fieldset>
            <details className="mw-details mw-work-details">
              <summary>
                Участки и названия работ · {d.jobs.length}{' '}
                <InfoHint label="Участки для разных работ">
                  Новый вид получает копию выбранного участка. Изменить границы
                  можно в «Территория».
                </InfoHint>
              </summary>
              <label className="mw-field">
                Выбранная работа
                <select
                  value={job.id}
                  onChange={(e) =>
                    onSelectJob(
                      d.jobs.findIndex((j) => j.id === e.target.value),
                    )
                  }
                >
                  {d.jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mw-field">
                Название участка / работы
                <input
                  value={job.name}
                  maxLength={100}
                  onChange={(e) => patchJob({ name: e.target.value })}
                />
              </label>
              <div className="mw-actions">
                <button
                  className="mw-button small mw-action-add"
                  disabled={d.jobs.length >= 8}
                  onClick={addJob}
                >
                  <Plus size={13} />
                  Ещё участок этого типа
                </button>
                {d.jobs.length > 1 && (
                  <button
                    className="mw-button small danger mw-action-remove"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Удалить работу «${job.name}» и её участок?`,
                        )
                      )
                        return;
                      onChange(removeMissionWorks(d, [job.id]));
                      onSelectJob(0);
                    }}
                  >
                    <Trash2 size={13} />
                    Удалить эту работу
                  </button>
                )}
              </div>
            </details>
          </>
        )}
        {step === 1 && (
          <>
            {territoryEditor ?? (
              <>
                <h3>
                  Где выполнить работу?{' '}
                  <InfoHint label="Область работ и граница полётов">
                    Синяя область — работы. Зелёная граница — допустимый объём
                    полётов, а не официальное разрешение. При перерисовке
                    геометрия выбранной работы заменяется.
                  </InfoHint>
                </h3>
                {d.jobs.length === 1 && (
                  <label className="mw-field">
                    Редактируемая работа
                    <select
                      value={job.id}
                      onChange={(e) =>
                        onSelectJob(
                          d.jobs.findIndex((j) => j.id === e.target.value),
                        )
                      }
                    >
                      {d.jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="mw-actions">
                  <button className="mw-button" onClick={() => onDraw('area')}>
                    <MapPin size={15} />
                    Нарисовать область
                  </button>
                  <button className="mw-button" onClick={onImportGeometry}>
                    <Upload size={15} />
                    GeoJSON / KML
                  </button>
                  <button
                    className="mw-button small"
                    onClick={() => onDraw('airspace')}
                  >
                    Граница полётов
                  </button>
                </div>
                <p className="mw-caption" style={{ marginTop: 12 }}>
                  {job.area.coordinates.length - 1} отверстий;{' '}
                  {job.area.coordinates[0].length - 1} вершин внешней границы.
                </p>
              </>
            )}
            <hr className="mw-separator" />
            <details>
              <summary>
                Учебные участки · размер в км²{' '}
                <InfoHint label="Что загружают учебные участки">
                  Откроется предпросмотр новой миссии. 100 км² — нагрузочная
                  проверка, не обещание полного покрытия текущим парком.
                </InfoHint>
              </summary>
              <div className="mw-actions">
                {([1, 10, 100] as const).map((n) => (
                  <button
                    key={n}
                    className="mw-button"
                    onClick={() => onExample(n)}
                  >
                    {n} км²
                  </button>
                ))}
              </div>
            </details>
          </>
        )}
        {step === 2 && (
          <>
            <h3>
              Время работы{' '}
              <InfoHint label="Даты и время расчёта">
                Расчёт и симуляция используют эти даты. Формат ISO 8601: дата T
                время + смещение от UTC. Реальных команд на вылет нет.
              </InfoHint>
            </h3>
            <label className="mw-field">
              Начало окна
              <input
                value={d.window.start}
                onChange={(e) =>
                  patch({ window: { ...d.window, start: e.target.value } })
                }
                placeholder="2026-09-24T10:00:00+03:00"
              />
            </label>
            <label className="mw-field">
              Конец окна
              <input
                value={d.window.end}
                onChange={(e) =>
                  patch({ window: { ...d.window, end: e.target.value } })
                }
                placeholder="2026-09-24T18:00:00+03:00"
              />
            </label>
            <details className="mw-details mw-editor-detail">
              <summary>
                Часовой пояс и освещённость{' '}
                <InfoHint label="Часовой пояс и правила освещённости">
                  Смещение в дате определяет момент; пояс — отображение
                  расписания. Правило 15° относится к ясной погоде и
                  топографической аэрофотосъёмке. Не является общим запретом
                  ночных работ или разрешением полёта.
                </InfoHint>
              </summary>
              <label className="mw-field">
                Часовой пояс
                <input
                  value={d.window.timezone}
                  onChange={(e) =>
                    patch({ window: { ...d.window, timezone: e.target.value } })
                  }
                  placeholder="Europe/Moscow"
                />
              </label>
              <label className="mw-field">
                Освещённость для «{job.name}»
                <select
                  value={job.daylight}
                  onChange={(e) =>
                    patchJob({
                      daylight: e.target.value as MissionJob['daylight'],
                    })
                  }
                >
                  <option value="none">Нет дополнительного правила</option>
                  <option value="sunAboveHorizon">Солнце над горизонтом</option>
                  <option value="topographicClearSky">
                    Топографическая RGB: Солнце ≥15°
                  </option>
                </select>
              </label>
            </details>
          </>
        )}
        {step === 3 && (
          <>
            <div className="mw-editor-fleet-overview">
              <strong>
                {
                  d.scenario.vehicles.filter((vehicle) => vehicle.enabled)
                    .length
                }
                {' из '}
                {d.scenario.vehicles.length} БВС включены в подбор{' '}
                <InfoHint label="Что означает состав парка в редакторе?">
                  Это входные профили, не подтверждение готовности к вылету.
                  Расчёт проверит совместимость работ, ветер, энергию,
                  ограничения маршрута и разделение БВС. Актуальное состояние
                  зарегистрированных аппаратов проверяется отдельно.
                </InfoHint>
              </strong>
              <span>
                {d.jobs.every((work) => work.assignedVehicleIds.length === 0)
                  ? 'Состав группы выбирает алгоритм'
                  : 'Есть ручные назначения'}
              </span>
            </div>
            <ul className="mw-editor-fleet-list" aria-label="БВС для расчёта">
              {d.scenario.vehicles.map((vehicle) => {
                const eligibility = vehiclePlanningEligibility(vehicle);
                return (
                  <li key={vehicle.id}>
                    <span>
                      <strong>{vehicle.name}</strong>
                      <small>
                        {vehicleModelLabel(vehicle)} ·{' '}
                        {vehicle.jobs.join(' / ')}
                      </small>
                      {!eligibility.supported && (
                        <small
                          className="mw-editor-unsupported"
                          title={eligibility.reasons.join(' ')}
                        >
                          {eligibility.model === 'unsupported-fixed-wing'
                            ? 'Самолётные полёты не поддержаны'
                            : 'Профиль не поддержан: превышены допустимые параметры'}
                        </small>
                      )}
                    </span>
                    <span>
                      {vehicle.enabled
                        ? `Заряд ${d.batteries.find((battery) => battery.vehicleId === vehicle.id)?.initialPct ?? vehicle.batteryPct}%`
                        : 'Выключен'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <details className="mw-details mw-editor-detail">
              <summary>Добавить БВС · Gemini, 801, 201 / изменить парк</summary>
              <MissionFleetEditor
                document={d}
                onChange={onChange}
                onNotice={onNotice}
              />
            </details>
            <details className="mw-details mw-editor-detail">
              <summary>Подготовка и повторный вылет</summary>
              <div className="mw-field-row">
                <NumberField
                  label="Подготовка"
                  unit="мин"
                  max={120}
                  value={d.planning.preparationSec / 60}
                  onChange={(n) => patchPlanning({ preparationSec: n * 60 })}
                />
                <NumberField
                  label="Проверка перед повторным вылетом"
                  unit="мин"
                  min={1 / 60}
                  max={240}
                  step={0.5}
                  value={d.planning.serviceSec / 60}
                  onChange={(n) => patchPlanning({ serviceSec: n * 60 })}
                />
              </div>
            </details>
          </>
        )}
        {step === 2 && (
          <>
            <h3 className="mw-editor-section-title">Ветер и безопасность</h3>
            <MissionWind
              forecast={!!d.weather}
              speedMps={d.scenario.wind.speedMps}
              fromDeg={d.scenario.wind.fromDeg}
            />
            <div className="mw-field-row">
              <NumberField
                label="Ветер"
                unit="м/с"
                max={30}
                step={0.5}
                value={d.scenario.wind.speedMps}
                onChange={(n) =>
                  patchScenario({ wind: { ...d.scenario.wind, speedMps: n } })
                }
              />
              <NumberField
                label="Ветер от"
                unit="°"
                max={359}
                value={d.scenario.wind.fromDeg}
                onChange={(n) =>
                  patchScenario({ wind: { ...d.scenario.wind, fromDeg: n } })
                }
              />
            </div>
            <details className="mw-details">
              <summary>
                <span>Облачность и видимость</span>{' '}
                <InfoHint label="Источники облачности и видимости">
                  Дополнительные данные вводит оператор. Прогноз подключается
                  отдельно через «Погода и условия». Пустые поля означают
                  неизвестные значения, а не отсутствие ограничений. Граница
                  облаков задаётся в общей локальной системе высот траекторий,
                  не над реальным рельефом. Минимум видимости задаёт оператор;
                  нормативы и разрешения не подставляются автоматически.
                </InfoHint>
              </summary>
              <label className="mw-checkbox">
                <input
                  type="checkbox"
                  checked={!!d.environment}
                  onChange={(e) => {
                    if (e.target.checked)
                      patch({
                        environment: {
                          cloudBaseM: null,
                          cloudClearanceM: 30,
                          visibilityM: null,
                          minVisibilityM: null,
                          source:
                            'Параметры оператора: фактическая погода требует подтверждения.',
                        },
                      });
                    else {
                      const next = { ...d };
                      delete next.environment;
                      onChange(next);
                    }
                  }}
                />
                Учитывать облачность и видимость
              </label>
              {d.environment && (
                <>
                  {(
                    [
                      ['Нижняя граница облаков, м', 'cloudBaseM', 20000],
                      ['Фактическая видимость, м', 'visibilityM', 100000],
                      [
                        'Минимальная допустимая видимость, м',
                        'minVisibilityM',
                        100000,
                      ],
                    ] as const
                  ).map(([label, key, max]) => (
                    <label className="mw-field" key={key}>
                      {label}
                      <input
                        type="number"
                        min={0}
                        max={max}
                        step={1}
                        value={d.environment![key] ?? ''}
                        placeholder="Неизвестно"
                        onChange={(e) => {
                          if (!d.environment) return;
                          const value =
                            e.target.value === ''
                              ? null
                              : e.target.valueAsNumber;
                          if (value === null || Number.isFinite(value))
                            patch({
                              environment: { ...d.environment, [key]: value },
                            });
                        }}
                      />
                    </label>
                  ))}
                  <NumberField
                    label="Запас до облаков"
                    unit="м"
                    min={0}
                    max={6000}
                    value={d.environment.cloudClearanceM}
                    onChange={(n) =>
                      patch({
                        environment: { ...d.environment!, cloudClearanceM: n },
                      })
                    }
                  />
                  <label className="mw-field">
                    Источник условий
                    <textarea
                      value={d.environment.source}
                      maxLength={500}
                      onChange={(e) =>
                        patch({
                          environment: {
                            ...d.environment!,
                            source: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </>
              )}
            </details>
            <details className="mw-details mw-editor-detail">
              <summary>
                Расстояния и резерв батареи · {d.scenario.reservePct}%{' '}
                <InfoHint label="Что означают резерв и безопасные расстояния?">
                  Резерв — минимально допустимый остаток батареи при посадке, а
                  не потраченный заряд. XY — горизонтальный зазор между БВС; Z —
                  вертикальный. Это настраиваемые ограничения нашей модели, не
                  универсальные нормы и не разрешение на полёт.
                </InfoHint>
              </summary>
              <div className="mw-field-row">
                <NumberField
                  label="Резерв АКБ"
                  unit="%"
                  min={10}
                  max={80}
                  value={d.scenario.reservePct}
                  onChange={(n) => patchScenario({ reservePct: n })}
                />
                <NumberField
                  label="Зазор до зон"
                  unit="м"
                  min={2}
                  max={100}
                  value={d.scenario.clearanceM}
                  onChange={(n) => patchScenario({ clearanceM: n })}
                />
              </div>
              <div className="mw-field-row">
                <NumberField
                  label="Между БВС XY"
                  unit="м"
                  min={1}
                  max={2000}
                  value={d.planning.separationHorizontalM}
                  onChange={(n) => patchPlanning({ separationHorizontalM: n })}
                />
                <NumberField
                  label="Между БВС Z"
                  unit="м"
                  min={1}
                  max={500}
                  value={d.planning.separationVerticalM}
                  onChange={(n) => patchPlanning({ separationVerticalM: n })}
                />
              </div>
              <label className="mw-field">
                Источник интервалов
                <textarea
                  value={d.planning.separationSource}
                  maxLength={500}
                  onChange={(e) =>
                    patchPlanning({ separationSource: e.target.value })
                  }
                />
              </label>
            </details>
            <details className="mw-details mw-editor-detail">
              <summary>
                Запреты и препятствия ·{' '}
                {d.restrictions.length + d.scenario.exclusions.length}{' '}
                <InfoHint label="Неизвестная высота препятствия">
                  Неизвестная высота препятствия закрывает весь столб воздуха.
                </InfoHint>
              </summary>
              <div className="mw-actions">
                <button
                  className="mw-button small mw-action-add"
                  onClick={() => onDraw('exclusion')}
                >
                  Нарисовать запрет
                </button>
                <button className="mw-button small" onClick={onImportGeometry}>
                  Загрузить слой
                </button>
                <button
                  className="mw-button small mw-action-add"
                  onClick={() => onDraw('reserve')}
                >
                  Резервная посадка
                </button>
              </div>
              {d.restrictions.map((r) => (
                <div className="mw-card" key={r.id}>
                  <strong>{r.name}</strong>
                  <p>
                    {r.kind === 'obstacle' ? 'Препятствие' : 'Запрет'} ·{' '}
                    {r.maxAltitudeM === null
                      ? 'вся высота'
                      : `${r.minAltitudeM}–${r.maxAltitudeM} м`}
                  </p>
                  <p>{r.startAt ? `${r.startAt} — ${r.endAt}` : 'Всё окно'}</p>
                  <details className="mw-details">
                    <summary>Изменить объём и время</summary>
                    <label className="mw-field">
                      Название
                      <input
                        value={r.name}
                        maxLength={100}
                        onChange={(e) =>
                          patchRestriction(r.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <label className="mw-field">
                      Тип
                      <select
                        value={r.kind}
                        onChange={(e) =>
                          patchRestriction(r.id, {
                            kind: e.target.value as typeof r.kind,
                          })
                        }
                      >
                        <option value="noFlight">Запрет полёта</option>
                        <option value="obstacle">Препятствие</option>
                      </select>
                    </label>
                    <NumberField
                      label="Нижняя граница"
                      unit="м"
                      min={-500}
                      max={6000}
                      value={r.minAltitudeM}
                      onChange={(n) =>
                        patchRestriction(r.id, { minAltitudeM: n })
                      }
                    />
                    <label className="mw-checkbox">
                      <input
                        type="checkbox"
                        checked={r.maxAltitudeM === null}
                        onChange={(e) =>
                          patchRestriction(r.id, {
                            maxAltitudeM: e.target.checked
                              ? null
                              : Math.max(r.minAltitudeM, 100),
                          })
                        }
                      />
                      Высота неизвестна / весь столб
                    </label>
                    {r.maxAltitudeM !== null && (
                      <NumberField
                        label="Верхняя граница"
                        unit="м"
                        min={-500}
                        max={6000}
                        value={r.maxAltitudeM}
                        onChange={(n) =>
                          patchRestriction(r.id, { maxAltitudeM: n })
                        }
                      />
                    )}
                    <label className="mw-checkbox">
                      <input
                        type="checkbox"
                        checked={r.startAt !== null}
                        onChange={(e) =>
                          patchRestriction(r.id, {
                            startAt: e.target.checked ? d.window.start : null,
                            endAt: e.target.checked ? d.window.end : null,
                          })
                        }
                      />
                      Ограничить период активности
                    </label>
                    {r.startAt !== null && (
                      <>
                        <label className="mw-field">
                          Действует с
                          <input
                            value={r.startAt}
                            onChange={(e) =>
                              patchRestriction(r.id, {
                                startAt: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="mw-field">
                          Действует до
                          <input
                            value={r.endAt ?? ''}
                            onChange={(e) =>
                              patchRestriction(r.id, { endAt: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    <label className="mw-field">
                      Источник
                      <textarea
                        value={r.source}
                        maxLength={500}
                        onChange={(e) =>
                          patchRestriction(r.id, { source: e.target.value })
                        }
                      />
                    </label>
                  </details>
                  <button
                    className="mw-button small danger mw-action-remove"
                    onClick={() =>
                      patch({
                        restrictions: d.restrictions.filter(
                          (x) => x.id !== r.id,
                        ),
                      })
                    }
                  >
                    Удалить
                  </button>
                </div>
              ))}
              {d.scenario.exclusions.map((_, index) => (
                <div className="mw-card" key={`old-${index}`}>
                  Постоянный запрет {index + 1}
                  <button
                    className="mw-button small danger mw-action-remove"
                    onClick={() =>
                      patchScenario({
                        exclusions: d.scenario.exclusions.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </details>
            <p
              className={`mw-editor-terrain-status ${d.terrainModel.kind === 'unknown' ? 'warning' : ''}`}
            >
              {d.terrainModel.kind === 'flat'
                ? 'Рельеф: принято допущение плоской поверхности'
                : 'Рельеф неизвестен — безопасность по высотам не подтверждена'}
            </p>
            <details className="mw-details mw-editor-detail">
              <summary>
                Высоты и модель рельефа{' '}
                <InfoHint label="Высоты и разрешение на полёт">
                  Высоты — относительно старта в текущей модели. Реальный DEM не
                  подключён. Выбор плоской поверхности — допущение, не загрузка
                  высот из карты. Юридические разрешения не проверяются.
                </InfoHint>
              </summary>
              <div className="mw-field-row">
                <NumberField
                  label="Ниже при съёмке нельзя"
                  unit="м"
                  max={1000}
                  value={d.flightEnvelope.minSurveyAltitudeM}
                  onChange={(n) =>
                    patch({
                      flightEnvelope: {
                        ...d.flightEnvelope,
                        minSurveyAltitudeM: n,
                      },
                    })
                  }
                />
                <NumberField
                  label="Потолок"
                  unit="м"
                  min={10}
                  max={6000}
                  value={d.flightEnvelope.maxAltitudeM}
                  onChange={(n) =>
                    patch({
                      flightEnvelope: { ...d.flightEnvelope, maxAltitudeM: n },
                    })
                  }
                />
              </div>
              <details className="mw-details">
                <summary>Источник высот и модель рельефа</summary>
                <label className="mw-field">
                  Модель
                  <select
                    value={d.terrainModel.kind}
                    onChange={(e) =>
                      patch({
                        terrainModel:
                          e.target.value === 'flat'
                            ? {
                                kind: 'flat',
                                elevationM: 0,
                                source:
                                  'Оператор принял учебную горизонтальную поверхность. Реальный DEM не загружен.',
                              }
                            : {
                                kind: 'unknown',
                                source: 'Высоты рельефа не предоставлены.',
                              },
                      })
                    }
                  >
                    <option value="unknown">Рельеф неизвестен</option>
                    <option value="flat">
                      Явное допущение: плоская поверхность
                    </option>
                  </select>
                </label>
                <label className="mw-field">
                  Обоснование пределов высот
                  <textarea
                    value={d.flightEnvelope.source}
                    maxLength={500}
                    onChange={(e) =>
                      patch({
                        flightEnvelope: {
                          ...d.flightEnvelope,
                          source: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </details>
            </details>
          </>
        )}
        {(step === 0 || step === 4) && (
          <details
            className="mw-details mw-editor-detail"
            open={section === 'quality' ? true : undefined}
          >
            <summary>
              {!section && 'Приоритет · '}Высота и качество съёмки{' '}
              <InfoHint label="Как сравниваются приоритеты миссии">
                Рассчитаем оба критерия на одном входе. Одинаковые результаты не
                выдаём за разную выгоду. Пример: два БВС по 20 минут —
                завершение через 20 минут, общий налёт 40. Один БВС за 30 минут
                завершит позже, но общий налёт меньше: 30 вместо 40 минут.
              </InfoHint>
            </summary>
            {!section && d.jobs.length > 1 && (
              <label className="mw-field">
                Работа для настройки качества
                <select
                  value={job.id}
                  onChange={(event) =>
                    onSelectJob(
                      d.jobs.findIndex(
                        (work) => work.id === event.target.value,
                      ),
                    )
                  }
                >
                  {d.jobs.map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className={`mw-choice ${d.scenario.objective === 'makespan' ? 'active' : ''}`}
              hidden={!!section}
              onClick={() => patchScenario({ objective: 'makespan' })}
            >
              <Check size={16} />
              <span>
                <strong>Раньше завершить миссию</strong>
              </span>
            </button>
            <button
              className={`mw-choice ${d.scenario.objective === 'flightTime' ? 'active' : ''}`}
              hidden={!!section}
              onClick={() => patchScenario({ objective: 'flightTime' })}
            >
              <Check size={16} />
              <span>
                <strong>Снизить общий налёт</strong>
              </span>
            </button>
            <label className="mw-field" hidden={!!section}>
              Предпочтение по высоте
              <select
                value={d.planning.altitudePreference}
                onChange={(e) =>
                  patchPlanning({
                    altitudePreference: e.target
                      .value as MissionDocument['planning']['altitudePreference'],
                  })
                }
              >
                <option value="balanced">Оставить заданную высоту</option>
                <option value="lower">Ниже, если ограничения допускают</option>
                <option value="higher">Выше, если качество допускает</option>
              </select>
            </label>
            <NumberField
              label="Высота текущей работы"
              unit="м"
              min={10}
              max={500}
              value={job.job.altitudeM}
              onChange={(n) => patchJob({ job: { ...job.job, altitudeM: n } })}
            />
            <details className="mw-details">
              <summary>
                Параметры покрытия / сенсора{' '}
                <InfoHint label="Откуда берутся полоса и шаг съёмки">
                  При параметрической модели ядро пересчитает полосу из сенсора,
                  высоты и качества. Источник и основание профиля задаются ниже.
                </InfoHint>
              </summary>
              <div style={{ marginTop: 10 }}>
                <div className="mw-field-row">
                  <NumberField
                    label="Полоса"
                    unit="м"
                    min={5}
                    max={500}
                    value={derivedJob.swathM}
                    disabled={
                      job.quality.mode !== 'manual' &&
                      job.quality.mode !== 'geophysics'
                    }
                    onChange={(n) =>
                      patchJob({ job: { ...job.job, swathM: n } })
                    }
                  />
                  <NumberField
                    label="Перекрытие сбоку"
                    unit="%"
                    max={95}
                    value={job.job.sideOverlap * 100}
                    onChange={(n) =>
                      patchJob({ job: { ...job.job, sideOverlap: n / 100 } })
                    }
                  />
                </div>
                <NumberField
                  label="Шаг срабатывания"
                  unit="м"
                  min={1}
                  max={200}
                  step={0.1}
                  value={derivedJob.triggerDistanceM}
                  disabled={job.quality.mode === 'camera'}
                  onChange={(n) =>
                    patchJob({ job: { ...job.job, triggerDistanceM: n } })
                  }
                />
                <p className="mw-caption">Режим профиля: {job.quality.mode}</p>
                <label className="mw-field">
                  Основание профиля
                  <select
                    value={job.quality.status}
                    onChange={(e) =>
                      patchJob({
                        quality: {
                          ...job.quality,
                          status: e.target
                            .value as MissionJob['quality']['status'],
                        },
                      })
                    }
                  >
                    <option value="assumed">Учебное допущение</option>
                    <option value="documented">
                      Документировано для комплектации
                    </option>
                    <option value="unknown">Параметры неизвестны</option>
                  </select>
                </label>
                <label className="mw-field">
                  Источник параметров сенсора
                  <textarea
                    value={job.quality.source}
                    maxLength={500}
                    onChange={(e) =>
                      patchJob({
                        quality: { ...job.quality, source: e.target.value },
                      })
                    }
                  />
                </label>
                {job.quality.mode === 'camera' && (
                  <>
                    <NumberField
                      label="Требуемый GSD"
                      unit="см/пиксель"
                      min={0.01}
                      max={1000}
                      step={0.1}
                      value={job.quality.maximumGsdCm ?? 3}
                      onChange={(n) =>
                        patchJob({
                          quality: { ...job.quality, maximumGsdCm: n },
                        })
                      }
                    />
                    <NumberField
                      label="Продольное перекрытие"
                      unit="%"
                      max={95}
                      value={(job.quality.forwardOverlap ?? 0.7) * 100}
                      onChange={(n) =>
                        patchJob({
                          quality: { ...job.quality, forwardOverlap: n / 100 },
                        })
                      }
                    />
                    <NumberField
                      label="Минимальный период кадров"
                      unit="с"
                      min={0.01}
                      max={60}
                      step={0.1}
                      value={job.quality.minimumIntervalSec ?? 1}
                      onChange={(n) =>
                        patchJob({
                          quality: { ...job.quality, minimumIntervalSec: n },
                        })
                      }
                    />
                  </>
                )}
                {job.quality.mode === 'lidar' && (
                  <NumberField
                    label="Минимальная средняя плотность"
                    unit="точек/м²"
                    min={0.01}
                    max={10000}
                    value={job.quality.minimumDensityM2 ?? 20}
                    onChange={(n) =>
                      patchJob({
                        quality: { ...job.quality, minimumDensityM2: n },
                      })
                    }
                  />
                )}
                {job.quality.mode === 'geophysics' && (
                  <NumberField
                    label="Максимальный шаг измерений"
                    unit="м"
                    min={0.01}
                    max={1000}
                    step={0.1}
                    value={job.quality.maximumSampleSpacingM ?? 1}
                    onChange={(n) =>
                      patchJob({
                        quality: { ...job.quality, maximumSampleSpacingM: n },
                      })
                    }
                  />
                )}
                {job.quality.mode === 'manual' && (
                  <label className="mw-field">
                    Обоснование ручных параметров
                    <textarea
                      value={job.job.qualitySource}
                      maxLength={400}
                      onChange={(e) =>
                        patchJob({
                          job: { ...job.job, qualitySource: e.target.value },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            </details>
          </details>
        )}
        {step === 0 && (
          <details className="mw-details mw-editor-detail">
            <summary>
              Сводка, комментарий и полный JSON{' '}
              <InfoHint label="Перед подтверждением миссии">
                Модельная симуляция. Паспортные максимумы не заменяют измерения;
                карта не является разрешением на полёт. Неизвестные данные будут
                показаны отдельно. Комментарий сохраняется, но не задаёт скрытых
                правил расчёта.
              </InfoHint>
            </summary>
            <div className="mw-card">
              <h3>{d.name || 'Без названия'}</h3>
              {d.jobs.map((j) => (
                <p className="mw-caption" key={j.id}>
                  {j.name} · {jobNames[j.job.type]} · {j.job.altitudeM} м
                </p>
              ))}
              <dl className="mw-definition">
                <dt>Доступные БВС</dt>
                <dd>{d.scenario.vehicles.filter((v) => v.enabled).length}</dd>
                <dt>Ветер</dt>
                <dd>{d.scenario.wind.speedMps} м/с</dd>
                <dt>Резерв</dt>
                <dd>{d.scenario.reservePct}%</dd>
              </dl>
              <p className="mw-caption">
                {d.window.start}
                <br />
                {d.window.end}
              </p>
            </div>
            <label className="mw-field">
              Комментарий оператора
              <textarea
                value={d.notes}
                maxLength={2000}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
            <details className="mw-details">
              <summary>Миссия целиком · JSON</summary>
              <pre>{JSON.stringify(d, null, 2)}</pre>
            </details>
          </details>
        )}
      </div>
    </div>
  );
}
