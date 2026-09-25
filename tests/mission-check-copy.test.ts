import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plainMissionCheck,
  shortMissionVerdict,
} from '../lib/planner/mission-check-copy.ts';
import type { Check } from '../lib/planner/schema.ts';

const check = (id: string, status: Check['status'] = 'fail'): Check => ({
  id,
  status,
  title: 'Название исходной проверки',
  detail: 'Полная формула и исходные данные сохраняются.',
});

void test('plain check copy preserves status and original evidence unchanged', () => {
  const original = check('job-1:EXPORTED_SEPARATION');
  const snapshot = JSON.stringify(original);
  assert.match(plainMissionCheck(original).explanation, /сближаются/);
  assert.equal(JSON.stringify(original), snapshot);
  assert.match(
    plainMissionCheck(check('ENERGY')).explanation,
    /Заряда недостаточно/,
  );
  assert.match(
    plainMissionCheck(check('QUALITY_job_ALTITUDE_GSD')).explanation,
    /подобрать допустимую высоту/,
  );
  assert.match(
    plainMissionCheck(check('QUALITY_job_GSD')).explanation,
    /недостаточно подробными/,
  );
  assert.match(
    plainMissionCheck(check('GEOMETRY')).explanation,
    /пересекает запрет/,
  );
});

void test('unknown checks are neither promoted to pass nor presented as violations', () => {
  const text = plainMissionCheck(check('ENERGY', 'unknown'));
  assert.match(text.explanation, /ограничен исходными данными/);
  assert.doesNotMatch(text.explanation, /недостаточно|соблюдено/);
  assert.match(
    plainMissionCheck(check('ENERGY', 'pass')).explanation,
    /соблюдено в расчёте/,
  );
});

void test('failed coverage is one short reason, not an invented battery diagnosis', () => {
  const verdict = shortMissionVerdict({
    status: 'not_found',
    checks: [
      check('STRIPS'),
      check('COVERAGE_job'),
      check('PHOTO_job_COVERAGE'),
    ],
  });
  assert.equal(verdict.ready, false);
  assert.equal(verdict.reason, plainMissionCheck(check('STRIPS')).explanation);
  assert.doesNotMatch(verdict.reason, /Заряда недостаточно/);
  assert.ok(verdict.reason.length < 160);
});

void test('only feasible status without failures gets a ready summary', () => {
  assert.equal(
    shortMissionVerdict({
      status: 'feasible_model',
      checks: [check('ENERGY', 'pass')],
    }).ready,
    true,
  );
  assert.equal(
    shortMissionVerdict({ status: 'feasible_model', checks: [check('ENERGY')] })
      .ready,
    false,
  );
  for (const status of [
    'not_found',
    'partial',
    'invalid',
    'unsupported',
  ] as const) {
    const verdict = shortMissionVerdict({ status, checks: [] });
    assert.equal(verdict.ready, false);
    assert.ok(verdict.reason.length > 0);
  }
});

void test('summary keeps at most two distinct reasons; unfamiliar checks remain accessible', () => {
  const checks = [
    check('ENERGY'),
    check('job:ENERGY'),
    check('WIND'),
    check('SEPARATION'),
  ];
  const verdict = shortMissionVerdict({ status: 'invalid', checks });
  assert.equal(
    verdict.reason,
    `${plainMissionCheck(checks[0]).explanation} ${plainMissionCheck(checks[2]).explanation}`,
  );
  assert.match(
    plainMissionCheck(check('NEW_VALIDATOR')).explanation,
    /Название исходной проверки/,
  );
  assert.equal(checks.length, 4);
});
