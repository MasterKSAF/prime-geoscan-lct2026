import {
  sha256Text,
  type MissionDocument,
  type MissionCandidate,
} from './mission-schema.ts';
import { missionGeoJSON, missionKML } from './mission-export.ts';
import { validateExportedCandidate } from './mission-validation.ts';
import {
  missionRunReport,
  missionRunReportHtml,
} from './mission-run-export.ts';
import type { MissionOperation } from './mission-operations.ts';
import { parseObstacleKml, relevantObstacles } from './obstacle-layer.ts';

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
      JSON.stringify(report.operation.document) !== JSON.stringify(document))
  )
    throw new Error('Запуск относится к другой версии миссии.');
  const files: Record<string, string> = {
    'bagit.txt': 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n',
    'bag-info.txt': `Bagging-Date: ${new Date().toISOString().slice(0, 10)}\nExternal-Identifier: ${operation?.id ?? document.id}\nExternal-Description: PRIME model evidence, not flight telemetry\n`,
    'data/README.md':
      '# Доказательства модельной миссии\n\nОткройте report.html. Проверка из корня проекта: `node --experimental-transform-types scripts/verify-mission-archive.ts <archive.zip>`. Хеши не являются электронной подписью. Реальные БВС не подключены. Высоты KML находятся в ExtendedData; линия — проекция, не фиктивный AMSL.\n',
    'data/input/mission.json': json(document),
    'data/plan/candidate.json': json(candidate),
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
      budgetMs: document.planning.maxComputeMs,
      method: 'verify-saved-candidate',
      flightReady: false,
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
  const checks = await validateExportedCandidate(document, candidate);
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
