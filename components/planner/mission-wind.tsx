'use client';

import { describeMissionWind } from '@/lib/planner/mission-guidance';
import { InfoHint } from './mission-help';

export default function MissionWind({
  speedMps,
  fromDeg,
  compact = false,
  forecast = false,
}: {
  speedMps: number;
  fromDeg: number;
  compact?: boolean;
  forecast?: boolean;
}) {
  const wind = describeMissionWind(speedMps, fromDeg);
  return (
    <div
      className={`mw-wind-panel ${compact ? 'compact' : ''}`}
      aria-label="Ветер миссии"
    >
      <svg viewBox="0 0 76 76" width="64" height="64" aria-hidden="true">
        <circle
          cx="38"
          cy="38"
          r="24"
          fill="none"
          stroke="currentColor"
          opacity=".25"
        />
        <text x="38" y="10" textAnchor="middle">
          С
        </text>
        <text x="38" y="73" textAnchor="middle">
          Ю
        </text>
        <text x="5" y="42" textAnchor="middle">
          З
        </text>
        <text x="70" y="42" textAnchor="middle">
          В
        </text>
        {wind.calm ? (
          <circle cx="38" cy="38" r="5" fill="currentColor" />
        ) : (
          <g transform={`rotate(${wind.toDeg} 38 38)`}>
            <path
              d="M38 55V21M30 30L38 21L46 30"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
      <div>
        <strong>{wind.text}</strong>
        <InfoHint label="Как читать ветер?">
          Направление «от» — откуда дует ветер: 0° с севера, 90° с востока, 180°
          с юга, 270° с запада. Стрелка показывает, куда движется воздух.
          Встречный и боковой ветер учитываются при расчёте маршрута.
        </InfoHint>
        <small>
          {forecast
            ? 'Вектор из сохранённого прогноза'
            : 'Задан в миссии · ручной режим'}
        </small>
        {!compact && (
          <p>
            Один постоянный ветер для всей области и окна работ.
            {forecast
              ? 'Взяты максимальная скорость выборки и направление в этот час. Динамика ветра не моделируется.'
              : 'Подключение прогноза доступно в «Погода и условия».'}
          </p>
        )}
      </div>
    </div>
  );
}
