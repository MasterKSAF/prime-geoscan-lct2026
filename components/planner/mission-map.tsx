'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Coordinate, Plan, Scenario } from '@/lib/planner/schema';
import 'leaflet/dist/leaflet.css';

export const flightColors = [
  '#1c73d4',
  '#dd8740',
  '#9370d7',
  '#299d83',
  '#bf6083',
  '#5e94a1',
  '#878e35',
  '#9d7872',
];
export type DrawMode =
  | 'area'
  | 'exclusion'
  | 'airspace'
  | 'start'
  | 'landing'
  | 'reserve'
  | null;
type Props = {
  scenario: Scenario;
  plan: Plan | null;
  time: number;
  selected: string;
  draft: Coordinate[];
  mode: DrawMode;
  onPoint: (p: Coordinate) => void;
  fit: number;
  showTiles: boolean;
  showTransit: boolean;
};
export default function MissionMap(props: Props) {
  const root = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    lib = useRef<typeof Leaflet | null>(null),
    layers = useRef<Leaflet.LayerGroup | null>(null),
    markers = useRef<Leaflet.LayerGroup | null>(null),
    tile = useRef<Leaflet.TileLayer | null>(null),
    draftLayer = useRef<Leaflet.LayerGroup | null>(null);
  const callback = useRef(props.onPoint);
  const fitApplied = useRef<number | null>(null);
  useEffect(() => {
    callback.current = props.onPoint;
  }, [props.onPoint]);
  const [ready, setReady] = useState(false),
    [tileError, setTileError] = useState(false),
    [mapError, setMapError] = useState(false);
  useEffect(() => {
    let alive = true;
    import('leaflet')
      .then((L) => {
        if (!alive || !root.current) return;
        lib.current = L;
        const m = L.map(root.current, {
          zoomControl: false,
          preferCanvas: true,
          attributionControl: true,
        }).setView([60.036, 30.3], 14);
        // Keep library and map-provider credits without Leaflet's decorative flag.
        m.attributionControl.setPrefix(
          '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>',
        );
        map.current = m;
        tile.current = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        );
        tile.current.on('tileerror', () => setTileError(true));
        tile.current.on('tileload', () => setTileError(false));
        layers.current = L.layerGroup().addTo(m);
        markers.current = L.layerGroup().addTo(m);
        draftLayer.current = L.layerGroup().addTo(m);
        L.control.zoom({ position: 'bottomright' }).addTo(m);
        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
        m.on('click', (e) => callback.current([e.latlng.lng, e.latlng.lat]));
        const resize = new ResizeObserver(() => m.invalidateSize());
        resize.observe(root.current);
        m.on('unload', () => resize.disconnect());
        setReady(true);
      })
      .catch(() => {
        if (alive) setMapError(true);
      });
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !tile.current) return;
    if (props.showTiles) tile.current.addTo(map.current);
    else tile.current.remove();
  }, [ready, props.showTiles]);
  useEffect(() => {
    const L = lib.current,
      m = map.current;
    if (!ready || !L || !m || fitApplied.current === props.fit) return;
    m.fitBounds(
      L.latLngBounds(
        props.scenario.area.coordinates[0].map(
          (p) => [p[1], p[0]] as [number, number],
        ),
      ),
      { padding: [65, 65], animate: false },
    );
    // Fit only on explicit action or loaded project, not on every parameter change.
    fitApplied.current = props.fit;
  }, [ready, props.fit, props.scenario.area]);
  useEffect(() => {
    const L = lib.current,
      layer = layers.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    const lat = (p: Coordinate): [number, number] => [p[1], p[0]];
    const label = (text: string) => {
      const el = document.createElement('span');
      el.textContent = text;
      return el;
    };
    L.polygon(
      props.scenario.airspace.coordinates.map((r) => r.map(lat)),
      {
        color: '#759280',
        weight: 1.5,
        dashArray: '5 6',
        fillOpacity: 0.035,
        interactive: false,
      },
    ).addTo(layer);
    L.polygon(
      props.scenario.area.coordinates.map((r) => r.map(lat)),
      {
        color: '#265d74',
        weight: 2,
        fillColor: '#aed7dd',
        fillOpacity: 0.2,
        interactive: false,
      },
    ).addTo(layer);
    props.scenario.exclusions.forEach((p) =>
      L.polygon(
        p.coordinates.map((r) => r.map(lat)),
        {
          color: '#bc5353',
          weight: 1.7,
          fillColor: '#cf6565',
          fillOpacity: 0.18,
          interactive: false,
        },
      ).addTo(layer),
    );
    props.scenario.reserveSites.forEach((p, i) =>
      L.circleMarker(lat(p), {
        radius: 7,
        color: '#8d7735',
        fillColor: '#fff',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(
          label(`Резервная площадка ${i + 1} · достижимость не проверена`),
        )
        .addTo(layer),
    );
    props.scenario.vehicles.forEach((v, i) => {
      if (!v.enabled) return;
      L.circleMarker(lat(v.start), {
        radius: 6,
        color: flightColors[i % flightColors.length],
        fillColor: '#fff',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(label(`Старт ${v.name}`))
        .addTo(layer);
      if (v.start.join() !== v.landing.join())
        L.circleMarker(lat(v.landing), {
          radius: 6,
          color: flightColors[i % flightColors.length],
          fillColor: flightColors[i % flightColors.length],
          fillOpacity: 0.6,
          weight: 2,
        })
          .bindTooltip(label(`Посадка ${v.name}`))
          .addTo(layer);
    });
    props.plan?.missions.forEach((m) => {
      const index = props.scenario.vehicles.findIndex(
          (v) => v.id === m.vehicleId,
        ),
        color = flightColors[index % flightColors.length];
      m.segments.forEach((s) => {
        if (s.distanceM < 0.1 || (!props.showTransit && s.phase !== 'survey'))
          return;
        L.polyline([lat(s.from), lat(s.to)], {
          color,
          weight: props.selected === m.vehicleId ? 2.8 : 1.7,
          opacity: s.phase === 'survey' ? 0.95 : 0.65,
          dashArray: s.phase === 'survey' ? undefined : '4 6',
          interactive: false,
        }).addTo(layer);
      });
    });
  }, [ready, props.scenario, props.plan, props.selected, props.showTransit]);
  useEffect(() => {
    const L = lib.current,
      layer = markers.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    props.plan?.missions.forEach((m) => {
      const s =
        m.segments.find(
          (s) => props.time >= s.startSec && props.time < s.endSec,
        ) ?? (props.time >= m.durationSec ? m.segments.at(-1) : m.segments[0]);
      if (!s) return;
      const t = Math.min(
        1,
        Math.max(
          0,
          (props.time - s.startSec) / Math.max(1e-6, s.endSec - s.startSec),
        ),
      );
      const p: [number, number] = [
        s.from[1] + (s.to[1] - s.from[1]) * t,
        s.from[0] + (s.to[0] - s.from[0]) * t,
      ];
      const color =
        flightColors[
          props.scenario.vehicles.findIndex((v) => v.id === m.vehicleId) %
            flightColors.length
        ];
      L.circleMarker(p, {
        radius: 10,
        color: '#fff',
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
        interactive: false,
      }).addTo(layer);
      L.circleMarker(p, {
        radius: 16,
        color,
        weight: 1,
        fillOpacity: 0,
        opacity: 0.35,
        interactive: false,
      }).addTo(layer);
    });
  }, [ready, props.plan, props.time, props.scenario.vehicles]);
  useEffect(() => {
    const L = lib.current,
      layer = draftLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    if (props.draft.length)
      L.polyline(
        props.draft.map((p) => [p[1], p[0]] as [number, number]),
        {
          color: props.mode === 'exclusion' ? '#cf5858' : '#156e98',
          dashArray: '5 5',
          weight: 3,
        },
      ).addTo(layer);
    props.draft.forEach((p) =>
      L.circleMarker([p[1], p[0]], {
        radius: 5,
        color: '#196fa4',
        fillOpacity: 1,
      }).addTo(layer),
    );
  }, [ready, props.draft, props.mode]);
  return (
    <>
      <div
        className={`mission-map ${props.mode ? 'drawing' : ''}`}
        ref={root}
        aria-label="Карта полётного задания"
      />
      {tileError && props.showTiles && (
        <div className="map-network">
          Подложка недоступна. Геометрия и расчёт продолжают работать.
        </div>
      )}
      {mapError && (
        <div className="map-network">
          Карта не загрузилась. Сохраните задание и перезагрузите страницу.
        </div>
      )}
    </>
  );
}
