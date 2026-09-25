'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Drone,
  Plane,
  FileText,
  CheckCircle2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  MISSION_VEHICLE_CATALOG,
  installedVehicleConfiguration,
  type CatalogueModel,
} from '@/lib/planner/mission-vehicle-catalog';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import { workLabels } from '@/lib/planner/mission-editing';
import type { FleetState } from '@/lib/planner/mission-fleet-state';
import type { Vehicle } from '@/lib/planner/schema';
import { maintenancePolicy } from '@/lib/planner/mission-maintenance';
import { InfoHint } from './mission-help';
import { VehicleCameraEditor, type CameraPatch } from './vehicle-camera-editor';
export default function DemoFleet({
  documents,
  onAvailability,
  busy,
  states = [],
  lockedIds = [],
  onMaintenance,
  onCameras,
}: {
  documents: MissionDocument[];
  onAvailability: (
    id: string,
    enabled: boolean,
    configuration?: string,
  ) => void;
  busy: boolean;
  states?: readonly FleetState[];
  lockedIds?: string[];
  onMaintenance?: (
    id: string,
    maintenance: NonNullable<Vehicle['maintenance']>,
  ) => void;
  onCameras?: (id: string, patch: CameraPatch) => void;
}) {
  const [panel, setPanel] = useState<{
    model: CatalogueModel;
    kind: 'passport' | 'availability' | 'capabilities';
  } | null>(null);
  const [pdfs, setPdfs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const urls = useRef<string[]>([]),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  useEffect(
    () => () => urls.current.forEach((u) => URL.revokeObjectURL(u)),
    [],
  );
  const model = MISSION_VEHICLE_CATALOG.find((m) => m.model === panel?.model);
  const fleet = [
    ...new Map(
      documents.flatMap((d) => d.scenario.vehicles).map((v) => [v.id, v]),
    ).values(),
  ].map((v) => states.find((s) => s.id === v.id)?.vehicle ?? v);
  return (
    <section className="demo-fleet" aria-label="Парк БВС">
      <h1>
        Парк БВС <small>· {fleet.length} аппаратов</small>
      </h1>
      <div className="demo-table-scroll">
        <table className="demo-fleet-table">
          <thead>
            <tr>
              <th>БВС</th>
              <th>Доступность</th>
              <th>Паспортные пределы</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {MISSION_VEHICLE_CATALOG.map((m) => {
              const own = fleet.filter((v) => v.model === m.model);
              const enabled = own.some((v) => v.enabled);
              return (
                <tr className="demo-fleet-row" key={m.model}>
                  <td aria-label={m.name}>
                    <div className="demo-fleet-identity">
                      <div className="demo-fleet-icon">
                        {m.model === '201' ? (
                          <Plane size={30} />
                        ) : (
                          <Drone size={30} />
                        )}
                      </div>
                      <div>
                        <h2>{m.name}</h2>
                        <small>
                          {m.kindLabel} · {own.length} шт.
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`demo-availability-badge ${enabled ? 'available' : ''}`}
                    >
                      {enabled
                        ? 'Доступен для назначения'
                        : 'Не назначен · можно включить'}
                    </span>
                  </td>
                  <td>
                    <span>
                      До {m.passport.maxFlightMin} мин · ветер до{' '}
                      {m.passport.maxWindMps} м/с
                    </span>
                    <small className="fleet-payload-summary">
                      {[...new Set(own.flatMap((v) => v.jobs))]
                        .map((j) => workLabels[j])
                        .join(' · ')}
                    </small>
                  </td>
                  <td aria-label={`Действия: ${m.name}`}>
                    <div className="mw-actions">
                      <button
                        className="mw-button"
                        onClick={() =>
                          setPanel({ model: m.model, kind: 'passport' })
                        }
                      >
                        <FileText size={16} />
                        Паспорт
                      </button>
                      <button
                        className="mw-button"
                        onClick={() =>
                          setPanel({ model: m.model, kind: 'availability' })
                        }
                      >
                        <CheckCircle2 size={16} />
                        Доступность
                      </button>
                      <button
                        className="mw-button"
                        onClick={() =>
                          setPanel({ model: m.model, kind: 'capabilities' })
                        }
                      >
                        <SlidersHorizontal size={16} />
                        Возможности
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dialog
        ref={dialog}
        className="demo-fleet-dialog"
        onCancel={() => setPanel(null)}
      >
        {model && panel && (
          <>
            <header>
              <h2>
                {model.name} ·{' '}
                {
                  {
                    passport: 'Паспорт',
                    availability: 'Доступность',
                    capabilities: 'Возможности',
                  }[panel.kind]
                }
              </h2>
              <button
                className="mw-button"
                aria-label="Закрыть парк"
                onClick={() => setPanel(null)}
              >
                <X size={18} />
              </button>
            </header>
            {panel.kind === 'passport' ? (
              <>
                <label className="mw-button">
                  Загрузить PDF
                  <input
                    aria-label="Паспорт PDF"
                    type="file"
                    style={{ display: 'none' }}
                    accept="application/pdf,.pdf"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setError('');
                      if (
                        f.size > 25 * 1024 * 1024 ||
                        !new TextDecoder()
                          .decode(await f.slice(0, 5).arrayBuffer())
                          .startsWith('%PDF-')
                      ) {
                        setError('Нужен PDF до 25 МБ.');
                        return;
                      }
                      const url = URL.createObjectURL(
                        new Blob([f], { type: 'application/pdf' }),
                      );
                      const old = pdfs[model.model];
                      if (old) {
                        URL.revokeObjectURL(old);
                        urls.current = urls.current.filter((u) => u !== old);
                      }
                      urls.current.push(url);
                      setPdfs((p) => ({ ...p, [model.model]: url }));
                    }}
                  />
                </label>
                <a
                  className="mw-button"
                  href={model.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  Официальный PDF
                </a>
                {pdfs[model.model] && (
                  <a
                    className="mw-button"
                    href={pdfs[model.model]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть загруженный PDF
                  </a>
                )}
                {pdfs[model.model] && (
                  <iframe
                    title={`Паспорт ${model.name}`}
                    src={pdfs[model.model]}
                  />
                )}
                {error && <p role="alert">{error}</p>}
              </>
            ) : panel.kind === 'availability' ? (
              <>
                <p>
                  Общий парк для всех миссий. Выберите доступность и
                  установленную камеру. Занятые аппараты менять нельзя.
                </p>
                {fleet
                  .filter((v) => v.model === model.model)
                  .map((v) => (
                    <div className="demo-fleet-device" key={v.id}>
                      <div>
                        <strong>{v.name}</strong>
                        <small>
                          {v.id} · {v.start[0] < 35 ? 'Север' : 'Коломна'} ·
                          заряд {v.batteryPct.toFixed(0)}%
                          {lockedIds.includes(v.id) ? ' · занят миссией' : ''}
                        </small>
                      </div>
                      <select
                        aria-label={`Комплектация: ${v.id}`}
                        disabled={busy || lockedIds.includes(v.id)}
                        value={installedVehicleConfiguration(v)}
                        onChange={(e) =>
                          onAvailability(v.id, v.enabled, e.target.value)
                        }
                      >
                        <option value="" disabled>
                          Выберите установленную камеру
                        </option>
                        {model.configurations.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Доступен: ${v.id}`}
                          disabled={busy || lockedIds.includes(v.id)}
                          title={
                            lockedIds.includes(v.id)
                              ? 'Дождитесь завершения миссии'
                              : undefined
                          }
                          checked={v.enabled}
                          onChange={(e) =>
                            onAvailability(v.id, e.target.checked)
                          }
                        />
                        Доступен
                      </label>
                      {onCameras && (
                        <VehicleCameraEditor
                          vehicle={v}
                          disabled={busy || lockedIds.includes(v.id)}
                          onSave={(patch) => onCameras(v.id, patch)}
                        />
                      )}
                      {onMaintenance && (
                        <MaintenanceEditor
                          key={`${v.id}:${JSON.stringify(v.maintenance)}`}
                          vehicle={v}
                          disabled={busy || lockedIds.includes(v.id)}
                          onSave={onMaintenance}
                        />
                      )}
                    </div>
                  ))}
              </>
            ) : (
              <>
                <p>{model.description}</p>
                <p>
                  Паспортные пределы: скорость до{' '}
                  {(model.passport.maxSpeedMps * 3.6).toFixed(0)} км/ч, ветер до{' '}
                  {model.passport.maxWindMps} м/с, длительность до{' '}
                  {model.passport.maxFlightMin} мин.
                </p>
                {model.configurations.map((c) => (
                  <p key={c.id}>
                    <strong>{c.name}</strong> —{' '}
                    {c.jobs.map((j) => workLabels[j]).join(', ')}.{' '}
                    <InfoHint label={`Комплектация ${model.model}: ${c.id}`}>
                      {c.detail}
                    </InfoHint>
                  </p>
                ))}
                <h3>Батареи модельных аппаратов</h3>
                <ul>
                  {fleet
                    .filter((v) => v.model === model.model)
                    .map((v) => (
                      <li key={v.id}>
                        {v.name} ·{' '}
                        {(
                          states.find((s) => s.id === v.id)?.battery
                            .initialPct ?? v.batteryPct
                        ).toFixed(0)}
                        %
                      </li>
                    ))}
                </ul>
                <small>
                  Расчёт использует установленный заряд, резерв и рабочий
                  профиль — не паспортный максимум как гарантированное время.
                </small>
              </>
            )}
          </>
        )}
      </dialog>
    </section>
  );
}

function MaintenanceEditor({
  vehicle,
  disabled,
  onSave,
}: {
  vehicle: Vehicle;
  disabled: boolean;
  onSave: NonNullable<Parameters<typeof DemoFleet>[0]['onMaintenance']>;
}) {
  const [flights, setFlights] = useState(
    String(vehicle.maintenance?.flightsSinceService ?? 0),
  );
  const [hours, setHours] = useState(
    String(
      Number(
        ((vehicle.maintenance?.flightSecondsSinceService ?? 0) / 3600).toFixed(
          4,
        ),
      ),
    ),
  );
  const policy = maintenancePolicy(vehicle.model);
  const valid =
    flights !== '' &&
    hours !== '' &&
    Number.isInteger(Number(flights)) &&
    Number(flights) >= 0 &&
    Number(flights) <= 1000000 &&
    Number.isFinite(Number(hours)) &&
    Number(hours) >= 0 &&
    Number(hours) <= 277777;
  return (
    <details className="fleet-maintenance">
      <summary>
        Наработка и ТО ·{' '}
        {policy
          ? `${policy.limit} ${policy.unit === 'flights' ? 'полётов' : 'ч'}`
          : 'свой профиль'}{' '}
        <InfoHint label={`ТО: ${vehicle.id}`}>
          {policy?.source ?? 'Нет интервала для этой модели.'} Счётчик
          принадлежит аппарату, а не батарее. В демонстрации наработка
          модельная.
        </InfoHint>
      </summary>
      <div className="maintenance-fields">
        <label>
          После ТО, полётов
          <input
            aria-label={`Наработка полётов: ${vehicle.id}`}
            type="number"
            min="0"
            step="1"
            value={flights}
            disabled={disabled}
            onChange={(e) => setFlights(e.target.value)}
          />
        </label>
        <label>
          После ТО, часов
          <input
            aria-label={`Наработка часов: ${vehicle.id}`}
            type="number"
            min="0"
            step="0.01"
            value={hours}
            disabled={disabled}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
        <button
          className="mw-button small"
          disabled={disabled || !valid}
          onClick={() => {
            const old = vehicle.maintenance;
            if (
              old &&
              (Number(flights) < old.flightsSinceService ||
                Number(hours) * 3600 < old.flightSecondsSinceService - 0.5) &&
              !window.confirm(
                'Уменьшить наработку после выполненного ТО? Замена батареи не является обслуживанием БВС.',
              )
            )
              return;
            onSave(vehicle.id, {
              flightsSinceService: Number(flights),
              flightSecondsSinceService: Number(hours) * 3600,
              source: 'simulation',
            });
          }}
        >
          Сохранить наработку
        </button>
      </div>
    </details>
  );
}
