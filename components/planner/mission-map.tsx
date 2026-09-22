'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Coordinate, Plan, Polygon, Scenario } from '@/lib/planner/schema';
import type { MissionRestriction } from '@/lib/planner/mission-schema';
import { ellipseDrawing } from '@/lib/planner/territory-editing';
import {
  vehicleDisplayName,
  vehicleMapLabel,
} from '@/lib/planner/mission-vehicle-label';
import 'leaflet/dist/leaflet.css';

export const flightColors = [
  '#1c73d4',
  '#dd8740',
  '#9370d7',
  '#299d83',
  '#7368c5',
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
  bases?: { id: string; name: string; coordinate: Coordinate }[];
  plan: Plan | null;
  time: number;
  selected: string;
  draft: Coordinate[];
  mode: DrawMode;
  onPoint: (p: Coordinate) => void;
  fit: number;
  showTiles: boolean;
  showTransit: boolean;
  workAreas?: { id: string; name: string; area: Polygon }[];
  activeJobId?: string;
  restrictions?: MissionRestriction[];
  missionStartAt?: string;
  execution?: boolean;
  playing?: boolean;
  onSelectVehicle?: (id: string) => void;
  onSelectArea?: (id: string) => void;
  editable?: boolean;
  drawTool?: 'polygon' | 'freehand' | 'circle' | 'ellipse';
  onStroke?: (points: Coordinate[]) => void;
  onVertex?: (ring: number, vertex: number, point: Coordinate) => boolean;
};
const coordinateText = (point: Coordinate) =>
  `${Math.abs(point[1]).toFixed(6)}° ${point[1] < 0 ? 'S' : 'N'} · ${Math.abs(point[0]).toFixed(6)}° ${point[0] < 0 ? 'W' : 'E'}`;
export default function MissionMap(props: Props) {
  const root = useRef<HTMLElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    lib = useRef<typeof Leaflet | null>(null),
    layers = useRef<Leaflet.LayerGroup | null>(null),
    markers = useRef<Leaflet.LayerGroup | null>(null),
    tile = useRef<Leaflet.TileLayer | null>(null),
    draftLayer = useRef<Leaflet.LayerGroup | null>(null);
  const callback = useRef(props.onPoint);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const selectionCallback = useRef(props.onSelectVehicle);
  const movingMarkers = useRef(
    new Map<
      string,
      {
        marker: Leaflet.Marker;
        button: HTMLButtonElement;
        heading: HTMLSpanElement;
        label: HTMLSpanElement;
        symbol: HTMLSpanElement;
      }
    >(),
  );
  const fitApplied = useRef<number | null>(null);
  const pendingFit = useRef<(() => void) | null>(null);
  const missionTime = props.missionStartAt
    ? Date.parse(props.missionStartAt) + props.time * 1000
    : Number.NaN;
  const hasMissionTime = Number.isFinite(missionTime);
  const activeRestrictionIds = (props.restrictions ?? [])
    .filter(
      (restriction) =>
        !restriction.startAt ||
        (hasMissionTime &&
          missionTime >= Date.parse(restriction.startAt) &&
          missionTime < Date.parse(restriction.endAt!)),
    )
    .map((restriction) => restriction.id)
    .join('|');
  useEffect(() => {
    callback.current = props.onPoint;
  }, [props.onPoint]);
  useEffect(() => {
    selectionCallback.current = props.onSelectVehicle;
  }, [props.onSelectVehicle]);
  const [ready, setReady] = useState(0),
    [attempt, setAttempt] = useState(0),
    [tileError, setTileError] = useState(false),
    [mapError, setMapError] = useState(false),
    [cursor, setCursor] = useState<Coordinate | null>(null),
    [clicked, setClicked] = useState<Coordinate | null>(null);
  useEffect(() => {
    let alive = true;
    let instance: Leaflet.Map | null = null;
    let resize: ResizeObserver | null = null;
    let canvas: HTMLDivElement | null = null;
    let resizeFrame = 0;
    let cursorFrame = 0;
    let cursorPoint: Coordinate | null = null;
    const failedTiles = new Set<HTMLElement>();
    const dispose = () => {
      resize?.disconnect();
      resize = null;
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(cursorFrame);
      tile.current?.off();
      try {
        if (instance) {
          instance.off();
          instance.remove();
        }
      } catch {
        // A partially initialized Leaflet instance may not support remove yet.
        // Its private host is discarded below so a retry never reuses it.
      }
      instance = null;
      canvas?.remove();
      canvas = null;
      map.current = null;
      lib.current = null;
      layers.current = null;
      markers.current = null;
      draftLayer.current = null;
      tile.current = null;
      fitApplied.current = null;
      pendingFit.current = null;
      movingMarkers.current.clear();
    };
    import('leaflet')
      .then((L) => {
        if (!alive || !root.current) return;
        // React owns the stable outer wrapper only. Leaflet owns this fresh host,
        // including its className and descendants; rerenders cannot erase them.
        canvas = document.createElement('div');
        canvas.className = 'mission-map-canvas';
        Object.assign(canvas.style, { position: 'absolute', inset: '0' });
        root.current.appendChild(canvas);
        lib.current = L;
        const m = L.map(canvas, {
          zoomControl: false,
          preferCanvas: true,
          attributionControl: true,
        });
        instance = m;
        map.current = m;
        m.setView([60.036, 30.3], 14);
        // Keep library and map-provider credits without Leaflet's decorative flag.
        m.attributionControl.setPrefix(
          '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>',
        );
        tile.current = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        );
        tile.current.on('tileerror', (event: Leaflet.TileErrorEvent) => {
          failedTiles.add(event.tile);
          if (alive) setTileError(failedTiles.size > 0);
        });
        // A single successful tile must not hide failure of another visible tile.
        const clearTileFailure = (event: Leaflet.TileEvent) => {
          failedTiles.delete(event.tile);
          if (alive) setTileError(failedTiles.size > 0);
        };
        tile.current.on('tileload', clearTileFailure);
        tile.current.on('tileunload', clearTileFailure);
        layers.current = L.layerGroup().addTo(m);
        markers.current = L.layerGroup().addTo(m);
        draftLayer.current = L.layerGroup().addTo(m);
        L.control.zoom({ position: 'bottomright' }).addTo(m);
        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
        m.on('click', (e: Leaflet.LeafletMouseEvent) => {
          let point: Coordinate = [e.latlng.lng, e.latlng.lat];
          const current = latest.current;
          if (
            current.mode &&
            current.draft.length >= 3 &&
            m.latLngToContainerPoint
          ) {
            const first = current.draft[0];
            if (
              m
                .latLngToContainerPoint([first[1], first[0]])
                .distanceTo(m.latLngToContainerPoint(e.latlng)) < 14
            )
              point = first;
          }
          setClicked(point);
          callback.current(point);
        });
        m.on('mousemove', (e: Leaflet.LeafletMouseEvent) => {
          cursorPoint = [e.latlng.lng, e.latlng.lat];
          if (!cursorFrame)
            cursorFrame = requestAnimationFrame(() => {
              cursorFrame = 0;
              if (alive) setCursor(cursorPoint);
            });
        });
        m.on('mouseout', () => {
          cancelAnimationFrame(cursorFrame);
          cursorFrame = 0;
          cursorPoint = null;
          setCursor(null);
        });
        const invalidate = () => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            if (alive && canvas?.clientWidth && canvas.clientHeight) {
              // Preserve the geographic center as the responsive viewport changes.
              m.invalidateSize({ pan: true, animate: false });
              pendingFit.current?.();
            }
          });
        };
        resize = new ResizeObserver(invalidate);
        resize.observe(canvas);
        invalidate();
        setMapError(false);
        setReady(attempt + 1);
      })
      .catch(() => {
        if (alive) {
          dispose();
          setReady(0);
          setMapError(true);
        }
      });
    return () => {
      alive = false;
      dispose();
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready || !map.current || !tile.current) return;
    if (props.showTiles) tile.current.addTo(map.current);
    else tile.current.remove();
  }, [ready, props.showTiles]);
  useEffect(() => {
    const L = lib.current,
      m = map.current,
      host = root.current;
    if (
      !ready ||
      !L ||
      !m ||
      !host ||
      !props.mode ||
      !props.drawTool ||
      props.drawTool === 'polygon' ||
      ['start', 'landing', 'reserve'].includes(props.mode)
    )
      return;
    const overlay = document.createElement('div');
    overlay.className = 'mission-drawing-surface';
    overlay.setAttribute('aria-label', 'Рисование территории мышью');
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '600',
      touchAction: 'none',
      cursor: 'crosshair',
    });
    host.appendChild(overlay);
    const sketch = L.layerGroup().addTo(m);
    let points: Coordinate[] = [],
      lastX = 0,
      lastY = 0,
      pointer: number | null = null;
    const point = (e: PointerEvent): Coordinate => {
      const p = m.mouseEventToLatLng(e);
      return [p.lng, p.lat];
    };
    const preview = () => {
      sketch.clearLayers();
      let outline = points;
      if (props.drawTool === 'circle' || props.drawTool === 'ellipse') {
        try {
          outline = ellipseDrawing(
            points[0],
            points.at(-1)!,
            props.drawTool === 'circle',
          );
          outline.push(outline[0]);
        } catch {
          return;
        }
      }
      L.polyline(
        outline.map((p) => [p[1], p[0]] as [number, number]),
        { color: '#218ab1', weight: 3, interactive: false },
      ).addTo(sketch);
    };
    overlay.onpointerdown = (e) => {
      if (e.button !== 0 || pointer !== null) return;
      e.preventDefault();
      e.stopPropagation();
      pointer = e.pointerId;
      overlay.setPointerCapture(pointer);
      points = [point(e)];
      lastX = e.clientX;
      lastY = e.clientY;
    };
    overlay.onpointermove = (e) => {
      if (
        pointer !== e.pointerId ||
        Math.hypot(e.clientX - lastX, e.clientY - lastY) < 3
      )
        return;
      if (points.length >= 3000) return;
      points.push(point(e));
      lastX = e.clientX;
      lastY = e.clientY;
      preview();
    };
    overlay.onpointerup = (e) => {
      if (pointer !== e.pointerId) return;
      points.push(point(e));
      pointer = null;
      overlay.releasePointerCapture(e.pointerId);
      sketch.clearLayers();
      latest.current.onStroke?.(points);
    };
    overlay.onpointercancel = () => {
      pointer = null;
      points = [];
      sketch.clearLayers();
    };
    return () => {
      overlay.remove();
      sketch.remove();
    };
  }, [ready, props.mode, props.drawTool]);
  const editableArea = props.workAreas?.find(
    (a) => a.id === props.activeJobId,
  )?.area;
  useEffect(() => {
    const L = lib.current,
      m = map.current;
    if (!ready || !L || !m || !props.editable || props.mode || !editableArea)
      return;
    const editLayer = L.layerGroup().addTo(m);
    editableArea.coordinates.forEach((ring, ringIndex) =>
      ring.slice(0, -1).forEach((p, vertex) => {
        const marker = L.marker([p[1], p[0]], {
          draggable: true,
          autoPan: true,
          icon: L.divIcon({
            className: 'mission-area-vertex',
            html: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          title: `${ringIndex ? 'Отверстие' : 'Контур'} · вершина ${vertex + 1}`,
        }).addTo(editLayer);
        marker.on('dragend', () => {
          const position = marker.getLatLng();
          if (
            !latest.current.onVertex?.(ringIndex, vertex, [
              position.lng,
              position.lat,
            ])
          )
            marker.setLatLng([p[1], p[0]]);
        });
      }),
    );
    return () => {
      editLayer.remove();
    };
  }, [ready, editableArea, props.editable, props.mode]);
  useEffect(() => {
    const L = lib.current,
      m = map.current;
    if (!ready || !L || !m || fitApplied.current === props.fit) return;
    const coordinates = (props.workAreas ?? [{ area: props.scenario.area }])
      .flatMap((area) => area.area.coordinates[0])
      .concat(
        props.scenario.vehicles
          .filter((vehicle) => vehicle.enabled)
          .flatMap((vehicle) => [vehicle.start, vehicle.landing]),
        (props.plan?.missions ?? []).flatMap((mission) =>
          mission.segments.flatMap((segment) => [segment.from, segment.to]),
        ),
      );
    const applyFit = () => {
      const container = m.getContainer();
      if (
        !container.clientWidth ||
        !container.clientHeight ||
        map.current !== m
      )
        return;
      // ResizeObserver runs on a later frame. Fit must not use Leaflet's stale
      // cached size if the panel changed dimensions in this same render.
      m.invalidateSize({ pan: true, animate: false });
      m.fitBounds(
        L.latLngBounds(
          coordinates.map((p) => [p[1], p[0]] as [number, number]),
        ),
        { padding: [65, 65], animate: false, maxZoom: 18 },
      );
      // Fit only on explicit action or loaded project, not on parameter changes.
      fitApplied.current = props.fit;
      pendingFit.current = null;
    };
    // A hidden panel has no usable viewport. Preserve the request until resize
    // supplies real dimensions, instead of calculating invalid fit bounds.
    pendingFit.current = applyFit;
    applyFit();
  }, [
    ready,
    props.fit,
    props.scenario.area,
    props.scenario.vehicles,
    props.workAreas,
    props.plan,
  ]);
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
    const areas = props.workAreas ?? [
      { id: 'current', name: 'Область работы', area: props.scenario.area },
    ];
    areas.forEach((area, index) => {
      const active = !props.activeJobId || props.activeJobId === area.id;
      const outline = L.polygon(
        area.area.coordinates.map((ring) => ring.map(lat)),
        {
          color: props.workAreas
            ? flightColors[index % flightColors.length]
            : '#265d74',
          weight: active ? 2.5 : 1.5,
          fillOpacity: active ? 0.17 : 0.07,
        },
      )
        .bindTooltip(
          label(
            `Работа ${index + 1}: ${area.name} · ${area.area.coordinates.length - 1} отверстий`,
          ),
          { sticky: true, className: 'mission-map-feature-tooltip' },
        )
        .addTo(layer);
      outline.on?.('click', (e: Leaflet.LeafletMouseEvent) => {
        if (!latest.current.editable || latest.current.mode) return;
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        latest.current.onSelectArea?.(area.id);
      });
    });
    props.scenario.exclusions.forEach((p, index) => {
      // The legacy scene may already include projections of active volumes.
      // When detailed metadata is supplied, draw that volume once, below.
      if (
        props.restrictions?.some(
          (r) => JSON.stringify(r.geometry) === JSON.stringify(p),
        )
      )
        return;
      L.polygon(
        p.coordinates.map((r) => r.map(lat)),
        {
          color: '#92721e',
          weight: 1.7,
          fillColor: '#d7ae42',
          fillOpacity: 0.18,
        },
      )
        .bindTooltip(label(`Постоянный запрет ${index + 1}`), { sticky: true })
        .addTo(layer);
    });
    props.restrictions?.forEach((restriction) => {
      const active = activeRestrictionIds.split('|').includes(restriction.id);
      const timing = !restriction.startAt
        ? 'постоянно'
        : hasMissionTime
          ? active
            ? 'активно в модельное время'
            : 'неактивно в модельное время'
          : 'активность по времени не определена';
      L.polygon(
        restriction.geometry.coordinates.map((ring) => ring.map(lat)),
        {
          color: restriction.kind === 'obstacle' ? '#b37925' : '#92721e',
          weight: active ? 2 : 1,
          fillOpacity: active ? 0.18 : 0.025,
          dashArray: active ? undefined : '4 5',
        },
      )
        .bindTooltip(
          label(
            `${restriction.kind === 'obstacle' ? 'Препятствие' : 'Запрет'}: ${restriction.name} · ${restriction.minAltitudeM}…${restriction.maxAltitudeM ?? '∞'} м, общий локальный уровень миссии · ${timing}. ${restriction.startAt ? `${restriction.startAt} — ${restriction.endAt}. ` : ''}Источник: ${restriction.source}`,
          ),
          { sticky: true, className: 'mission-map-feature-tooltip' },
        )
        .addTo(layer);
    });
    props.scenario.reserveSites.forEach((p, i) =>
      L.circleMarker(lat(p), {
        radius: 7,
        color: '#8d7735',
        fillColor: '#fff',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(
          label(
            `Резервная площадка ${i + 1} · ${coordinateText(p)} · достижимость не проверена`,
          ),
        )
        .addTo(layer),
    );
    const basePoints = [
      ...new Map(
        props.scenario.vehicles
          .flatMap((v) => [v.start, v.landing])
          .map((point) => [point.join(','), point]),
      ).values(),
    ];
    basePoints.forEach((point, index) => {
      const baseName =
        props.bases?.find((b) => b.coordinate.join(',') === point.join(','))
          ?.name ?? `База ${index + 1}`;
      const occupants = props.scenario.vehicles
        .filter(
          (v) =>
            v.start.join(',') === point.join(',') ||
            v.landing.join(',') === point.join(','),
        )
        .map(vehicleDisplayName)
        .join(', ');
      L.circleMarker(lat(point), {
        radius: 7,
        weight: 2,
        color: flightColors[index % flightColors.length],
        fillColor: '#fff',
        fillOpacity: 1,
      })
        .bindTooltip(label(baseName), {
          permanent: true,
          direction: 'bottom',
          className: 'mission-base-label',
        })
        .bindPopup(
          label(`${baseName} · ${coordinateText(point)} · ${occupants}`),
        )
        .addTo(layer);
    });
    props.scenario.vehicles.forEach((v, i) => {
      if (!v.enabled) return;
      L.circleMarker(lat(v.start), {
        radius: 6,
        color: flightColors[i % flightColors.length],
        fillColor: '#fff',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(
          label(`Старт ${vehicleDisplayName(v)} · ${coordinateText(v.start)}`),
        )
        .addTo(layer);
      if (v.start.join() !== v.landing.join())
        L.circleMarker(lat(v.landing), {
          radius: 6,
          color: flightColors[i % flightColors.length],
          fillColor: flightColors[i % flightColors.length],
          fillOpacity: 0.6,
          weight: 2,
        })
          .bindTooltip(
            label(
              `Посадка ${vehicleDisplayName(v)} · ${coordinateText(v.landing)}`,
            ),
          )
          .addTo(layer);
    });
    props.plan?.missions.forEach((m) => {
      const index = props.scenario.vehicles.findIndex(
          (v) => v.id === m.vehicleId,
        ),
        color = flightColors[Math.max(0, index) % flightColors.length];
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
  }, [
    ready,
    props.scenario,
    props.bases,
    props.plan,
    props.selected,
    props.showTransit,
    props.workAreas,
    props.activeJobId,
    props.restrictions,
    activeRestrictionIds,
    hasMissionTime,
  ]);
  useEffect(() => {
    const L = lib.current,
      layer = markers.current;
    if (!ready || !L || !layer) return;
    const ids = new Set(props.plan?.missions.map((m) => m.vehicleId) ?? []);
    for (const [id, item] of movingMarkers.current) {
      if (!ids.has(id)) {
        item.marker.remove();
        movingMarkers.current.delete(id);
      }
    }
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
          Math.max(
            0,
            props.scenario.vehicles.findIndex((v) => v.id === m.vehicleId),
          ) % flightColors.length
        ];
      let item = movingMarkers.current.get(m.vehicleId);
      if (!item) {
        const button = document.createElement('button');
        button.type = 'button';
        const index = props.scenario.vehicles.findIndex(
          (v) => v.id === m.vehicleId,
        );
        const vehicle = props.scenario.vehicles[index];
        const name = vehicle ? vehicleMapLabel(vehicle, index) : m.vehicleId;
        button.setAttribute('aria-label', `На карте: ${name}`);
        button.title = vehicle ? vehicleDisplayName(vehicle) : m.vehicleId;
        button.style.color = color;
        button.onclick = (e) => {
          e.stopPropagation();
          selectionCallback.current?.(m.vehicleId);
        };
        const icon = document.createElement('span');
        icon.className = 'mw-drone-symbol';
        // Fixed functional quadcopter icon; no imported text is inserted as HTML.
        icon.innerHTML =
          '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 10 22 22M22 10 10 22"/><circle cx="8" cy="8" r="5"/><circle cx="24" cy="8" r="5"/><circle cx="8" cy="24" r="5"/><circle cx="24" cy="24" r="5"/><rect x="12" y="12" width="8" height="8" rx="3"/></g></svg>';
        const heading = document.createElement('span');
        heading.className = 'mw-drone-heading';
        heading.textContent = '▲';
        const label = document.createElement('span');
        label.className = 'mw-drone-name';
        label.textContent = name;
        button.appendChild(icon);
        button.appendChild(heading);
        button.appendChild(label);
        const marker = L.marker(p, {
          icon: L.divIcon({
            html: button,
            className: 'mw-drone-marker',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          keyboard: false,
          zIndexOffset: 1000,
          bubblingMouseEvents: false,
        }).addTo(layer);
        item = { marker, button, heading, label, symbol: icon };
        movingMarkers.current.set(m.vehicleId, item);
      }
      item.marker.setLatLng(p);
      const currentIndex = props.scenario.vehicles.findIndex(
        (v) => v.id === m.vehicleId,
      );
      const currentVehicle = props.scenario.vehicles[currentIndex];
      const callsign = currentVehicle
        ? vehicleMapLabel(currentVehicle, currentIndex)
        : m.vehicleId;
      item.label.textContent = callsign;
      item.button.setAttribute('aria-label', `На карте: ${callsign}`);
      item.button.title = currentVehicle
        ? vehicleDisplayName(currentVehicle)
        : m.vehicleId;
      const symbolKind =
        currentVehicle?.kind === 'fixedWing' ? 'plane' : 'copter';
      if (item.symbol.dataset.kind !== symbolKind) {
        item.symbol.dataset.kind = symbolKind;
        // Static SVG only; names and imported data always use textContent.
        item.symbol.innerHTML =
          symbolKind === 'plane'
            ? '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M16 3 19 13 29 20 29 23 18 19 18 26 22 28 22 30 16 28 10 30 10 28 14 26 14 19 3 23 3 20 13 13Z" fill="currentColor"/></svg>'
            : '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 10 22 22M22 10 10 22"/><circle cx="8" cy="8" r="5"/><circle cx="24" cy="8" r="5"/><circle cx="8" cy="24" r="5"/><circle cx="24" cy="24" r="5"/><rect x="12" y="12" width="8" height="8" rx="3"/></g></svg>';
      }
      item.button.style.color = color;
      const altitude = s.altitudeFromM + (s.altitudeToM - s.altitudeFromM) * t;
      const airborne =
        props.time >= s.startSec && props.time < s.endSec && altitude > 0;
      const className = `mw-drone-button${props.selected === m.vehicleId ? ' selected' : ''}${props.execution && props.playing && airborne ? ' moving' : ''}`;
      if (item.button.className !== className)
        item.button.className = className;
      item.button.setAttribute(
        'aria-pressed',
        String(props.selected === m.vehicleId),
      );
      const bearing =
        (Math.atan2(
          (s.to[0] - s.from[0]) * Math.cos((p[0] * Math.PI) / 180),
          s.to[1] - s.from[1],
        ) *
          180) /
        Math.PI;
      item.heading.style.transform = `rotate(${bearing}deg)`;
      item.heading.style.visibility =
        airborne && s.distanceM > 0 ? 'visible' : 'hidden';
    });
  }, [
    ready,
    props.plan,
    props.time,
    props.scenario.vehicles,
    props.selected,
    props.execution,
    props.playing,
  ]);
  useEffect(() => {
    const L = lib.current,
      layer = draftLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    if (props.draft.length)
      L.polyline(
        props.draft.map((p) => [p[1], p[0]] as [number, number]),
        {
          color: props.mode === 'exclusion' ? '#92721e' : '#156e98',
          dashArray: '5 5',
          weight: 3,
        },
      ).addTo(layer);
    props.draft.forEach((p, index) => {
      const label = document.createElement('span');
      label.textContent = String(index + 1);
      L.circleMarker([p[1], p[0]], {
        radius: 5,
        color: '#196fa4',
        fillOpacity: 1,
      })
        .bindTooltip(label, {
          permanent: true,
          direction: 'top',
          className: 'mission-map-point-label',
        })
        .addTo(layer);
    });
  }, [ready, props.draft, props.mode]);
  return (
    <>
      <section
        className="mission-map"
        data-drawing={props.mode ? 'true' : 'false'}
        data-map-ready={ready ? 'true' : 'false'}
        ref={root}
        aria-label="Карта полётной миссии"
      />
      {!ready && !mapError && (
        <output className="mission-map-status">
          Инициализация карты… Геометрия миссии не изменяется.
        </output>
      )}
      {tileError && props.showTiles && (
        <output className="mission-map-status">
          Часть подложки недоступна. Контуры, точки и расчёт работают без неё.
          <button
            type="button"
            onClick={() => {
              setTileError(false);
              tile.current?.redraw();
            }}
          >
            Повторить загрузку подложки
          </button>
        </output>
      )}
      {mapError && (
        <div className="mission-map-status" role="alert">
          Не удалось открыть карту. Данные миссии не изменены.
          <button
            type="button"
            onClick={() => {
              setReady(0);
              setMapError(false);
              setTileError(false);
              setAttempt((value) => value + 1);
            }}
          >
            Повторить инициализацию карты
          </button>
        </div>
      )}
      {ready > 0 && (
        <output
          className="mission-map-coordinates"
          aria-label="Координаты карты WGS84"
          aria-live="off"
        >
          <span>
            Курсор: {cursor ? coordinateText(cursor) : 'наведите на карту'}
          </span>
          <span>
            Последний клик: {clicked ? coordinateText(clicked) : 'ещё нет'}
          </span>
          <small>WGS84 · координаты карты, не телеметрия БВС</small>
        </output>
      )}
      {props.draft.length > 0 && (
        <details className="mission-map-draft-list">
          <summary>Вершины черновика: {props.draft.length}</summary>
          <ol>
            {props.draft.map((point, index) => (
              <li key={index}>{coordinateText(point)}</li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
