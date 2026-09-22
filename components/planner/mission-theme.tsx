'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  MISSION_THEME_STORAGE_KEY,
  parseMissionThemePreference,
  resolveMissionTheme,
} from '@/lib/planner/mission-theme-settings';
import type { MissionThemePreference } from '@/lib/planner/mission-theme-settings';

const preferenceEvent = 'prime-mission-theme-change';
const systemQuery = '(prefers-color-scheme: dark)';
const serverPreference = (): MissionThemePreference => 'system';
const serverSystemIsDark = () => false;
const readPreference = (): MissionThemePreference => {
  try {
    return parseMissionThemePreference(
      window.localStorage.getItem(MISSION_THEME_STORAGE_KEY),
    );
  } catch {
    return 'system';
  }
};
const readSystemIsDark = () => window.matchMedia(systemQuery).matches;
function subscribePreference(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MISSION_THEME_STORAGE_KEY || event.key === null) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(preferenceEvent, notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(preferenceEvent, notify);
  };
}
function subscribeSystem(notify: () => void) {
  const media = window.matchMedia(systemQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}

/** Mount once in the workbench header. Does not change mission input or approval. */
export default function MissionThemeSelector() {
  const id = useId();
  const storedPreference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    serverPreference,
  );
  const systemIsDark = useSyncExternalStore(
    subscribeSystem,
    readSystemIsDark,
    serverSystemIsDark,
  );
  const [sessionPreference, setSessionPreference] =
    useState<MissionThemePreference | null>(null);
  const preference = sessionPreference ?? storedPreference;
  const [canPersist, setCanPersist] = useState(true);
  const resolved = resolveMissionTheme(preference, systemIsDark);

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-prime-theme');
    const previousPreference = root.getAttribute('data-prime-theme-preference');
    return () => {
      if (previousTheme === null) root.removeAttribute('data-prime-theme');
      else root.setAttribute('data-prime-theme', previousTheme);
      if (previousPreference === null)
        root.removeAttribute('data-prime-theme-preference');
      else root.setAttribute('data-prime-theme-preference', previousPreference);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.primeTheme = resolved;
    document.documentElement.dataset.primeThemePreference = preference;
  }, [preference, resolved]);

  const change = (value: string) => {
    const next = parseMissionThemePreference(value);
    try {
      window.localStorage.setItem(MISSION_THEME_STORAGE_KEY, next);
      setSessionPreference(null);
      setCanPersist(true);
      window.dispatchEvent(new Event(preferenceEvent));
    } catch {
      // Storage can be disabled by the browser; changing the visible theme still works.
      setSessionPreference(next);
      setCanPersist(false);
    }
  };
  const Icon =
    preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <div className="mw-theme-control">
      <label htmlFor={id} className="mw-theme-label">
        <Icon size={15} aria-hidden="true" />
        <span>Тема</span>
      </label>
      <select
        id={id}
        aria-label="Тема интерфейса"
        aria-describedby={!canPersist ? `${id}-status` : undefined}
        value={preference}
        onChange={(event) => change(event.target.value)}
      >
        <option value="system">Как в системе</option>
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
      </select>
      {!canPersist && (
        <output id={`${id}-status`} className="mw-theme-storage-note">
          Тема действует сейчас; браузер не разрешил сохранить настройку.
        </output>
      )}
    </div>
  );
}
