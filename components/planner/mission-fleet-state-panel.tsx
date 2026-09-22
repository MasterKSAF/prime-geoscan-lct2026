'use client';
import { useRef, useState } from 'react';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import {
  fleetStateFromDocument,
  installedBatteryDocument,
  parseFleetState,
} from '@/lib/planner/mission-fleet-state';
import type {
  FleetState,
  FleetReport,
} from '@/lib/planner/mission-fleet-state';
import { InfoHint } from './mission-help';
import { vehicleDisplayName } from '@/lib/planner/mission-vehicle-label';

export default function MissionFleetStatePanel({
  document,
  states,
  onReport,
  onApply,
}: {
  document: MissionDocument;
  states: FleetState[];
  onReport: (r: FleetReport) => Promise<FleetState>;
  onApply: () => void;
}) {
  const [selected, setSelected] = useState(document.scenario.vehicles[0].id);
  const [pct, setPct] = useState('');
  const [ready, setReady] = useState(true);
  const [grounded, setGrounded] = useState(true);
  const [replacement, setReplacement] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<FleetReport | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const fleet = [
    ...new Map(
      [...document.scenario.vehicles, ...states.map((s) => s.vehicle)].map(
        (v) => [v.id, v],
      ),
    ).values(),
  ];
  const selectedVehicle = fleet.find((vehicle) => vehicle.id === selected);
  async function send(report: FleetReport) {
    setBusy(true);
    setError('');
    try {
      await onReport(report);
      setPreview(null);
      setPct('');
      setReplacement(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось сохранить состояние.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mw-fleet-state-panel"
      aria-label="Текущее состояние парка"
    >
      <p>
        <span className="mw-caption">Модельный парк</span>{' '}
        <InfoHint label="Источник состояния">
          Реальные БВС не подключены. Посадка в симуляции сохраняет остаток
          заряда. Поле готовности — отдельное условие. Изменения состояния не
          запускают миссии автоматически. Для реальной эксплуатации нужен
          адаптер телеметрии с контролем давности и связи.
        </InfoHint>
      </p>
      <div className="mw-actions">
        <button className="mw-button" onClick={() => file.current?.click()}>
          Загрузить состояние БВС
        </button>
        <button className="mw-button primary" disabled={busy} onClick={onApply}>
          Применить парк к миссии
        </button>
      </div>
      <input
        type="file"
        accept=".json"
        ref={file}
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            if (f.size > 200 * 1024) throw new Error('Файл превышает 200 КиБ.');
            const raw = JSON.parse(await f.text());
            if (
              typeof raw.expectedRevision !== 'number' ||
              !Number.isSafeInteger(raw.expectedRevision) ||
              raw.expectedRevision < 0 ||
              typeof raw.replacement !== 'boolean'
            )
              throw new Error('Нужны expectedRevision, replacement и state.');
            setPreview({
              expectedRevision: raw.expectedRevision,
              replacement: raw.replacement,
              state: parseFleetState(raw.state),
            });
            setError('');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Некорректный файл.');
          }
        }}
      />
      {preview && (
        <div className="mw-card">
          <strong>{vehicleDisplayName(preview.state.vehicle)}</strong>
          <p>
            {preview.state.vehicle.jobs.join(' / ')} · заряд{' '}
            {preview.state.battery.initialPct}% ·{' '}
            {preview.state.ready ? 'готов' : 'не готов'}
          </p>
          <button
            className="mw-button"
            disabled={busy}
            onClick={() => void send(preview)}
          >
            Подтвердить состояние из файла
          </button>
          <button className="mw-button" onClick={() => setPreview(null)}>
            Отмена
          </button>
        </div>
      )}
      <div className="mw-fleet-state-list">
        {fleet.map((v) => {
          const s = states.find((s) => s.id === v.id);
          return (
            <button
              key={v.id}
              className="mw-card"
              aria-pressed={selected === v.id}
              onClick={() => {
                setSelected(v.id);
                setPct('');
                setReplacement(false);
                setGrounded(s?.grounded ?? true);
                setReady(s?.ready ?? true);
              }}
            >
              <strong>{vehicleDisplayName(v)}</strong>
              <span>
                {s?.battery.initialPct.toFixed(1) ?? v.batteryPct}% ·{' '}
                {s
                  ? s.ready
                    ? 'Готов к расчёту'
                    : s.grounded
                      ? 'На земле · не готов'
                      : 'В воздухе / положение не подтверждено'
                  : 'Начальный профиль'}
              </span>
              <small>
                {v.jobs.join(' / ')} ·{' '}
                {s?.source === 'simulation' ? 'Симуляция' : 'Данные оператора'}
              </small>
            </button>
          );
        })}
      </div>
      <form
        className="mw-card"
        onSubmit={(e) => {
          e.preventDefault();
          const old = states.find((s) => s.id === selected);
          const at = new Date().toISOString();
          const base = structuredClone(
            old ??
              fleetStateFromDocument(
                installedBatteryDocument(document),
                selected,
                at,
              ),
          );
          const charge = pct === '' ? base.battery.initialPct : Number(pct);
          const battery = { ...base.battery, initialPct: charge };
          if (replacement) battery.id = `battery-${crypto.randomUUID()}`;
          void send({
            expectedRevision: old?.revision ?? 0,
            replacement,
            state: {
              ...base,
              observedAt: at,
              source: 'operator',
              operationId: null,
              grounded,
              ready,
              preparationRemainingSec: ready ? 0 : base.preparationRemainingSec,
              battery,
              vehicle: { ...base.vehicle, batteryPct: charge },
              lastEvent: replacement
                ? 'Оператор сообщил замену батареи.'
                : 'Оператор подтвердил текущее состояние.',
            },
          });
        }}
      >
        <h3>
          {selectedVehicle
            ? vehicleDisplayName(selectedVehicle)
            : 'Выберите БВС'}
        </h3>
        <label className="mw-field">
          Текущий заряд, %
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={pct}
            placeholder={(
              states.find((s) => s.id === selected)?.battery.initialPct ??
              fleet.find((v) => v.id === selected)?.batteryPct ??
              0
            ).toFixed(1)}
            onChange={(e) => setPct(e.target.value)}
          />
        </label>
        <label className="mw-checkbox">
          <input
            type="checkbox"
            checked={grounded}
            onChange={(e) => {
              setGrounded(e.target.checked);
              if (!e.target.checked) setReady(false);
            }}
          />
          Посадка подтверждена
        </label>
        <label className="mw-checkbox">
          <input
            type="checkbox"
            checked={ready}
            disabled={!grounded}
            onChange={(e) => setReady(e.target.checked)}
          />
          Готов к вылету
        </label>
        <label className="mw-checkbox">
          <input
            type="checkbox"
            checked={replacement}
            disabled={!grounded}
            onChange={(e) => setReplacement(e.target.checked)}
          />
          Батарея заменена
        </label>
        <button type="submit" className="mw-button primary" disabled={busy}>
          Записать состояние
        </button>
      </form>
      {error && (
        <p role="alert" className="mw-alert">
          {error}
        </p>
      )}
      <details className="mw-details">
        <summary>
          Формат файла и журнал{' '}
          <InfoHint label="Формат состояния БВС">
            JSON: expectedRevision — текущая ревизия (0 для нового БВС),
            replacement — факт замены, state — состояние с полным профилем.
            observedAt — свежая отметка ISO 8601. Источник — operator. Сохраните
            пример и замените параметры.
          </InfoHint>
        </summary>
        <button
          className="mw-button"
          onClick={() => {
            const base =
              states.find((s) => s.id === selected) ??
              fleetStateFromDocument(
                installedBatteryDocument(document),
                selected,
                new Date().toISOString(),
              );
            const payload = {
              expectedRevision:
                states.find((s) => s.id === selected)?.revision ?? 0,
              replacement: false,
              state: {
                ...base,
                source: 'operator',
                operationId: null,
                observedAt: new Date().toISOString(),
              },
            };
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(payload, null, 2)], {
                type: 'application/json',
              }),
            );
            const a = window.document.createElement('a');
            a.href = url;
            a.download = 'vehicle-state.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Скачать пример состояния
        </button>
        <pre>{JSON.stringify(states, null, 2)}</pre>
      </details>
    </section>
  );
}
