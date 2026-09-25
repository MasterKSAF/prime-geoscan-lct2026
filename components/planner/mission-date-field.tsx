'use client';
import { useState } from 'react';
import {
  missionDateFromLocal,
  missionLocalDate,
} from '@/lib/planner/mission-date-input';
type DateFieldProps = { label: string; value: string; timezone: string; disabled?: boolean; onChange: (iso: string) => void };
export function MissionDateField(props: DateFieldProps) {
  return <CalendarField key={`${props.value}:${props.timezone}`} {...props} />;
}
function CalendarField({
  label,
  value,
  timezone,
  disabled,
  onChange,
}: DateFieldProps) {
  const [draft, setDraft] = useState(() => missionLocalDate(value, timezone));
  const [error, setError] = useState('');
  const commit = () => {
    try {
      const iso = missionDateFromLocal(draft, timezone);
      onChange(iso);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <label className="mw-field expert-date-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="datetime-local"
        step="1"
        value={draft}
        disabled={disabled}
        aria-invalid={!!error}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
export function MissionTimezoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (zone: string) => void;
}) {
  const zones = [
    ['Europe/Kaliningrad', 'Калининград · UTC+2'],
    ['Europe/Moscow', 'Москва · UTC+3'],
    ['Europe/Samara', 'Самара · UTC+4'],
    ['Asia/Yekaterinburg', 'Екатеринбург · UTC+5'],
    ['Asia/Omsk', 'Омск · UTC+6'],
    ['Asia/Krasnoyarsk', 'Красноярск · UTC+7'],
    ['Asia/Irkutsk', 'Иркутск · UTC+8'],
    ['Asia/Yakutsk', 'Якутск · UTC+9'],
    ['Asia/Vladivostok', 'Владивосток · UTC+10'],
    ['Asia/Magadan', 'Магадан · UTC+11'],
    ['Asia/Kamchatka', 'Камчатка · UTC+12'],
    ['UTC', 'UTC · +0'],
  ];
  if (!zones.some(([id]) => id === value)) zones.push([value, value]);
  return (
    <label className="mw-field">
      <span>Часовой пояс</span>
      <select
        aria-label="Часовой пояс миссии"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {zones.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
