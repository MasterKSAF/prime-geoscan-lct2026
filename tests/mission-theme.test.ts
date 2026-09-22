import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MISSION_THEME_STORAGE_KEY,
  parseMissionThemePreference,
  resolveMissionTheme,
} from '../lib/planner/mission-theme-settings.ts';

void test('theme preference accepts only the three declared modes', () => {
  for (const value of ['light', 'dark', 'system'] as const) {
    assert.equal(parseMissionThemePreference(value), value);
  }
  for (const value of [null, undefined, '', 'DARK', 'auto', ' dark ', 1, true, {}, []]) {
    assert.equal(parseMissionThemePreference(value), 'system');
  }
});

void test('system theme follows OS preference and explicit theme ignores it', () => {
  assert.equal(resolveMissionTheme('system', false), 'light');
  assert.equal(resolveMissionTheme('system', true), 'dark');
  for (const systemIsDark of [false, true]) {
    assert.equal(resolveMissionTheme('light', systemIsDark), 'light');
    assert.equal(resolveMissionTheme('dark', systemIsDark), 'dark');
  }
});

void test('theme persistence has a versioned key separate from mission documents', () => {
  assert.equal(MISSION_THEME_STORAGE_KEY, 'prime:mission-theme:v1');
});
