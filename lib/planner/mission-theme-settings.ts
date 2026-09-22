/** Interface preference only; deliberately independent of mission data/hashes. */
export type MissionThemePreference = 'light' | 'dark' | 'system';
export type MissionResolvedTheme = 'light' | 'dark';

export const MISSION_THEME_STORAGE_KEY = 'prime:mission-theme:v1';

export function parseMissionThemePreference(value: unknown): MissionThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system';
}

export function resolveMissionTheme(
  preference: MissionThemePreference,
  systemIsDark: boolean,
): MissionResolvedTheme {
  return preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;
}
