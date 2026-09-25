/** Read-only compatibility audit. Never changes planner inputs or application state. */
import { readFile } from 'node:fs/promises';
import { DOMParser } from '@xmldom/xmldom';
import { parseObstacleKml } from '../../lib/planner/obstacle-layer.ts';
import { importGeometryText } from '../../lib/planner/mission-io.ts';

const folder = 'output/geoscan-new-materials-20260923/';
const result = [];
const count = (items: string[]) => Object.fromEntries([...new Set(items)].sort().map(x => [x, items.filter(y => y === x).length]));
for (const filename of ['moscow-obstacles.kml', 'flight-boundaries.kml', 'moscow-zone.kml']) {
  const text = await readFile(folder + filename, 'utf8');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw Error('Unsafe XML declaration');
  const xmlErrors: string[] = [];
  const xml = new DOMParser({ onError: (level, message) => xmlErrors.push(`${level}: ${message}`) }).parseFromString(text, 'application/xml');
  const elements = Array.from(xml.getElementsByTagName('*'));
  const named = (name: string) => elements.filter(e => e.localName === name);
  const direct = (node: typeof elements[number], name: string) => Array.from(node.childNodes).find(n => n.nodeType === 1 && (n as typeof node).localName === name)?.textContent?.trim() ?? '';
  const placemarks = named('Placemark');
  const coords = named('coordinates').map(e => (e.textContent ?? '').trim().split(/\s+/).filter(Boolean).map(token => token.split(',').map(Number)));
  const allCoords = coords.flat();
  const validXY = allCoords.filter(c => c.length >= 2 && c.every(Number.isFinite));
  const geometries = elements.filter(e => ['Polygon', 'LineString', 'Point'].includes(e.localName ?? ''));
  const fields = elements.filter(e => ['Data', 'SimpleData'].includes(e.localName ?? ''));
  const field = (name: string) => fields.filter(e => e.getAttribute('name') === name).map(e => e.textContent?.trim() ?? '');
  let obstacleImport: unknown;
  if (filename === 'moscow-obstacles.kml') {
    try {
      const c = parseObstacleKml(text);
      obstacleImport = { total: c.total, accepted: c.accepted, repaired: c.repaired, rejected: c.rejected, errors: count(c.objects.filter(o => o.status === 'rejected').map(o => o.error ?? '')), geometryErrorExamples: c.objects.filter(o => o.status === 'rejected' && o.error !== 'Неизвестная система высот.').slice(0,18).map(o => { const pm = placemarks.find(p => p.getAttribute('id') === o.sourceId); return { id: o.sourceId, name: o.name, error: o.error, raw: pm ? Array.from(pm.getElementsByTagNameNS('*','coordinates')).map(e => e.textContent?.slice(0,600)) : null }; }) };
    } catch (e) { obstacleImport = { error: String(e) }; }
  }
  let geometryImport: unknown;
  try { const value = importGeometryText(text, 'kml', 'area'); geometryImport = { accepted: true, features: value.features.length }; }
  catch (e) { geometryImport = { accepted: false, error: String(e) }; }
  const altitudes = [...new Set(field('Altitudes'))];
  result.push({
    filename, bytes: Buffer.byteLength(text), xmlErrors,
    tags: Object.fromEntries(['Placemark','Polygon','LineString','Point','MultiGeometry','innerBoundaryIs','TimeSpan','TimeStamp','NetworkLink'].map(n => [n,named(n).length])),
    coordinateTuples: allCoords.length,
    boundsOfValidXY: [Math.min(...validXY.map(c=>c[0])), Math.min(...validXY.map(c=>c[1])), Math.max(...validXY.map(c=>c[0])), Math.max(...validXY.map(c=>c[1]))],
    altitudeModes: count(geometries.map(g => direct(g,'altitudeMode') || '(default clampToGround)')),
    extrude: count(geometries.map(g => direct(g,'extrude') || '0')),
    coordinateDimensions: count(allCoords.map(c=>String(c.length))),
    coordinateLists: { count: coords.length, maxLength: Math.max(...coords.map(c=>c.length)), openLists: coords.filter(c=>JSON.stringify(c[0])!==JSON.stringify(c.at(-1))).length },
    fieldNames: count(fields.map(e=>e.getAttribute('name') ?? '')),
    types: count(field('Type')),
    altitudeDescriptions: altitudes,
    sampleNames: placemarks.slice(0,8).map(p=>direct(p,'name')),
    sampleDescriptions: [...new Set(placemarks.map(p=>direct(p,'description')).filter(Boolean))].slice(0,12),
    obstacleImport, geometryImport,
  });
}
console.log(JSON.stringify(result, null, 2));
