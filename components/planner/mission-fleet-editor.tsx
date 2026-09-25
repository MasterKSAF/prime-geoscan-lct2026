'use client';

import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import type { Vehicle } from '@/lib/planner/schema';
import {
  addMissionBattery,
  addMissionVehicle,
  importMissionFleet,
  MAX_FLEET_FILE_BYTES,
  parseFleetText,
  mergeMissionFleet,
  fleetImportDiff,
  removeMissionVehicle,
  serializeMissionFleet,
} from '@/lib/planner/mission-fleet';
import type { MissionFleet } from '@/lib/planner/mission-fleet';
import { missionFleetHints } from '@/lib/planner/mission-guidance';
import { InfoHint } from './mission-help';
import { GEOSCAN_201_MODEL_PROFILE } from '@/lib/planner/fixed-wing-profile';
import {
  MISSION_VEHICLE_CATALOG,
  vehicleCatalogueEntry,
  installedVehicleConfiguration,
  catalogueCameraConfiguration,
} from '@/lib/planner/mission-vehicle-catalog';
import type { CatalogueModel } from '@/lib/planner/mission-vehicle-catalog';
import { vehicleDisplayName } from '@/lib/planner/mission-vehicle-label';
import { VehicleCameraEditor } from './vehicle-camera-editor';

const workTypes: Record<Vehicle['jobs'][number], string> = {
  RGB: 'RGB',
  MS: 'Мультиспектр',
  IR: 'ИК',
  LiDAR: 'LiDAR',
  Geophysics: 'Геофизика',
};
function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Операция не выполнена.';
}
function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  optional = false,
  hint,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  optional?: boolean;
  hint?: ReactNode;
  onChange: (value: number | null) => void;
}) {
  const inputId = useId();
  return (
    <div className="mw-field">
      <div>
        <label htmlFor={inputId}>{label}</label>
        {hint && (
          <>
            {' '}
            <InfoHint label={label}>{hint}</InfoHint>
          </>
        )}
      </div>
      <input
        id={inputId}
        aria-label={label}
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={optional ? 'Неизвестно' : undefined}
        onChange={(e) => {
          if (e.target.value === '') {
            if (optional) onChange(null);
          } else if (Number.isFinite(e.target.valueAsNumber))
            onChange(e.target.valueAsNumber);
        }}
      />
    </div>
  );
}

export default function MissionFleetEditor({
  document: d,
  onChange,
  onCalculate,
  onNotice,
  fleetOnly = false,
}: {
  document: MissionDocument;
  onChange: (document: MissionDocument) => void;
  onCalculate?: () => void;
  onNotice?: (message: string) => void;
  fleetOnly?: boolean;
}) {
  const fieldId = useId();
  const [configurationIds, setConfigurationIds] = useState<
    Partial<Record<CatalogueModel, string>>
  >({});
  const [error, setError] = useState('');
  const [notice, setLocalNotice] = useState('');
  const setNotice = (message: string) => {
    setLocalNotice(message);
    if (message) onNotice?.(message);
  };
  const [removing, setRemoving] = useState<string | null>(null);
  const [allowUpdates, setAllowUpdates] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    fleet: MissionFleet;
  } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const patchVehicle = (id: string, patch: Partial<Vehicle>) =>
    onChange({
      ...d,
      scenario: {
        ...d.scenario,
        vehicles: d.scenario.vehicles.map((v) =>
          v.id === id ? { ...v, ...patch } : v,
        ),
      },
    });
  const patchBattery = (
    id: string,
    patch: Partial<MissionDocument['batteries'][number]>,
  ) =>
    onChange({
      ...d,
      scenario: {
        ...d.scenario,
        vehicles: d.scenario.vehicles.map((v) =>
          d.planning.batteryPolicy &&
          d.batteries.some((b) => b.id === id && b.vehicleId === v.id) &&
          patch.initialPct !== undefined
            ? { ...v, batteryPct: patch.initialPct }
            : v,
        ),
      },
      batteries: d.batteries.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  function apply(update: () => MissionDocument, message = '') {
    try {
      onChange(update());
      setError('');
      setNotice(message);
    } catch (e) {
      setError(errorText(e));
    }
  }
  let previewError = '';
  if (preview) {
    try {
      if (fleetOnly) mergeMissionFleet(d, preview.fleet, allowUpdates);
      else importMissionFleet(d, preview.fleet);
    } catch (e) {
      previewError = errorText(e);
    }
  }
  return (
    <>
      <h3>
        {fleetOnly ? 'Состав общего парка' : 'Парк этой миссии'}{' '}
        <InfoHint label="Парк и батареи">
          У каждого БВС учитывается текущий заряд. Повторные вылеты разрешены,
          если хватает энергии на работу, возвращение и резерв. Замена —
          отдельное сообщение состояния, её время не прогнозируется.
        </InfoHint>
      </h3>
      <section className="mw-card" aria-label="Каталог моделей из ТЗ">
        <h4>
          Все модели из ТЗ{' '}
          <InfoHint label="Каталог моделей и парк миссии">
            Каталог содержит три поддержанные модели. В парк миссии входят
            только добавленные вами аппараты. Добавление создаёт расчётный
            профиль, не подключает реальный БВС. Проверьте комплектацию, текущий
            заряд и базы: новый аппарат получает точки старта и посадки первого
            БВС миссии. Расчёт проверяет совместимость и безопасность.
          </InfoHint>
        </h4>
        <div
          className="mw-model-catalog"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 8,
          }}
        >
          {MISSION_VEHICLE_CATALOG.map((entry) => {
            const configuration =
              entry.configurations.find(
                (item) => item.id === configurationIds[entry.model],
              ) ?? entry.configurations[0];
            const count = d.scenario.vehicles.filter(
              (vehicle) => vehicle.model === entry.model,
            ).length;
            return (
              <section
                className="mw-card"
                key={entry.model}
                aria-label={`Модель ${entry.name}`}
              >
                <strong>{entry.name}</strong>
                <p className="mw-caption">
                  {entry.kindLabel} · в миссии: {count}
                </p>
                <label className="mw-field">
                  Комплектация
                  <select
                    aria-label={`Комплектация ${entry.name}`}
                    value={configuration.id}
                    onChange={(event) =>
                      setConfigurationIds((previous) => ({
                        ...previous,
                        [entry.model]: event.target.value,
                      }))
                    }
                  >
                    {entry.configurations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="mw-button small mw-action-add"
                  disabled={d.scenario.vehicles.length >= 20}
                  aria-label={`Добавить ${entry.name}`}
                  onClick={() =>
                    apply(
                      () => addMissionVehicle(d, entry.model, configuration.id),
                      `${entry.name} добавлен в миссия. Проверьте текущий заряд и базы.`,
                    )
                  }
                >
                  <Plus size={13} /> Добавить
                </button>
                <details className="mw-details">
                  <summary>
                    Паспорт и модель{' '}
                    <InfoHint label={`Паспорт и модель ${entry.name}`}>
                      {entry.description} {configuration.detail} Максимумы
                      зависят от условий и не являются бюджетом этой миссии.
                      Параметры батареи и манёвров нового профиля — явные
                      допущения для симуляции, не измерения и не разрешение на
                      полёт.
                    </InfoHint>
                  </summary>
                  <p className="mw-caption">
                    Паспорт: до {entry.passport.maxFlightMin} мин, до{' '}
                    {Math.round(entry.passport.maxSpeedMps * 3.6)} км/ч, ветер
                    до {entry.passport.maxWindMps} м/с.
                  </p>
                  <a href={entry.source} target="_blank" rel="noreferrer">
                    Документ Геоскана из ТЗ
                  </a>
                </details>
              </section>
            );
          })}
        </div>
      </section>
      <section
        className="mw-auto-fleet"
        hidden={fleetOnly}
        aria-label="Автоматический выбор флота"
      >
        <strong>Автовыбор БВС</strong>
        <InfoHint label="Как работает автовыбор БВС?">
          При автоматическом назначении система перебирает совместимые аппараты
          и группы из вашего парка. Проверяет маршрут, ветер, батареи, временное
          окно и разделение. Предварительная совместимость ниже ещё не означает,
          что вся миссия выполнима.
        </InfoHint>
        <div className="mw-actions">
          <button
            type="button"
            className="mw-button small"
            aria-pressed={d.jobs.every(
              (j) => j.assignedVehicleIds.length === 0,
            )}
            onClick={() =>
              onChange({
                ...d,
                jobs: d.jobs.map((j) => ({ ...j, assignedVehicleIds: [] })),
              })
            }
          >
            Автовыбор всей группы
          </button>
          {onCalculate && (
            <button
              type="button"
              className="mw-button primary small"
              onClick={onCalculate}
            >
              Проверить состав и рассчитать
            </button>
          )}
        </div>
        <details className="mw-details">
          <summary>Предварительная совместимость по работам</summary>
          {d.jobs.map((job) => (
            <section key={job.id}>
              <h4>{job.name}</h4>
              {missionFleetHints(d, job.id).map((v) => (
                <div className="mw-eligibility" key={v.vehicleId}>
                  <strong>
                    {(() => {
                      const vehicle = d.scenario.vehicles.find(
                        (item) => item.id === v.vehicleId,
                      );
                      return vehicle ? vehicleDisplayName(vehicle) : v.name;
                    })()}
                  </strong>
                  <small>
                    {v.eligible
                      ? 'Предварительно совместим'
                      : v.reasons.join(' · ')}
                  </small>
                  {v.readyAt && (
                    <small>
                      Доступен с:{' '}
                      {new Date(v.readyAt).toLocaleString('ru-RU', {
                        timeZone: d.window.timezone,
                      })}
                    </small>
                  )}
                </div>
              ))}
            </section>
          ))}
        </details>
      </section>
      <div className="mw-actions">
        <button
          className="mw-button small mw-action-add"
          disabled={d.scenario.vehicles.length >= 20}
          onClick={() => apply(() => addMissionVehicle(d, 'Custom'))}
        >
          <Plus size={13} />
          Свой профиль БВС
        </button>
      </div>
      <div className="mw-actions">
        <button
          className="mw-button small"
          onClick={() => file.current?.click()}
        >
          <Upload size={13} />
          Импорт флота
        </button>
        <button
          className="mw-button small"
          onClick={() => {
            try {
              const text = serializeMissionFleet(d);
              const url = URL.createObjectURL(
                new Blob([text], { type: 'application/json;charset=utf-8' }),
              );
              const anchor = window.document.createElement('a');
              anchor.href = url;
              anchor.download = 'prime-fleet.json';
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setError('');
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          <Download size={13} />
          Экспорт флота
        </button>
      </div>
      <div className="mw-fleet-counts">
        <span>
          Аппаратов: <b>{d.scenario.vehicles.length}</b>
        </span>
        <InfoHint label="Состав парка">
          Лимит редактора: 20 аппаратов. Импорт JSON до 200 КиБ; повторяющиеся
          ID отклоняются. Загруженные значения не подменяются учебными.
        </InfoHint>
        <button
          className="mw-button small"
          onClick={() =>
            onChange({
              ...d,
              batteries: d.batteries.map((b) => ({
                ...b,
                readyAt: d.window.start,
              })),
            })
          }
        >
          Все батареи доступны к старту
        </button>
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Файл профилей БВС"
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          const sequence = ++loadSequence.current;
          setPreview(null);
          setError('');
          setNotice('');
          if (!selected) return;
          try {
            if (selected.size > MAX_FLEET_FILE_BYTES)
              throw new Error('Файл профилей превышает 200 КиБ.');
            const fleet = parseFleetText(await selected.text());
            if (sequence === loadSequence.current)
              setPreview({ name: selected.name, fleet });
          } catch (e) {
            if (sequence === loadSequence.current) setError(errorText(e));
          }
        }}
      />
      {error && (
        <p className="mw-caption" role="alert">
          {error}
        </p>
      )}
      {notice && !onNotice && <output className="mw-caption">{notice}</output>}
      {preview && (
        <section className="mw-card" aria-label="Предпросмотр импорта флота">
          <h3>
            Проверка профилей перед добавлением{' '}
            <InfoHint label="Проверка импорта парка">
              Координаты баз, источники и даты готовности АКБ сохраняются из
              файла. Проверьте их для этой миссии.
            </InfoHint>
          </h3>
          <p>
            {preview.name} · {preview.fleet.vehicles.length} БВС
          </p>
          {fleetOnly && (
            <>
              <ul>
                {fleetImportDiff(d, preview.fleet).map((x) => (
                  <li key={x.id}>
                    {x.name} · {x.id} ·{' '}
                    {x.kind === 'add'
                      ? 'Добавится'
                      : x.kind === 'same'
                        ? 'Без изменений'
                        : 'Конфликт ID — изменится'}
                  </li>
                ))}
              </ul>
              <label className="mw-checkbox">
                <input
                  type="checkbox"
                  checked={allowUpdates}
                  onChange={(e) => setAllowUpdates(e.target.checked)}
                />
                Подтверждаю обновление совпадающих ID
              </label>
            </>
          )}
          {preview.fleet.vehicles.map((v) => (
            <p className="mw-caption" key={v.id}>
              {vehicleDisplayName(v)} · ID {v.id} ·{' '}
              {v.kind === 'fixedWing' ? 'самолёт' : 'мультиротор'} ·{' '}
              {v.jobs.join(' / ')}
            </p>
          ))}
          <details className="mw-details">
            <summary>Все параметры импорта</summary>
            <pre>{JSON.stringify(preview.fleet, null, 2)}</pre>
          </details>
          {previewError && (
            <p className="mw-alert error" role="alert">
              {previewError}
            </p>
          )}
          <div className="mw-actions">
            <button
              className="mw-button primary mw-action-add"
              disabled={!!previewError}
              onClick={() => {
                try {
                  const next = fleetOnly
                    ? mergeMissionFleet(d, preview.fleet, allowUpdates)
                    : importMissionFleet(d, preview.fleet);
                  onChange(next);
                  setPreview(null);
                  setError('');
                  setNotice('Профили БВС и АКБ добавлены.');
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Подтвердить добавление флота
            </button>
            <button
              className="mw-button"
              onClick={() => {
                loadSequence.current++;
                setPreview(null);
              }}
            >
              Отмена импорта
            </button>
          </div>
        </section>
      )}
      {d.scenario.vehicles.map((v) => {
        const batteries = d.batteries.filter((b) => b.vehicleId === v.id);
        const catalogue = vehicleCatalogueEntry(v.model);
        const supportedWorks = catalogue?.configurations.flatMap(
          (item) => item.jobs,
        );
        const cannotRemove =
          d.scenario.vehicles.length <= 1 ||
          d.batteries.length === batteries.length;
        return (
          <div className="mw-card" key={v.id}>
            <label className="mw-checkbox">
              <input
                type="checkbox"
                checked={v.enabled}
                onChange={(e) =>
                  patchVehicle(v.id, { enabled: e.target.checked })
                }
              />
              <strong>{vehicleDisplayName(v)}</strong>
            </label>
            <p className="mw-caption">
              {v.model} · {v.kind === 'fixedWing' ? 'самолёт' : 'мультиротор'} ·{' '}
              {v.jobs.join(' / ')} · {v.effectiveEnduranceMin} мин
            </p>
            <details className="mw-details">
              <summary>Параметры БВС · {vehicleDisplayName(v)}</summary>
              <label className="mw-field">
                Название БВС
                <input
                  value={v.name}
                  maxLength={60}
                  onChange={(e) => patchVehicle(v.id, { name: e.target.value })}
                />
              </label>
              <label className="mw-field">
                Тип аппарата
                <select
                  value={v.kind}
                  disabled={v.model !== 'Custom'}
                  onChange={(e) =>
                    patchVehicle(v.id, {
                      kind: e.target.value as Vehicle['kind'],
                    })
                  }
                >
                  <option value="multirotor">Мультиротор</option>
                  <option value="fixedWing">Самолёт</option>
                </select>
              </label>
              {v.kind === 'fixedWing' && (
                <details className="mw-details">
                  <summary>
                    Самолётная модель{' '}
                    {v.fixedWingProfile ? '· подключена' : '· не настроена'}{' '}
                    <InfoHint
                      label={`Самолётная модель ${vehicleDisplayName(v)}`}
                    >
                      Геоскан 201: движущиеся развороты, запуск и парашютная
                      посадка. Параметры манёвров — явно заданная расчётная
                      модель, не калибровка настоящего автопилота.
                      {v.fixedWingProfile && (
                        <> Источник: {v.fixedWingProfile.source}</>
                      )}
                    </InfoHint>
                  </summary>
                  {v.model === '201' && !v.fixedWingProfile && (
                    <button
                      className="mw-button"
                      onClick={() =>
                        patchVehicle(v.id, {
                          fixedWingProfile: structuredClone(
                            GEOSCAN_201_MODEL_PROFILE,
                          ),
                          maxAirspeedMps: 110 / 3.6,
                        })
                      }
                    >
                      Применить расчётный профиль 201
                    </button>
                  )}
                  {v.fixedWingProfile && (
                    <>
                      <NumberInput
                        label="Направление запуска, °"
                        value={v.fixedWingProfile.launchHeadingDeg}
                        min={0}
                        max={359}
                        onChange={(n) =>
                          n !== null &&
                          patchVehicle(v.id, {
                            fixedWingProfile: {
                              ...v.fixedWingProfile!,
                              launchHeadingDeg: n,
                            },
                          })
                        }
                      />
                      <NumberInput
                        label="Минимальный радиус разворота, м"
                        value={v.fixedWingProfile.minimumTurnRadiusM}
                        min={30}
                        max={2000}
                        onChange={(n) =>
                          n !== null &&
                          patchVehicle(v.id, {
                            fixedWingProfile: {
                              ...v.fixedWingProfile!,
                              minimumTurnRadiusM: n,
                            },
                          })
                        }
                      />
                      <NumberInput
                        label="Предельный крен, °"
                        value={v.fixedWingProfile.bankLimitDeg}
                        min={5}
                        max={35}
                        onChange={(n) =>
                          n !== null &&
                          patchVehicle(v.id, {
                            fixedWingProfile: {
                              ...v.fixedWingProfile!,
                              bankLimitDeg: n,
                            },
                          })
                        }
                      />
                    </>
                  )}
                </details>
              )}
              <NumberInput
                label="Предел воздушной скорости, м/с"
                value={v.maxAirspeedMps ?? null}
                min={2}
                max={40}
                step={0.1}
                optional
                onChange={(n) =>
                  patchVehicle(v.id, { maxAirspeedMps: n ?? undefined })
                }
              />
              {(
                [
                  ['Воздушная скорость, м/с', 'airspeedMps', 2, 40, 0.1],
                  ['Допустимый ветер, м/с', 'maxWindMps', 0, 25, 0.1],
                  [
                    'Ресурс полёта при 100% АКБ, мин',
                    'effectiveEnduranceMin',
                    1,
                    240,
                    0.5,
                  ],
                  ['Подъём, м/с', 'climbMps', 0.5, 10, 0.1],
                  ['Снижение, м/с', 'descentMps', 0.3, 10, 0.1],
                  ['Манёвр, с', 'turnSeconds', 0, 30, 0.1],
                ] as const
              ).map(([label, key, min, max, step]) => (
                <NumberInput
                  key={key}
                  label={label}
                  value={v[key]}
                  min={min}
                  max={max}
                  step={step}
                  onChange={(n) => {
                    if (n !== null) patchVehicle(v.id, { [key]: n });
                  }}
                />
              ))}
              <h4>
                Работы установленной комплектации{' '}
                <InfoHint label="Совместимость полезной нагрузки">
                  Отметьте только работы установленного оборудования. Для
                  моделей Геоскана доступны подтверждённые виды нагрузок из
                  каталога. Иную комплектацию задают отдельным профилем своего
                  БВС с источником параметров. Выбор в редакторе не означает
                  физическую установку камеры. Оставьте хотя бы одну работу.
                </InfoHint>
              </h4>
              {catalogue && v.model !== 'Custom' && (
                <label className="mw-field">
                  Установленная камера
                  <select
                    aria-label={`Камера БВС: ${v.id}`}
                    value={installedVehicleConfiguration(v)}
                    onChange={(e) =>
                      v.model !== 'Custom' &&
                      patchVehicle(
                        v.id,
                        catalogueCameraConfiguration(v.model, e.target.value),
                      )
                    }
                  >
                    <option value="" disabled>
                      Выберите комплектацию
                    </option>
                    {catalogue.configurations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <VehicleCameraEditor
                vehicle={v}
                onSave={(patch) => patchVehicle(v.id, patch)}
              />
              {Object.entries(workTypes).map(([type, name]) => {
                const work = type as Vehicle['jobs'][number];
                return (
                  <label className="mw-checkbox" key={type}>
                    <input
                      type="checkbox"
                      checked={v.jobs.includes(work)}
                      disabled={
                        v.model !== 'Custom' ||
                        (v.jobs.length === 1 && v.jobs.includes(work)) ||
                        (!v.jobs.includes(work) &&
                          !!supportedWorks &&
                          !supportedWorks.includes(work))
                      }
                      onChange={(e) =>
                        patchVehicle(v.id, {
                          jobs: e.target.checked
                            ? catalogue &&
                              !catalogue.configurations.some((c) =>
                                [...v.jobs, work].every((w) =>
                                  c.jobs.includes(w),
                                ),
                              )
                              ? [
                                  ...catalogue.configurations.find((c) =>
                                    c.jobs.includes(work),
                                  )!.jobs,
                                ]
                              : [...v.jobs, work]
                            : v.jobs.filter((x) => x !== work),
                        })
                      }
                    />
                    {name}
                    {!!supportedWorks &&
                      !supportedWorks.includes(work) &&
                      v.jobs.includes(work) &&
                      ' · из файла, вне каталога'}
                  </label>
                );
              })}
              {(['start', 'landing'] as const).map((key) => (
                <div key={key}>
                  <p className="mw-caption">
                    {key === 'start' ? 'Старт' : 'Посадка'} · WGS84
                  </p>
                  <div className="mw-field-row">
                    <NumberInput
                      label={`${key === 'start' ? 'Старт' : 'Посадка'}: долгота`}
                      value={v[key][0]}
                      min={-180}
                      max={180}
                      step={0.000001}
                      onChange={(n) => {
                        if (n !== null)
                          patchVehicle(v.id, { [key]: [n, v[key][1]] });
                      }}
                    />
                    <NumberInput
                      label={`${key === 'start' ? 'Старт' : 'Посадка'}: широта`}
                      value={v[key][1]}
                      min={-70}
                      max={70}
                      step={0.000001}
                      onChange={(n) => {
                        if (n !== null)
                          patchVehicle(v.id, { [key]: [v[key][0], n] });
                      }}
                    />
                  </div>
                </div>
              ))}
              <label className="mw-field">
                Источник параметров БВС
                <textarea
                  value={v.source}
                  maxLength={400}
                  onChange={(e) =>
                    patchVehicle(v.id, { source: e.target.value })
                  }
                />
              </label>
              <div className="mw-field">
                <div>
                  <label htmlFor={`${fieldId}-${v.id}-assumptions`}>
                    Допущения
                  </label>{' '}
                  <InfoHint label="Формат допущений">
                    По одному на строку: от 1 до 10 строк, до 400 символов
                    каждая.
                  </InfoHint>
                </div>
                <textarea
                  id={`${fieldId}-${v.id}-assumptions`}
                  aria-label="Допущения, по одному на строку"
                  value={v.assumptions.join('\n')}
                  onChange={(e) =>
                    patchVehicle(v.id, {
                      assumptions: e.target.value.split('\n'),
                    })
                  }
                />
              </div>
            </details>
            <div className="mw-actions" style={{ marginTop: 8 }}>
              {!d.planning.batteryPolicy && (
                <button
                  className="mw-button small mw-action-add"
                  disabled={d.batteries.length >= 100}
                  onClick={() => apply(() => addMissionBattery(d, v.id))}
                >
                  <Plus size={12} />
                  АКБ
                </button>
              )}
              <button
                className="mw-button small danger mw-action-remove"
                disabled={cannotRemove}
                onClick={() => setRemoving(v.id)}
                aria-label={`Удалить БВС ${vehicleDisplayName(v)}`}
              >
                <Trash2 size={12} />
                Удалить БВС
              </button>
            </div>
            {cannotRemove && (
              <p className="mw-caption">
                Для удаления в миссии должны остаться хотя бы один БВС и одна
                АКБ другого БВС.
              </p>
            )}
            {removing === v.id && (
              <div className="mw-card warning">
                <p>
                  Удалить «{vehicleDisplayName(v)}», текущую батарею и
                  назначения в работах?
                </p>
                <p className="mw-caption">
                  Если ручная группа опустеет, работа перейдёт в автоматическое
                  назначение.
                </p>
                <div className="mw-actions">
                  <button
                    className="mw-button small danger mw-action-remove"
                    disabled={cannotRemove}
                    onClick={() => {
                      apply(() => removeMissionVehicle(d, v.id));
                      setRemoving(null);
                    }}
                  >
                    Подтвердить удаление БВС
                  </button>
                  <button
                    className="mw-button small"
                    onClick={() => setRemoving(null)}
                  >
                    Отмена удаления
                  </button>
                </div>
              </div>
            )}
            {d.planning.batteryPolicy && (
              <div className="mw-card">
                <NumberInput
                  label="Текущий заряд, %"
                  hint={
                    <>
                      Паспортный максимум Gemini и 801 — до 40 минут, 201 — до
                      180 минут, в определённых условиях. Здесь используется
                      отдельный консервативный бюджет профиля:{' '}
                      {v.effectiveEnduranceMin} минут при полном заряде. Он не
                      заменяет калибровку по полётным логам. Для
                      зарегистрированного БВС актуальное состояние берётся из
                      кнопки «Парк».
                    </>
                  }
                  value={batteries[0]?.initialPct ?? 0}
                  min={0}
                  max={100}
                  onChange={(n) => {
                    if (n !== null && batteries[0])
                      patchBattery(batteries[0].id, { initialPct: n });
                  }}
                />
              </div>
            )}
            {!d.planning.batteryPolicy && (
              <details className="mw-details">
                <summary>Батареи · {batteries.length}</summary>
                <div className="mw-battery-policy">
                  {batteries.length > 1
                    ? 'Запас батарей · возможна замена'
                    : 'Одна батарея · повторные вылеты'}{' '}
                  <InfoHint label="Замена и зарядка">
                    Замена допускается экспертами; её выполняет наземная
                    команда. Без времени зарядки повторно используется только
                    оставшийся заряд. С заданным временем зарядки батарея
                    доступна после полного цикла. Для Gemini: около 105 минут до
                    100% при +25 °C; 75 минут — только до 95%. Произвольная
                    короткая дозарядка пока не рассчитывается: нет кривой
                    зарядки. Для 801 подтверждённого времени зарядки батареи в
                    материалах нет.
                  </InfoHint>
                </div>
                {batteries.map((b) => (
                  <div key={b.id} style={{ paddingTop: 10 }}>
                    <label className="mw-field">
                      Название АКБ
                      <input
                        value={b.name}
                        maxLength={100}
                        onChange={(e) =>
                          patchBattery(b.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <NumberInput
                      label="Начальный заряд, %"
                      value={b.initialPct}
                      min={0}
                      max={100}
                      onChange={(n) => {
                        if (n !== null) patchBattery(b.id, { initialPct: n });
                      }}
                    />
                    <div className="mw-field">
                      <div>
                        <label htmlFor={`${fieldId}-${b.id}-ready-at`}>
                          Доступна с
                        </label>{' '}
                        <InfoHint label="Время доступности батареи">
                          ISO 8601 со смещением часового пояса.
                        </InfoHint>
                      </div>
                      <input
                        id={`${fieldId}-${b.id}-ready-at`}
                        aria-label="Доступна с"
                        value={b.readyAt}
                        onChange={(e) =>
                          patchBattery(b.id, { readyAt: e.target.value })
                        }
                      />
                    </div>
                    <NumberInput
                      label="Полная зарядка, мин"
                      value={b.rechargeSec === null ? null : b.rechargeSec / 60}
                      min={1}
                      max={1440}
                      step={0.5}
                      optional
                      onChange={(n) =>
                        patchBattery(b.id, {
                          rechargeSec: n === null ? null : n * 60,
                        })
                      }
                    />
                    <NumberInput
                      label="Циклы АКБ"
                      value={b.cycles}
                      min={0}
                      max={100000}
                      optional
                      onChange={(n) => patchBattery(b.id, { cycles: n })}
                    />
                    <label className="mw-field">
                      Дата ввода АКБ
                      <input
                        type="date"
                        value={b.commissionedAt ?? ''}
                        onChange={(e) =>
                          patchBattery(b.id, {
                            commissionedAt: e.target.value || null,
                          })
                        }
                      />
                    </label>
                    <label className="mw-field">
                      Источник данных АКБ
                      <textarea
                        value={b.source}
                        maxLength={500}
                        onChange={(e) =>
                          patchBattery(b.id, { source: e.target.value })
                        }
                      />
                    </label>
                    <button
                      className="mw-button small danger mw-action-remove"
                      disabled={d.batteries.length <= 1}
                      onClick={() =>
                        onChange({
                          ...d,
                          batteries: d.batteries.filter((x) => x.id !== b.id),
                        })
                      }
                    >
                      Удалить АКБ
                    </button>
                  </div>
                ))}
              </details>
            )}
          </div>
        );
      })}
      <details className="mw-details" open hidden={fleetOnly}>
        <summary>
          Назначения работ{' '}
          <InfoHint label="Назначение аппаратов на работы">
            Пустая группа — автоматический выбор доступных совместимых БВС.
            Можно выбрать несколько аппаратов для каждой работы.
          </InfoHint>
        </summary>
        {d.jobs.map((job) => (
          <div className="mw-card" key={job.id}>
            <strong>
              {job.name} · {workTypes[job.job.type]}
            </strong>
            <p className="mw-caption">
              {job.assignedVehicleIds.length
                ? `Выбрано БВС: ${job.assignedVehicleIds.length}`
                : 'Автовыбор'}
            </p>
            {d.scenario.vehicles.map((v) => {
              const assigned = job.assignedVehicleIds.includes(v.id);
              const compatible = v.jobs.includes(job.job.type);
              return (
                <label className="mw-checkbox" key={v.id}>
                  <input
                    type="checkbox"
                    aria-label={`${job.name}: ${vehicleDisplayName(v)}`}
                    checked={assigned}
                    disabled={!assigned && (!v.enabled || !compatible)}
                    onChange={(e) =>
                      onChange({
                        ...d,
                        jobs: d.jobs.map((j) =>
                          j.id !== job.id
                            ? j
                            : {
                                ...j,
                                assignedVehicleIds: e.target.checked
                                  ? [...j.assignedVehicleIds, v.id]
                                  : j.assignedVehicleIds.filter(
                                      (id) => id !== v.id,
                                    ),
                              },
                        ),
                      })
                    }
                  />
                  {vehicleDisplayName(v)}
                  {!v.enabled ? ' · выключен' : ''}
                  {!compatible ? ' · несовместимая работа' : ''}
                </label>
              );
            })}
            {job.assignedVehicleIds.length > 0 && (
              <button
                className="mw-button small"
                onClick={() =>
                  onChange({
                    ...d,
                    jobs: d.jobs.map((j) =>
                      j.id === job.id ? { ...j, assignedVehicleIds: [] } : j,
                    ),
                  })
                }
              >
                Назначать автоматически
              </button>
            )}
          </div>
        ))}
      </details>
    </>
  );
}
