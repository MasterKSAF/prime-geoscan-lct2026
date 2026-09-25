import {
  sha256Text,
  sha256,
  canonicalStringify,
  type MissionDocument,
  type MissionCandidate,
  MISSION_ENGINE_VERSION,
} from './mission-schema.ts';
import {
  recoveryOptions,
  recoverySnapshot,
  safetySchema,
} from './mission-safety.ts';
import { recoveryPreflight } from './mission-recovery-preflight.ts';
import { operationJournal } from './mission-operation-journal.ts';
import { MISSION_EVIDENCE_GUIDE } from './mission-evidence-guide.ts';
import { missionPassportHtml } from './mission-passport.ts';
import { missionGeoJSON, missionKML } from './mission-export.ts';
import { validateExportedCandidate } from './mission-validation.ts';
import {
  missionRunReport,
  missionRunReportHtml,
} from './mission-run-export.ts';
import type { MissionOperation } from './mission-operations.ts';
import { parseObstacleKml, relevantObstacles } from './obstacle-layer.ts';
import { simulationArtifacts } from './demo-session.ts';
import {
  missionResourceReport,
  missionResourceHtml,
} from './mission-resources.ts';
import {
  parseMissionCatalog,
  normalizedZone,
  catalogRestrictions,
} from './mission-catalog.ts';

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const safePath = (name: string) =>
  /^[a-zA-Z0-9_.\-/]+$/.test(name) &&
  !name.startsWith('/') &&
  !name.split('/').some((p) => !p || p === '..' || p === '.');
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

async function catalogEvidence(
  document: MissionDocument,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const source of document.catalogLayers ?? []) {
    const path = `data/sources/${source.role}`;
    const catalog = parseMissionCatalog(source.sourceText);
    files[`${path}.kml`] = source.sourceText;
    files[`${path}.provenance.json`] = json({
      filename: source.filename,
      version: source.version,
      sha256: await sha256Text(source.sourceText),
      selectedIds: source.selectedIds,
      total: catalog.total,
      accepted: catalog.accepted,
      rejected: catalog.rejected,
      warnings: catalog.warnings,
      objects: catalog.objects.map(
        ({ id, sourceId, name, error, warnings, editable }) => ({
          id,
          sourceId,
          name,
          error,
          warnings,
          editable,
        }),
      ),
    });
    if (source.role === 'restrictions') {
      files['data/restrictions/normalized.json'] = json({
        type: 'prime-zone-catalog',
        schemaVersion: '2.0',
        zones: catalog.objects.map((o) => ({
          ...normalizedZone(source, o, document),
          geometry: o.geometry,
          error: o.error,
        })),
      });
      try {
        files['data/restrictions/applied.json'] = json(
          catalogRestrictions(document),
        );
      } catch (e) {
        files['data/restrictions/applied.json'] = json({
          error: String(e),
          status: 'blocked',
        });
      }
    }
  }
  return files;
}

/** ZIP STORE, UTF-8, bounded filenames; no shell, executable, compression or remote resources. */
export function createStoredZip(
  files: Record<string, string>,
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    if (!safePath(name)) throw new Error('Недопустимый путь архива.');
    const path = encoder.encode(name),
      bytes = encoder.encode(text),
      crc = crc32(bytes);
    const header = new Uint8Array(30 + path.length),
      view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, path.length, true);
    header.set(path, 30);
    chunks.push(header, bytes);
    const c = new Uint8Array(46 + path.length),
      cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, bytes.length, true);
    cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, path.length, true);
    cv.setUint32(42, offset, true);
    c.set(path, 46);
    central.push(c);
    offset += header.length + bytes.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0),
    end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  if (offset + centralSize + 22 > 100 * 1024 * 1024 || central.length > 1000)
    throw new Error('Архив превышает ограничение 100 МиБ / 1 000 файлов.');
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}

export async function buildMissionArchive(
  document: MissionDocument,
  candidate: MissionCandidate,
  operation?: MissionOperation,
  ancestors: MissionOperation[] = [],
) {
  const checks = await validateExportedCandidate(document, candidate);
  if (checks.some((c) => c.status === 'fail'))
    throw new Error(
      'Архив не сформирован: сохранённый план не прошёл повторную проверку.',
    );
  const report = operation
    ? await missionRunReport(operation, ancestors)
    : null;
  if (
    report &&
    (report.operation.inputHash !== candidate.plan.inputHash ||
      report.operation.candidate.id !== candidate.id ||
      canonicalStringify(report.operation.document) !==
        canonicalStringify(document))
  )
    throw new Error('Запуск относится к другой версии миссии.');
  const files: Record<string, string> = {
    'bagit.txt': 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n',
    'bag-info.txt': `Bagging-Date: ${new Date().toISOString().slice(0, 10)}\nExternal-Identifier: ${operation?.id ?? document.id}\nExternal-Description: PRIME model evidence, not flight telemetry\n`,
    'data/README.md': MISSION_EVIDENCE_GUIDE,
    'data/input/mission.html': missionPassportHtml(document),
    'data/input/mission.json': json(document),
    'data/plan/candidate.json': json(candidate),
    'data/analysis/resources.json': json(
      missionResourceReport(document, candidate),
    ),
    'data/checks/validation.json': json(checks),
    'data/checks/recovery-preflight.json': json(
      recoveryPreflight(document, candidate),
    ),
    'data/checks/requirements.json': json(
      checks.map((c) => ({
        requirement: c.id,
        status: c.status,
        evidence: 'checks/validation.json',
        detail: c.detail,
      })),
    ),
    'data/reproduce.json': json({
      engine: candidate.plan.engineVersion,
      inputHash: candidate.plan.inputHash,
      budgetMs: document.planning.maxComputeMs,
      method: 'verify-saved-candidate',
      flightReady: false,
      optimalityProven: false,
      searchProtocol: 'bounded-joint-order-and-departure-search-v1',
      limitation:
        'Повторная проверка сохранённого кандидата; новый ограниченный по времени поиск может отличаться на другом CPU.',
    }),
  };
  for (const vehicleId of new Set(candidate.sorties.map((s) => s.vehicleId))) {
    files[`data/routes/${vehicleId}.kml`] = missionKML(
      document,
      candidate,
      vehicleId,
    );
    files[`data/routes/${vehicleId}.geojson`] = json(
      missionGeoJSON(document, candidate, vehicleId),
    );
  }
  if (document.obstacleLayer) {
    const layer = document.obstacleLayer,
      catalog = parseObstacleKml(layer.sourceText);
    files['data/sources/obstacles.kml'] = layer.sourceText;
    files['data/sources/provenance.json'] = json({
      filename: layer.filename,
      sha256: await sha256Text(layer.sourceText),
      adapter: layer.version,
      accuracy: 'unknown',
      surveyDate: 'unknown',
      altitudePolicy: 'horizontal-all-altitudes',
    });
    files['data/obstacles/import-report.json'] = json(catalog);
    files['data/obstacles/context.json'] = json({
      bufferM: layer.bufferM,
      effectiveBufferM: Math.max(layer.bufferM, document.scenario.clearanceM),
      lineHalfWidthM: layer.lineHalfWidthM,
      policySource: layer.policySource,
      selectedIds: relevantObstacles(document).map((o) => o.id),
      validationScope: 'full-source-catalog-versus-actual-segments',
      terrain: 'not-provided-by-KML',
    });
  }
  if (report) {
    files['data/run/report.json'] = json(report);
    files['data/run/events.jsonl'] =
      report.journal.modelEvents
        .map((e: unknown) => JSON.stringify(e))
        .join('\n') + '\n';
    files['data/run/control-events.json'] = json(report.journal.controlEvents);
    files['data/report.html'] = missionRunReportHtml(report);
  } else {
    files['data/report.html'] =
      '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Расчёт миссии</title><h1>Проверенный модельный план</h1><p>Выполнение не запускалось. Журнал полёта не создавался.</p><p>Маршруты: routes/. Независимые проверки: checks/validation.json. Источники и параметры: input/mission.json.</p></html>';
  }
  Object.assign(files, await catalogEvidence(document));
  Object.assign(files, simulationArtifacts(document, candidate, operation));
  files['data/report.html'] = files['data/report.html'].replace(
    '</html>',
    missionResourceHtml(document, candidate) + '</html>',
  );
  if (files['data/simulation/captures.json']) {
    const previews = Object.entries(files)
      .filter(([name]) => name.startsWith('data/simulation/previews/'))
      .map(([, svg]) =>
        svg.replace(
          '<svg ',
          '<svg style="max-width:300px;height:auto;margin:8px" ',
        ),
      )
      .join('');
    files['data/report.html'] = files['data/report.html'].replace(
      '</html>',
      `<section><h2>Модельные материалы съёмки</h2><p>Опрос БВС и погода моделируются. Изображения — тестовые образцы, не реальные аэрофотоснимки.</p>${previews || '<p>Съёмочные проходы ещё не завершены: изображений пока нет.</p>'}<p>Манифест: simulation/captures.json. Опрос: simulation/poll.json. Погода: simulation/weather.json.</p></section></html>`,
    );
  }
  files['manifest-sha256.txt'] =
    (
      await Promise.all(
        Object.entries(files)
          .filter(([p]) => p.startsWith('data/'))
          .map(async ([p, t]) => `${await sha256Text(t)}  ${p}`),
      )
    ).join('\n') + '\n';
  files['tagmanifest-sha256.txt'] =
    (
      await Promise.all(
        ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt'].map(
          async (p) => `${await sha256Text(files[p])}  ${p}`,
        ),
      )
    ).join('\n') + '\n';
  return { files, bytes: createStoredZip(files) };
}

/** A rejected plan can be inspected, but must never masquerade as a successful run. */
export async function buildMissionDiagnosticArchive(
  document: MissionDocument,
  candidate: MissionCandidate,
) {
  if (candidate.plan.inputHash !== (await sha256(document)))
    throw new Error('Диагностика относится к другой версии миссии.');
  if (candidate.status === 'feasible_model')
    throw new Error(
      'Для выполнимого плана используйте архив с повторной проверкой.',
    );
  const checks = await validateExportedCandidate(document, candidate);
  const files: Record<string, string> = {
    'bagit.txt': 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n',
    'bag-info.txt':
      'External-Description: Rejected model plan diagnostics, NOT successful flight evidence\n',
    'data/diagnostic.json': json({
      schemaVersion: 1,
      kind: 'rejected-plan-diagnostic',
      flightReady: false,
      executionCompleted: false,
    }),
    'data/README.md':
      '# Диагностика невыполнимого плана\n\nЭто не доказательство успешного выполнения. Откройте report.html, затем checks/validation.json. input/mission.json — полный вход для редактора; input/mission.html — читаемый паспорт. plan/candidate.json — результат неуспешного поиска, analysis/resources.json — ресурсы. sources/ и restrictions/ — предоставленные слои и ограничения. Успешных маршрутных заданий и журнала выполненной миссии здесь нет.\n\nПроверка архива из корня проекта: `node --experimental-transform-types scripts/verify-mission-archive.ts <archive.zip>`. Для корректной диагностики ожидается status = diagnostic-only-not-flight-approved и код 1: это отказ в допуске плана, не повреждение ZIP. Ошибка целостности выводится отдельно. Хеши не являются электронной подписью.\n',
    'data/input/mission.json': json(document),
    'data/input/mission.html': missionPassportHtml(document),
    'data/plan/candidate.json': json(candidate),
    'data/analysis/resources.json': json(
      missionResourceReport(document, candidate),
    ),
    'data/checks/validation.json': json(checks),
    'data/checks/requirements.json': json(
      checks.map((c) => ({
        requirement: c.id,
        status: c.status,
        evidence: 'checks/validation.json',
        detail: c.detail,
      })),
    ),
    'data/reproduce.json': json({
      engine: candidate.plan.engineVersion,
      inputHash: candidate.plan.inputHash,
      method: 'verify-rejected-candidate',
      flightReady: false,
    }),
    'data/report.html':
      '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Диагностика миссии</title><h1>План требует исправления</h1><p>Это архив диагностики, не успешного запуска. План: plan/candidate.json. Нарушения и модельные допущения: checks/validation.json. Исходные данные: input/mission.json. Выполнение не запускалось.</p></html>',
  };
  if (document.obstacleLayer)
    files['data/sources/obstacles.kml'] = document.obstacleLayer.sourceText;
  files['data/report.html'] = files['data/report.html'].replace(
    '</html>',
    missionResourceHtml(document, candidate) + '</html>',
  );
  Object.assign(files, await catalogEvidence(document));
  Object.assign(files, simulationArtifacts(document, candidate));
  files['manifest-sha256.txt'] =
    (
      await Promise.all(
        Object.entries(files)
          .filter(([p]) => p.startsWith('data/'))
          .map(async ([p, t]) => `${await sha256Text(t)}  ${p}`),
      )
    ).join('\n') + '\n';
  files['tagmanifest-sha256.txt'] =
    (
      await Promise.all(
        ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt'].map(
          async (p) => `${await sha256Text(files[p])}  ${p}`,
        ),
      )
    ).join('\n') + '\n';
  return { files, bytes: createStoredZip(files) };
}

/** Reader for our STORE-only format. Never extracts onto the filesystem. */
export async function buildIncidentArchive(
  operation: MissionOperation,
  others: MissionOperation[] = [],
  runtime: Record<string, string> = {},
) {
  if (!operation.safety) throw new Error('У запуска нет нештатного события.');
  const d = operation.document,
    c = operation.candidate;
  const safety = safetySchema.parse(operation.safety);
  const inputHash = await sha256(d),
    planHash = await sha256(c);
  const { integrityHash, ...payload } = operation;
  const binding = {
    input: inputHash === operation.inputHash && inputHash === c.plan.inputHash,
    plan: planHash === operation.planHash,
    operation: (await sha256(payload)) === integrityHash,
  };
  const sameEngine = operation.engineVersion === MISSION_ENGINE_VERSION;
  const checks = await validateExportedCandidate(d, c);
  const options = recoveryOptions(d, c, safety);
  const fleet = recoverySnapshot(d, c, safety.modelTimeSec);
  const conflicts = options.flatMap((option) =>
    (option.diagnostics?.conflicts ?? []).map((hit) => ({
      policy: option.policy,
      ...hit,
    })),
  );
  const escape = (v: unknown) =>
    String(v).replace(
      /[&<>"']/g,
      (x) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[x]!,
    );
  const features = [
    ...fleet.map((v) => ({
      type: 'Feature',
      properties: { role: 'vehicle-at-event', ...v },
      geometry: { type: 'Point', coordinates: v.coordinate },
    })),
    ...d.scenario.vehicles.map((v) => ({
      type: 'Feature',
      properties: { role: 'landing-site', vehicleId: v.id },
      geometry: { type: 'Point', coordinates: v.landing },
    })),
    ...conflicts.map((hit) => ({
      type: 'Feature',
      properties: { role: 'conflict', ...hit },
      geometry: {
        type: 'LineString',
        coordinates: [hit.coordinate, hit.otherCoordinate],
      },
    })),
    ...options.flatMap((option) =>
      option.sorties.map((s) => ({
        type: 'Feature',
        properties: {
          role: 'recovery-route',
          policy: option.policy,
          vehicleId: s.vehicleId,
        },
        geometry: {
          type: 'LineString',
          coordinates: s.segments.flatMap((seg) => [seg.from, seg.to]),
        },
      })),
    ),
  ];
  const files: Record<string, string> = {
    'bagit.txt': 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n',
    'bag-info.txt':
      'External-Description: Incident diagnostics, NOT successful flight evidence\n',
    'data/incident/metadata.json': json({
      kind: 'mission-incident-diagnostic',
      schemaVersion: 1,
      operationId: operation.id,
      missionId: d.id,
      source: 'simulation',
      flightReady: false,
      originalEngine: operation.engineVersion,
      replayEngine: MISSION_ENGINE_VERSION,
      sameEngine,
      binding,
      eventModelTimeSec: safety.modelTimeSec,
      exportCheckpointSec: safety.progressSec,
      limitation:
        'Снимок модели, не бортовая телеметрия. Хеши проверяют целостность, но не являются подписью. Поиск ограниченный: отказ не доказывает отсутствие всех возможных маршрутов.',
    }),
    'data/README.md':
      '# Диагностика события\n\nОткройте report.html. Для разбора достаточно прислать весь этот ZIP. Скриншот и MP4 полезны, но необязательны.\n\nПроверка: `node --experimental-transform-types scripts/verify-mission-archive.ts <file.incident.zip>`.\n\n- input/mission.json: все исходные условия, базы, сенсоры, погода, ограничения и KML.\n- plan/candidate.json: полный утверждённый план с временными траекториями и энергией.\n- incident/operation.json: неизменённая запись выполнения и событие.\n- incident/fleet-at-event.json: положения, высоты, фазы и заряды всех БВС на момент события.\n- incident/recovery.json: повторно рассчитанные маршруты, причины отказа и свидетели конфликтов (пары БВС, время, координаты, высоты, расстояния и требуемые интервалы).\n- incident/map.geojson: точки и линии конфликтов, посадочные места, возвраты. Высоты и время — в свойствах; это горизонтальная проекция.\n- incident/other-operations.json: контекст остальных сохранённых запусков.\n- incident/journal.json: сохранённые события, не полный браузерный trace.\n- checks/: проверки исходного плана и контрольных моментов возврата.\n- runtime.json: версия и среда интерфейса без cookies и токенов.\n\nРезультаты пересчёта отделены от записанного события. Старую версию воспроизводите кодом соответствующего релиза; запуск не объявляется успешным из-за успешного экспорта.\n',
    'data/input/mission.json': json(d),
    'data/plan/candidate.json': json(c),
    'data/incident/operation.json': json(operation),
    'data/incident/fleet-at-event.json': json(fleet),
    'data/incident/recovery.json': json(options),
    'data/incident/map.geojson': json({ type: 'FeatureCollection', features }),
    'data/incident/journal.json': json(operationJournal(operation)),
    'data/incident/other-operations.json': json(
      others.filter((row) => row.id !== operation.id),
    ),
    'data/checks/validation.json': json(checks),
    'data/checks/recovery-preflight.json': json(recoveryPreflight(d, c)),
    'data/runtime.json': json(runtime),
    'data/report.html': `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Диагностика события</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:32px auto;padding:0 24px;color:#20354a}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{padding:16px;background:#fff6df;margin:12px 0}</style><h1>${escape(d.name)} · диагностика события</h1><p>Симуляция. Не отчёт успешного выполнения.</p><p>Запуск ${escape(operation.id)} · событие на ${safety.modelTimeSec.toFixed(1)} с · статус ${escape(safety.stage)}</p><p>Версия события ${escape(operation.engineVersion)}, версия пересчёта ${escape(MISSION_ENGINE_VERSION)}. ${sameEngine ? 'Версии совпадают.' : 'Версии различаются: пересчёт не подменяет исходное событие.'}</p>${options.map((o) => `<section><h2>${escape(o.label)}</h2><p>${o.valid ? 'Безопасный вариант найден в модели' : 'Безопасный вариант не найден'}.</p><p>${o.reasons.map(escape).join(' ')}</p></section>`).join('')}<h2>БВС на момент события</h2><table><tr><th>Аппарат</th><th>Фаза</th><th>Высота</th><th>Заряд</th></tr>${fleet.map((v) => `<tr><td>${escape(v.name)}</td><td>${escape(v.phase)}</td><td>${v.altitudeM.toFixed(1)} м</td><td>${v.batteryPct.toFixed(1)}%</td></tr>`).join('')}</table><h2>Конфликты отклонённых вариантов</h2><p>Наличие отклонённых вариантов не означает, что выбранный безопасный маршрут конфликтует. Список ограничен первыми 40 уникальными свидетелями на политику.</p><table><tr><th>БВС</th><th>Время</th><th>Расстояние / защитный порог</th></tr>${conflicts.map((h) => `<tr><td>${escape(h.vehicleId)} ↔ ${escape(h.otherVehicleId)}</td><td>${h.atSec.toFixed(1)} с</td><td>${h.horizontalDistanceM.toFixed(1)} / ${h.requiredHorizontalM.toFixed(1)} м</td></tr>`).join('')}</table><p>Координаты и высоты: <a href="incident/recovery.json">recovery.json</a>. <a href="incident/map.geojson">Карта конфликтов</a>. <a href="README.md">Состав комплекта</a>.</p></html>`,
  };
  if (d.obstacleLayer)
    files['data/sources/obstacles.kml'] = d.obstacleLayer.sourceText;
  Object.assign(files, await catalogEvidence(d));
  files['manifest-sha256.txt'] =
    (
      await Promise.all(
        Object.entries(files)
          .filter(([p]) => p.startsWith('data/'))
          .map(async ([p, t]) => `${await sha256Text(t)}  ${p}`),
      )
    ).join('\n') + '\n';
  files['tagmanifest-sha256.txt'] =
    (
      await Promise.all(
        ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt'].map(
          async (p) => `${await sha256Text(files[p])}  ${p}`,
        ),
      )
    ).join('\n') + '\n';
  return { files, bytes: createStoredZip(files) };
}

/** Reader for our STORE-only format. Never extracts onto the filesystem. */
export function readStoredZip(bytes: Uint8Array): Record<string, string> {
  if (bytes.length < 22 || bytes.length > 100 * 1024 * 1024)
    throw new Error('Неверный размер ZIP.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    end = bytes.length - 22;
  if (
    v.getUint32(end, true) !== 0x06054b50 ||
    v.getUint16(end + 20, true) !== 0 ||
    v.getUint16(end + 4, true) !== 0 ||
    v.getUint16(end + 6, true) !== 0
  )
    throw new Error('Неподдержанный ZIP.');
  const count = v.getUint16(end + 10, true),
    centralStart = v.getUint32(end + 16, true);
  if (
    count > 1000 ||
    v.getUint16(end + 8, true) !== count ||
    centralStart + v.getUint32(end + 12, true) !== end
  )
    throw new Error('Повреждён каталог ZIP.');
  const files: Record<string, string> = Object.create(null),
    decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let cursor = centralStart,
    expectedOffset = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || v.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('Повреждён ZIP.');
    const offset = v.getUint32(cursor + 42, true),
      size = v.getUint32(cursor + 24, true),
      len = v.getUint16(cursor + 28, true),
      crc = v.getUint32(cursor + 16, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + len));
    if (
      !safePath(name) ||
      Object.hasOwn(files, name) ||
      offset !== expectedOffset ||
      v.getUint16(cursor + 10, true) !== 0 ||
      v.getUint16(cursor + 8, true) !== 0x800 ||
      v.getUint16(cursor + 30, true) !== 0 ||
      v.getUint16(cursor + 32, true) !== 0 ||
      v.getUint32(cursor + 20, true) !== size ||
      offset + 30 + len + size > centralStart
    )
      throw new Error('Небезопасная или неподдержанная запись ZIP.');
    if (
      v.getUint32(offset, true) !== 0x04034b50 ||
      v.getUint16(offset + 6, true) !== 0x800 ||
      v.getUint16(offset + 8, true) !== 0 ||
      v.getUint16(offset + 26, true) !== len ||
      v.getUint16(offset + 28, true) !== 0 ||
      v.getUint32(offset + 18, true) !== size ||
      v.getUint32(offset + 22, true) !== size ||
      v.getUint32(offset + 14, true) !== crc ||
      decoder.decode(bytes.subarray(offset + 30, offset + 30 + len)) !== name
    )
      throw new Error('Несогласованные заголовки ZIP.');
    const data = bytes.subarray(offset + 30 + len, offset + 30 + len + size);
    if (crc32(data) !== crc) throw new Error('ZIP: CRC не совпадает.');
    files[name] = decoder.decode(data);
    cursor += 46 + len;
    expectedOffset = offset + 30 + len + size;
  }
  if (cursor !== end || expectedOffset !== centralStart)
    throw new Error('Лишние данные в ZIP.');
  return files;
}

export async function verifyArchiveFiles(files: Record<string, string>) {
  if (
    files['bagit.txt'] !==
    'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n'
  )
    throw new Error('Неверный BagIt.');
  for (const name of ['manifest-sha256.txt', 'tagmanifest-sha256.txt']) {
    const seen = new Set<string>();
    for (const line of (files[name] ?? '').trim().split('\n')) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      if (
        !match ||
        seen.has(match[2]) ||
        !Object.hasOwn(files, match[2]) ||
        (await sha256Text(files[match[2]])) !== match[1]
      )
        throw new Error(`Контрольная сумма или манифест: ${line}`);
      seen.add(match[2]);
    }
    const expected = Object.keys(files).filter((p) =>
      name === 'manifest-sha256.txt'
        ? p.startsWith('data/')
        : !p.startsWith('data/') && p !== 'tagmanifest-sha256.txt',
    );
    if (seen.size !== expected.length || expected.some((p) => !seen.has(p)))
      throw new Error('Неполный манифест.');
  }
  if (files['data/incident/metadata.json']) {
    const metadata = JSON.parse(files['data/incident/metadata.json']);
    if (metadata.replayEngine !== MISSION_ENGINE_VERSION)
      throw new Error(
        `Для воспроизведения нужен релиз ${metadata.replayEngine}. Целостность ZIP проверена.`,
      );
    const rebuilt = await buildIncidentArchive(
      JSON.parse(files['data/incident/operation.json']),
      JSON.parse(files['data/incident/other-operations.json']),
      JSON.parse(files['data/runtime.json']),
    );
    if (
      Object.keys(files).length !== Object.keys(rebuilt.files).length ||
      Object.entries(rebuilt.files).some(([p, t]) => files[p] !== t)
    )
      throw new Error('Диагностика события не совпадает с повторным расчётом.');
    if (Object.values(metadata.binding).some((v) => v !== true))
      throw new Error('Снимок события содержит нарушенные исходные хеши.');
    return {
      status: 'incident-diagnostic-reproduced',
      flightReady: false,
      stage: JSON.parse(files['data/incident/operation.json']).safety.stage,
      sameEngine: metadata.sameEngine,
      files: Object.keys(files).length,
    };
  }
  const document = JSON.parse(
      files['data/input/mission.json'],
    ) as MissionDocument,
    candidate = JSON.parse(
      files['data/plan/candidate.json'],
    ) as MissionCandidate;
  if (
    document.obstacleLayer &&
    files['data/sources/obstacles.kml'] !== document.obstacleLayer.sourceText
  )
    throw new Error('Источник KML подменён.');
  for (const [path, text] of Object.entries(await catalogEvidence(document)))
    if (files[path] !== text)
      throw new Error(`Каталог или правила зон подменены: ${path}.`);
  const checks = await validateExportedCandidate(document, candidate);
  if (files['data/diagnostic.json']) {
    const rebuilt = await buildMissionDiagnosticArchive(document, candidate);
    if (
      Object.keys(files).length !== Object.keys(rebuilt.files).length ||
      Object.entries(rebuilt.files).some(([p, t]) => files[p] !== t)
    )
      throw new Error('Диагностика не совпадает с повторной проверкой.');
    return {
      status: 'diagnostic-only-not-flight-approved',
      flightReady: false,
      checks,
      files: Object.keys(files).length,
    };
  }
  if (checks.some((c) => c.status === 'fail'))
    throw new Error(
      `Маршрут отвергнут: ${checks
        .filter((c) => c.status === 'fail')
        .map((c) => c.id)
        .join(', ')}`,
    );
  // Regenerate every report and route: recalculating manifests alone cannot forge evidence.
  const run = files['data/run/report.json']
    ? JSON.parse(files['data/run/report.json'])
    : undefined;
  const rebuilt = await buildMissionArchive(
    document,
    candidate,
    run?.operation,
    run?.revisionHistory ?? [],
  );
  for (const [p, t] of Object.entries(rebuilt.files))
    if (p.startsWith('data/') && files[p] !== t)
      throw new Error(`Содержимое не совпадает с повторной проверкой: ${p}`);
  if (
    Object.keys(files).filter((p) => p.startsWith('data/')).length !==
    Object.keys(rebuilt.files).filter((p) => p.startsWith('data/')).length
  )
    throw new Error('Лишние файлы доказательств.');
  return {
    status: 'passes-declared-model',
    flightReady: false,
    checks,
    files: Object.keys(files).length,
  };
}
