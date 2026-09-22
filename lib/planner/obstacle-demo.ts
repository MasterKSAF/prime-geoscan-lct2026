import { DEMONSTRATION_SCENARIOS } from './mission-showcase.ts';
import { parseMissionDocument } from './mission-schema.ts';
import {
  parseObstacleKml,
  expandedBounds,
  boundsOverlap,
  OBSTACLE_ADAPTER,
} from './obstacle-layer.ts';
import { projection } from './geometry.ts';
import type { Coordinate, Polygon } from './schema.ts';

/** Real untouched obstacle coordinates; bases, works and permitted airspace are synthetic. */
export function createObstacleDemo(sourceText: string) {
  const catalog = parseObstacleKml(sourceText);
  const target = catalog.objects.find(
    (o) =>
      o.kind === 'Polygon' &&
      o.status !== 'rejected' &&
      o.bounds &&
      o.bounds[2] - o.bounds[0] < 0.0005 &&
      o.bounds[3] - o.bounds[1] < 0.0005 &&
      catalog.objects.filter(
        (x) =>
          x.bounds && boundsOverlap(x.bounds, expandedBounds(o.bounds!, 700)),
      ).length === 1,
  );
  if (!target?.bounds)
    throw new Error(
      'Изолированный объект для воспроизводимого примера не найден.',
    );
  const b = target.bounds,
    origin: Coordinate = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2],
    p = projection(origin);
  const rectangle = (x: number, y: number, w: number, h: number): Polygon => ({
    type: 'Polygon',
    coordinates: [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ].map((xy) => p.inverse(xy as Coordinate)),
    ],
  });
  const doc = DEMONSTRATION_SCENARIOS.find(
    (s) => s.id === 'demo-02-obstacles',
  )!.create();
  doc.id = 'demo-02-expert-obstacles';
  doc.name = 'Демо 2 · Препятствия из KML экспертов';
  doc.scenario.name = doc.name;
  doc.scenario.area = rectangle(130, -40, 160, 120);
  doc.scenario.airspace = rectangle(-280, -200, 650, 480);
  doc.scenario.vehicles.forEach((v, i) => {
    v.start = p.inverse([-170, i * 80]);
    v.landing = [...v.start];
  });
  doc.scenario.reserveSites = doc.scenario.vehicles.map((v) => v.landing);
  doc.jobs.forEach((j) => {
    j.area = structuredClone(doc.scenario.area);
    j.job.autoBearing = false;
    j.job.bearingDeg = 0;
  });
  doc.bases = doc.scenario.vehicles.map((v, i) => ({
    id: `base-${i + 1}`,
    name: `База ${i + 1}`,
    coordinate: v.start,
  }));
  doc.restrictions = [];
  doc.window.timezone = 'Asia/Vladivostok';
  doc.planning.maxComputeMs = 15000;
  doc.obstacleLayer = {
    version: OBSTACLE_ADAPTER,
    filename: 'primorsky-obstacles.kml',
    sourceText,
    bufferM: 10,
    lineHalfWidthM: 2,
    policySource:
      'Демонстрационные отступы; нормативы и точность исходника не предоставлены.',
  };
  doc.notes = `Исходные препятствия экспертов неизменны; центральный объект ${target.id} / ${target.sourceId}: ${target.name}. Базы, RGB/MS-работы, коридор, погодные условия и поверхность заданы для модельной демонстрации. Это не разрешение на реальный полёт. Полный каталог проверяется по пути; несогласованные высоты обходятся сбоку.`;
  return parseMissionDocument(doc);
}
