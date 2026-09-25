'use client';
import { useMemo } from 'react';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import {
  catalogRestrictions,
  restrictionMapLabel,
} from '@/lib/planner/mission-catalog';
import { atmosphereFor } from '@/lib/planner/airspace-altitudes';
import { InfoHint } from './mission-help';

export default function MissionAirspaceLayerSummary({
  document,
  onChange,
}: {
  document: MissionDocument;
  onChange: (d: MissionDocument) => void;
}) {
  const result = useMemo(() => {
    try {
      return { zones: catalogRestrictions(document), error: '' };
    } catch (error) {
      return {
        zones: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [document]);
  const atmosphere = atmosphereFor(document);
  const source =
    'Настройка высотной модели оператором стенда; не разрешение на реальный полёт.';
  return (
    <details className="airspace-layer-details">
      <summary>Высоты и время зон · {result.zones.length}</summary>
      <label className="airspace-model-row">
        <span>
          Пересчёт эшелонов FL{' '}
          <InfoHint label="Пересчёт эшелонов FL">
            FL — барометрическая высота, не высота над землёй. Стандартная
            атмосфера используется только как модель. Для расчёта относительно
            местности нужна её абсолютная отметка; она задаётся в параметрах
            высоты миссии. Неизвестные данные не означают свободное
            пространство.
          </InfoHint>
        </span>
        <select
          aria-label="Модель пересчёта FL"
          value={atmosphere.kind}
          onChange={(e) => {
            const kind = e.target.value;
            onChange({
              ...document,
              airspaceAltitudeReference:
                kind === 'pressure-altitude-offset'
                  ? { kind, offsetM: 0, uncertaintyM: 100, source }
                  : { kind: kind as 'standard-atmosphere' | 'unknown', source },
            });
          }}
        >
          <option value="standard-atmosphere">
            Стандартная атмосфера · модель
          </option>
          <option value="pressure-altitude-offset">
            Известная поправка высоты
          </option>
          <option value="unknown">Данных для пересчёта нет</option>
        </select>
      </label>
      {atmosphere.kind === 'pressure-altitude-offset' && (
        <div className="airspace-model-offsets">
          <label>
            Барометрическая высота минус AMSL, м{' '}
            <input
              aria-label="Поправка барометрической высоты"
              type="number"
              min={-3000}
              max={3000}
              value={atmosphere.offsetM}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isFinite(n) && Math.abs(n) <= 3000)
                  onChange({
                    ...document,
                    airspaceAltitudeReference: {
                      ...atmosphere,
                      offsetM: n,
                      source,
                    },
                  });
              }}
            />
          </label>
          <label>
            Неопределённость ±м{' '}
            <input
              aria-label="Неопределённость пересчёта высоты"
              type="number"
              min={0}
              max={3000}
              value={atmosphere.uncertaintyM}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (Number.isFinite(n) && n >= 0 && n <= 3000)
                  onChange({
                    ...document,
                    airspaceAltitudeReference: {
                      ...atmosphere,
                      uncertaintyM: n,
                      source,
                    },
                  });
              }}
            />
          </label>
        </div>
      )}
      {result.error && <p role="alert">{result.error}</p>}
      <div
        className="airspace-zone-list"
        aria-label="Ограничения в области миссии"
      >
        {result.zones.map((r) => {
          const summary = restrictionMapLabel(
            r,
            document.scenario.job.altitudeM,
            Date.parse(document.window.start),
          );
          return (
            <div
              key={r.id}
              className={
                summary.relevant
                  ? 'airspace-zone-row is-relevant'
                  : 'airspace-zone-row'
              }
            >
              <strong>{r.name}</strong>
              <span>{r.catalog?.rawAltitude}</span>
              <InfoHint label={`Условия зоны ${r.name}`}>
                {summary.text}
              </InfoHint>
              <small>
                {r.catalog?.timePolicy === 'unknown'
                  ? 'Расписания нет · учитывается весь период'
                  : r.startAt
                    ? 'Заданный интервал'
                    : 'Постоянное ограничение'}
              </small>
            </div>
          );
        })}
        {!result.zones.length && !result.error && (
          <small>Этот каталог не пересекает выбранную область.</small>
        )}
      </div>
    </details>
  );
}
