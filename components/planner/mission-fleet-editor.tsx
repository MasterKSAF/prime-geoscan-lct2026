'use client';

import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import type { Vehicle } from '@/lib/planner/schema';
import {
  addMissionBattery,
  addMissionVehicle,
  importMissionFleet,
  MAX_FLEET_FILE_BYTES,
  parseFleetText,
  removeMissionVehicle,
  serializeMissionFleet,
} from '@/lib/planner/mission-fleet';
import type { MissionFleet } from '@/lib/planner/mission-fleet';

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
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  optional?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="mw-field">
      {label}
      <input
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
    </label>
  );
}

export default function MissionFleetEditor({
  document: d,
  onChange,
}: {
  document: MissionDocument;
  onChange: (document: MissionDocument) => void;
}) {
  const [model, setModel] = useState<Vehicle['model']>('Gemini');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
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
      importMissionFleet(d, preview.fleet);
    } catch (e) {
      previewError = errorText(e);
    }
  }
  return (
    <>
      <h3>Чем выполнять миссию?</h3>
      <p>Настройте БВС, совместимые работы и отдельные экземпляры АКБ.</p>
      <div className="mw-field-row">
        <label className="mw-field">
          Добавить профиль
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as Vehicle['model'])}
          >
            <option value="Gemini">Gemini · RGB / MS</option>
            <option value="801">Геоскан 801 · ИК</option>
            <option value="201">Геоскан 201 · самолёт</option>
            <option value="Custom">Свой БВС · Custom</option>
          </select>
        </label>
        <button
          className="mw-button"
          style={{ alignSelf: 'center' }}
          disabled={
            d.scenario.vehicles.length >= 10 || d.batteries.length >= 100
          }
          onClick={() => apply(() => addMissionVehicle(d, model))}
        >
          <Plus size={13} />
          Добавить БВС
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
      <p className="mw-caption" style={{ marginTop: 10 }}>
        БВС {d.scenario.vehicles.length}/10 · АКБ {d.batteries.length}/100. JSON
        до 200 КиБ. Импорт добавляет профили и АКБ целиком; совпадение ID
        отменяет добавление. Назначения работ задаются в этой миссии.
      </p>
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
        <p className="mw-alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <output className="mw-caption">
          {notice}
        </output>
      )}
      {preview && (
        <section className="mw-card" aria-label="Предпросмотр импорта флота">
          <h3>Проверка профилей перед добавлением</h3>
          <p>
            {preview.name} · {preview.fleet.vehicles.length} БВС ·{' '}
            {preview.fleet.batteries.length} АКБ
          </p>
          {preview.fleet.vehicles.map((v) => (
            <p className="mw-caption" key={v.id}>
              {v.name} · ID {v.id} · {v.model} ·{' '}
              {v.kind === 'fixedWing' ? 'самолёт' : 'мультиротор'} ·{' '}
              {v.jobs.join(' / ')}
            </p>
          ))}
          <p className="mw-caption">
            Координаты баз, источники и даты готовности АКБ сохраняются из
            файла. Проверьте их для этой миссии.
          </p>
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
              className="mw-button primary"
              disabled={!!previewError}
              onClick={() => {
                try {
                  const next = importMissionFleet(d, preview.fleet);
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
      <p className="mw-caption" style={{ marginTop: 12 }}>
        Стартовые профили содержат учебные ограничения. Новый аппарат наследует
        первую базу; уточните её координаты. Для самолёта 201 сохраняется
        проверка поддержки самолётных фаз.
      </p>
      {d.scenario.vehicles.map((v) => {
        const batteries = d.batteries.filter((b) => b.vehicleId === v.id);
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
              <strong>{v.name}</strong>
            </label>
            <p className="mw-caption">
              {v.model} · {v.kind === 'fixedWing' ? 'самолёт' : 'мультиротор'} ·{' '}
              {v.jobs.join(' / ')} · {v.effectiveEnduranceMin} мин
            </p>
            <details className="mw-details">
              <summary>Параметры БВС · {v.name}</summary>
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
                <p className="mw-caption">
                  Самолётные фазы не валидированы. Профиль можно сохранить, но
                  ядро отметит его как неподдержанный.
                </p>
              )}
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
              <p className="mw-caption">
                Совместимые виды работ — для установленной комплектации.
                Оставьте хотя бы один.
              </p>
              {Object.entries(workTypes).map(([type, name]) => {
                const work = type as Vehicle['jobs'][number];
                return (
                  <label className="mw-checkbox" key={type}>
                    <input
                      type="checkbox"
                      checked={v.jobs.includes(work)}
                      disabled={v.jobs.length === 1 && v.jobs.includes(work)}
                      onChange={(e) =>
                        patchVehicle(v.id, {
                          jobs: e.target.checked
                            ? [...v.jobs, work]
                            : v.jobs.filter((x) => x !== work),
                        })
                      }
                    />
                    {name}
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
              <label className="mw-field">
                Допущения, по одному на строку
                <textarea
                  value={v.assumptions.join('\n')}
                  onChange={(e) =>
                    patchVehicle(v.id, {
                      assumptions: e.target.value.split('\n'),
                    })
                  }
                />
                <small>От 1 до 10 строк, до 400 символов каждая.</small>
              </label>
            </details>
            <div className="mw-actions" style={{ marginTop: 8 }}>
              <button
                className="mw-button small"
                disabled={d.batteries.length >= 100}
                onClick={() => apply(() => addMissionBattery(d, v.id))}
              >
                <Plus size={12} />
                АКБ
              </button>
              <button
                className="mw-button small danger"
                disabled={cannotRemove}
                onClick={() => setRemoving(v.id)}
                aria-label={`Удалить БВС ${v.name}`}
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
                  Удалить «{v.name}», его АКБ ({batteries.length}) и назначения
                  в работах?
                </p>
                <p className="mw-caption">
                  Если ручная группа опустеет, работа перейдёт в автоматическое
                  назначение.
                </p>
                <div className="mw-actions">
                  <button
                    className="mw-button small danger"
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
            <details className="mw-details">
              <summary>Батареи · {batteries.length}</summary>
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
                  <label className="mw-field">
                    Доступна с
                    <input
                      value={b.readyAt}
                      onChange={(e) =>
                        patchBattery(b.id, { readyAt: e.target.value })
                      }
                    />
                    <small>ISO 8601 со смещением часового пояса.</small>
                  </label>
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
                    className="mw-button small danger"
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
          </div>
        );
      })}
      <details className="mw-details" open>
        <summary>Назначения работ</summary>
        <p className="mw-caption">
          Пустая группа — автоматический выбор доступных совместимых БВС. Можно
          выбрать несколько аппаратов для каждой работы.
        </p>
        {d.jobs.map((job) => (
          <div className="mw-card" key={job.id}>
            <strong>
              {job.name} · {workTypes[job.job.type]}
            </strong>
            <p className="mw-caption">
              {job.assignedVehicleIds.length
                ? `Выбрано БВС: ${job.assignedVehicleIds.length}`
                : 'Автоматически среди доступных совместимых'}
            </p>
            {d.scenario.vehicles.map((v) => {
              const assigned = job.assignedVehicleIds.includes(v.id);
              const compatible = v.jobs.includes(job.job.type);
              return (
                <label className="mw-checkbox" key={v.id}>
                  <input
                    type="checkbox"
                    aria-label={`${job.name}: ${v.name}`}
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
                  {v.name}
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
