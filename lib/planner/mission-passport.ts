import type { MissionDocument } from './mission-schema.ts';
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function missionPassportHtml(d: MissionDocument): string {
  const rows = d.jobs
    .map(
      (j) =>
        `<tr><td>${escape(j.name)}</td><td>${escape(j.job.type)}</td><td>${j.quality.altitudeMode === 'gsd' ? 'По камере — будет рассчитана после назначения' : `${j.job.altitudeM} м (заданная)`}</td><td>${escape(j.assignedVehicleIds.length ? j.assignedVehicleIds.join(', ') : 'Автоматически')}</td></tr>`,
    )
    .join('');
  const sections = Object.entries(d)
    .map(
      ([key, value]) =>
        `<details><summary>${escape(key)}</summary><pre>${escape(typeof value === 'object' ? JSON.stringify(value, null, 2) : value)}</pre></details>`,
    )
    .join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(d.name)} — паспорт миссии</title><style>body{font:16px/1.5 system-ui;margin:32px auto;max-width:1000px;padding:0 20px;color:#17354c;background:#f5f8fb}article{background:white;padding:24px;border-radius:16px}h1{margin:0 0 8px}table{border-collapse:collapse;width:100%;margin:18px 0}td,th{padding:10px;text-align:left;border-bottom:1px solid #d8e3ee}details{padding:10px;border-bottom:1px solid #d8e3ee}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}small{color:#52677a}@media print{body{margin:0;background:white}details{break-inside:avoid}}</style><article><h1>${escape(d.name)}</h1><small>ID: ${escape(d.id)} · версия ${escape(d.schemaVersion)}</small><p>Период: ${escape(d.window.start)} — ${escape(d.window.end)} · ${escape(d.window.timezone)}</p><p>Доступно БВС: ${d.scenario.vehicles.filter((v) => v.enabled).length}. Запас батареи при посадке: ${d.scenario.reservePct}%. Ветер: ${d.scenario.wind.speedMps} м/с.</p><table><thead><tr><th>Работа / участок</th><th>Тип</th><th>Высота</th><th>Назначение</th></tr></thead><tbody>${rows}</tbody></table><p>Это паспорт исходных параметров, не отчёт о выполнении. Для повторной загрузки используйте файл .mission.json.</p><h2>Полные параметры</h2>${sections}</article></html>`;
}
