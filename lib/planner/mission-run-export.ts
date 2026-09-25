import { assertRevisionBinding } from './mission-revision-binding.ts';
import {
  verifyMissionOperation,
  deriveOperationVehicleStates,
} from './mission-operations.ts';
import type { MissionOperation } from './mission-operations.ts';
import { operationJournal } from './mission-operation-journal.ts';
import { missionGeoJSON, missionKML } from './mission-export.ts';
import { sha256, sha256Text, canonicalStringify } from './mission-schema.ts';
import { missionResourceReport } from './mission-resources.ts';

/** Immutable run, not the editor's latest input or the animation scrubber. */
export async function missionRunReport(
  input: MissionOperation,
  ancestors: MissionOperation[] = [],
) {
  const operation = await verifyMissionOperation(structuredClone(input));
  const history: MissionOperation[] = [];
  let cursor = operation.document.revisionSource;
  const visited = new Set([operation.id]);
  while (cursor) {
    const parent = ancestors.find((r) => r.id === cursor!.operationId);
    if (!parent || visited.has(parent.id))
      throw new Error(
        'Для отчёта нужна полная неповторяющаяся история пересмотра.',
      );
    const verified = await verifyMissionOperation(parent);
    if (verified.integrityHash !== cursor.integrityHash)
      throw new Error('Изменилась исходная версия пересмотра.');
    assertRevisionBinding(
      history.at(-1)?.document ?? operation.document,
      verified,
    );
    history.push(verified);
    visited.add(verified.id);
    cursor = verified.document.revisionSource;
  }
  const geojson = missionGeoJSON(operation.document, operation.candidate);
  const kml = missionKML(operation.document, operation.candidate);
  return {
    schemaVersion: 'prime-run-report/1',
    evidenceKind: 'model-execution-snapshot',
    flightReady: false,
    operation,
    ...(history.length ? { revisionHistory: history } : {}),
    journal: operationJournal(operation),
    vehicleStates: deriveOperationVehicleStates(operation),
    plannedArtifacts: { geojson, kml },
    resources: missionResourceReport(operation.document, operation.candidate),
    artifactHashes: {
      geojson: await sha256(geojson),
      kml: await sha256Text(kml),
    },
    limitations: [
      'Модельное выполнение, не бортовая телеметрия и не реальные материалы съёмки.',
      'Проверки маршрута относятся к модели и загруженным ограничениям; неизвестные препятствия не проверены.',
      'Журнал включает модельные события до сохранённой контрольной точки; это не полная история действий оператора.',
      'Маршрутные файлы содержат полный план, а не подтверждение прохождения всех его точек.',
    ],
  };
}
export async function verifyMissionRunReport(value: unknown) {
  if (!value || typeof value !== 'object' || !('operation' in value))
    throw new Error('Нет снимка запуска.');
  const expected = await missionRunReport(
    value.operation as MissionOperation,
    ('revisionHistory' in value
      ? value.revisionHistory
      : []) as MissionOperation[],
  );
  if (canonicalStringify(value) !== canonicalStringify(expected))
    throw new Error(
      'Отчёт, журнал, состояния или маршрутные файлы не совпадают с проверенным снимком запуска.',
    );
  return expected;
}
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function missionRunReportHtml(
  report: Awaited<ReturnType<typeof missionRunReport>>,
) {
  const r = report.operation;
  const checks = r.candidate.checks
    .map(
      (c) =>
        `<tr><td>${escape(c.title)}</td><td>${escape(c.status)}</td><td>${escape(c.detail)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(r.document.name)} · отчёт</title><style>body{font:15px/1.6 system-ui;margin:32px auto;padding:0 24px;max-width:1100px;color:#183047}h1{line-height:1.2}small{color:#5b6b7a}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #dbe4eb;padding:9px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f6f9;padding:16px;font-size:11px}code{overflow-wrap:anywhere}@media print{details{display:block}pre{font-size:9px}}</style><h1>${escape(r.document.name)}</h1><p>Отчёт о модельном запуске. Реальные БВС не подключены.</p><p>Миссия: <code>${escape(r.document.id)}</code><br>Запуск: <code>${escape(r.id)}</code><br>Статус: ${escape(report.journal.status)}<br>Пройдено в модели: ${(r.progressSec / 60).toFixed(1)} из ${(r.candidate.metrics.makespanSec / 60).toFixed(1)} мин.<br>Начат: ${escape(r.startedAt ?? 'не начат')} · Контрольная точка: ${escape(r.updatedAt)}</p><h2>История версий</h2><p>${[...(report.revisionHistory ?? []).slice().reverse(), r].map((x) => escape(x.id) + ' · ' + escape(x.status) + ' · ' + (x.progressSec / 60).toFixed(1) + ' мин модели').join('<br>')}</p><h2>Проверки плана</h2><table><thead><tr><th>Проверка</th><th>Результат</th><th>Основание</th></tr></thead><tbody>${checks}</tbody></table><h2>Границы доказательств</h2><ul>${report.limitations.map((x) => `<li>${escape(x)}</li>`).join('')}</ul><details><summary>Полный снимок, журнал, условия, остатки заряда и маршрутные файлы</summary><pre>${escape(JSON.stringify(report, null, 2))}</pre></details><p><small>Вход SHA-256: ${escape(r.inputHash)}<br>План SHA-256: ${escape(r.planHash)}<br>Снимок SHA-256: ${escape(r.integrityHash)}</small></p></html>`;
}
