'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
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
import { createDemoQuality } from '@/lib/planner/mission-demo';
import MissionFleetEditor from './mission-fleet-editor';
import { qualityForJob } from '@/lib/planner/quality';

export const jobNames: Record<MissionJob['job']['type'], string> = {
  RGB: 'RGB · фотографии',
  MS: 'Мультиспектральная',
  IR: 'ИК · тепловая съёмка',
  LiDAR: 'LiDAR · лазерные точки',
  Geophysics: 'Геофизические измерения',
};
const steps = [
  'Работы',
  'Территория',
  'Срок',
  'Ресурсы',
  'Правила',
  'Приоритет',
  'Проверка',
];
type Props = {
  document: MissionDocument;
  onChange: (document: MissionDocument) => void;
  selectedJob: number;
  onSelectJob: (index: number) => void;
  onDraw: (
    mode: 'area' | 'airspace' | 'exclusion' | 'start' | 'landing' | 'reserve',
  ) => void;
  onImportGeometry: () => void;
  onExample: (area: 1 | 10 | 100) => void;
  onDone: () => void;
  onSave: () => void;
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
  selectedJob,
  onSelectJob,
  onDraw,
  onImportGeometry,
  onExample,
  onDone,
  onSave,
}: Props) {
  const [step, setStep] = useState(0);
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
  function changeType(type: MissionJob['job']['type']) {
    if (type === job.job.type) return;
    // A sensor change never inherits an unrelated camera's certified-looking numbers.
    const quality = createDemoQuality(type);
    patchJob({
      job: { ...job.job, type, qualitySource: quality.source },
      quality,
      daylight: type === 'RGB' ? 'topographicClearSky' : 'none',
      assignedVehicleIds: [],
    });
  }
  function addJob() {
    const clone: MissionJob = {
      ...structuredClone(job),
      id: `job-${Date.now()}`,
      name: `Работа ${d.jobs.length + 1}`,
      assignedVehicleIds: [],
    };
    patch({ jobs: [...d.jobs, clone] });
    onSelectJob(d.jobs.length);
  }
  return (
    <div className="mw-wizard">
      <nav className="mw-wizard-nav" aria-label="Шаги создания миссии">
        {steps.map((title, index) => (
          <button
            key={title}
            type="button"
            aria-label={`${index + 1}. ${title}`}
            aria-current={step === index ? 'step' : undefined}
            title={title}
            onClick={() => setStep(index)}
          >
            {index + 1}
          </button>
        ))}
      </nav>
      <div className="mw-wizard-body">
        <span className="mw-section-label">ШАГ {step + 1} ИЗ 7</span>
        {step === 0 && (
          <>
            <h3>Что нужно получить?</h3>
            <p>
              Выберите работу. Система сама распределит её между совместимыми
              БВС.
            </p>
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
            <label className="mw-field">
              Работа
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
            <label className="mw-field">
              Название работы
              <input
                value={job.name}
                maxLength={100}
                onChange={(e) => patchJob({ name: e.target.value })}
              />
            </label>
            {Object.entries(jobNames).map(([type, label], i) => {
              const Icon = [Camera, Layers, Thermometer, ScanLine, Radar][i];
              return (
                <button
                  className={`mw-choice ${job.job.type === type ? 'active' : ''}`}
                  key={type}
                  onClick={() => changeType(type as MissionJob['job']['type'])}
                  aria-pressed={job.job.type === type}
                >
                  <Icon size={17} />
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {
                        [
                          'Снимки для карты и измерений',
                          'Различия растительности в спектральных каналах',
                          'Распределение температур на участке',
                          'Плотность облака точек и шаг проходов',
                          'Линии измерений поля и шаг отсчётов',
                        ][i]
                      }
                    </small>
                  </span>
                </button>
              );
            })}
            <div className="mw-actions">
              <button
                className="mw-button small"
                disabled={d.jobs.length >= 8}
                onClick={addJob}
              >
                <Plus size={13} />
                Добавить работу
              </button>
              {d.jobs.length > 1 && (
                <button
                  className="mw-button small danger"
                  onClick={() => {
                    patch({ jobs: d.jobs.filter((j) => j.id !== job.id) });
                    onSelectJob(0);
                  }}
                >
                  <Trash2 size={13} />
                  Удалить
                </button>
              )}
            </div>
            <p className="mw-caption" style={{ marginTop: 12 }}>
              Тип работы не подтверждает наличие сенсора у БВС. Недостающие
              параметры будут отмечены в проверках.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <h3>Где выполнить работу?</h3>
            <p>
              Синяя область — работы. Зелёная граница — допустимый объём
              полётов, а не официальное разрешение.
            </p>
            <label className="mw-field">
              Редактируемая работа
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
              {job.area.coordinates[0].length - 1} вершин внешней границы. При
              перерисовке геометрия выбранной работы заменяется.
            </p>
            <hr className="mw-separator" />
            <div className="mw-section-label">Контрольные сценарии</div>
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
            <p className="mw-caption" style={{ marginTop: 10 }}>
              Откроется предпросмотр нового задания. 100 км² — нагрузочная
              проверка, не обещание полного покрытия текущим парком.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Когда можно работать?</h3>
            <p>
              Расчёт и симуляция используют эти даты. Реальных команд на вылет
              нет.
            </p>
            <label className="mw-field">
              Начало окна
              <input
                value={d.window.start}
                onChange={(e) =>
                  patch({ window: { ...d.window, start: e.target.value } })
                }
                placeholder="2026-09-24T10:00:00+03:00"
              />
              <small>ISO 8601: дата T время + смещение от UTC</small>
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
            <label className="mw-field">
              Часовой пояс
              <input
                value={d.window.timezone}
                onChange={(e) =>
                  patch({ window: { ...d.window, timezone: e.target.value } })
                }
                placeholder="Europe/Moscow"
              />
              <small>
                Смещение в дате определяет момент; пояс — отображение
                расписания.
              </small>
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
            <p className="mw-caption">
              Правило 15° относится к ясной погоде и топографической
              аэрофотосъёмке. Не является общим запретом ночных работ или
              разрешением полёта.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <MissionFleetEditor document={d} onChange={onChange} />
            <div className="mw-field-row">
              <NumberField
                label="Подготовка"
                unit="мин"
                max={120}
                value={d.planning.preparationSec / 60}
                onChange={(n) => patchPlanning({ preparationSec: n * 60 })}
              />
              <NumberField
                label="Обслуживание"
                unit="мин"
                min={1 / 60}
                max={240}
                step={0.5}
                value={d.planning.serviceSec / 60}
                onChange={(n) => patchPlanning({ serviceSec: n * 60 })}
              />
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h3>Какие ограничения?</h3>
            <p>
              Запреты и резерв важнее предпочтений. Неизвестная высота
              препятствия закрывает весь столб воздуха.
            </p>
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
              <summary>Облачность и видимость</summary>
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
              <p className="mw-caption">
                Данные вводит оператор. Прогноз погоды не загружается. Пустые
                поля означают неизвестные значения, а не отсутствие ограничений.
              </p>
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
                  <p className="mw-caption">
                    Граница облаков задаётся в общей локальной системе высот
                    траекторий. Это не высота над реальным рельефом. Минимум
                    видимости задаёт оператор; нормативы и разрешения не
                    подставляются автоматически.
                  </p>
                </>
              )}
            </details>
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
            <div className="mw-actions">
              <button
                className="mw-button small"
                onClick={() => onDraw('exclusion')}
              >
                Нарисовать запрет
              </button>
              <button className="mw-button small" onClick={onImportGeometry}>
                Загрузить слой
              </button>
              <button
                className="mw-button small"
                onClick={() => onDraw('reserve')}
              >
                Резервная посадка
              </button>
            </div>
            <details className="mw-details">
              <summary>
                Запреты и препятствия ·{' '}
                {d.restrictions.length + d.scenario.exclusions.length}
              </summary>
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
                    className="mw-button small danger"
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
                    className="mw-button small danger"
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
            <hr className="mw-separator" />
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
            <p className="mw-caption">
              Высоты — относительно старта в текущей модели. Рельеф:{' '}
              {d.terrainModel.kind === 'flat'
                ? 'явно принят плоским'
                : 'неизвестен'}
              . Юридические разрешения не проверяются.
            </p>
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
              <p className="mw-caption">
                Реальный DEM не подключён. Выбор плоской поверхности —
                допущение, не загрузка высот из карты.
              </p>
            </details>
          </>
        )}
        {step === 5 && (
          <>
            <h3>Что важнее в результате?</h3>
            <p>
              Рассчитаем оба критерия на одном входе. Одинаковые результаты не
              выдаём за разную выгоду.
            </p>
            <button
              className={`mw-choice ${d.scenario.objective === 'makespan' ? 'active' : ''}`}
              onClick={() => patchScenario({ objective: 'makespan' })}
            >
              <Check size={16} />
              <span>
                <strong>Закончить все работы раньше</strong>
                <small>С учётом подготовки, возвращения и обслуживания.</small>
              </span>
            </button>
            <button
              className={`mw-choice ${d.scenario.objective === 'flightTime' ? 'active' : ''}`}
              onClick={() => patchScenario({ objective: 'flightTime' })}
            >
              <Check size={16} />
              <span>
                <strong>Меньше суммарно летать</strong>
                <small>Считаем время полёта всех аппаратов.</small>
              </span>
            </button>
            <label className="mw-field">
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
              <summary>Параметры покрытия / сенсора</summary>
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
                <p className="mw-caption">
                  Режим профиля: {job.quality.mode}; источник:{' '}
                  {job.quality.source}. При параметрической модели ядро
                  пересчитает полосу из сенсора, высоты и качества.
                </p>
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
              </div>
            </details>
          </>
        )}
        {step === 6 && (
          <>
            <h3>Правильно поняли задачу?</h3>
            <p>
              Сейчас подтверждается ввод для расчёта. Выбор рассчитанного плана
              — отдельное действие.
            </p>
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
                <dt>Батареи</dt>
                <dd>{d.batteries.length}</dd>
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
              <small>
                Комментарий сохраняется, но не задаёт скрытых правил расчёта.
              </small>
            </label>
            <div className="mw-card warning">
              <p className="mw-caption">
                Модельная симуляция. Паспортные максимумы не заменяют измерения;
                карта не является разрешением на полёт. Неизвестные данные будут
                показаны отдельно.
              </p>
            </div>
            <details className="mw-details">
              <summary>Полное задание JSON</summary>
              <pre>{JSON.stringify(d, null, 2)}</pre>
            </details>
            <button
              className="mw-button"
              style={{ marginTop: 12 }}
              onClick={onSave}
            >
              Сохранить в библиотеку
            </button>
          </>
        )}
      </div>
      <div className="mw-wizard-foot">
        <button
          className="mw-button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ArrowLeft size={14} />
          Назад
        </button>
        {step < 6 ? (
          <button
            className="mw-button primary"
            onClick={() => setStep(step + 1)}
          >
            Далее
            <ArrowRight size={14} />
          </button>
        ) : (
          <button className="mw-button primary" onClick={onDone}>
            Подтвердить ввод
          </button>
        )}
      </div>
    </div>
  );
}
