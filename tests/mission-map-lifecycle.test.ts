import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { demoMission } from '../lib/planner/mission-demo.ts';
import type { Coordinate, Plan } from '../lib/planner/schema.ts';
import { ellipseDrawing } from '../lib/planner/territory-editing.ts';
import * as vehicleLabels from '../lib/planner/mission-vehicle-label.ts';
import * as obstacleLayer from '../lib/planner/obstacle-layer.ts';
import * as geometry from '../lib/planner/geometry.ts';

type Props = Parameters<
  (typeof import('../components/planner/mission-map.tsx'))['default']
>[0];
type Node = { type: unknown; props: Record<string, unknown> };
type Effect = {
  dependencies: readonly unknown[];
  cleanup?: () => void;
};
class Element {
  className = '';
  style = {};
  textContent = '';
  clientWidth = 800;
  clientHeight = 600;
  children: Element[] = [];
  parent: Element | null = null;
  attributes: Record<string, string> = {};
  dataset: Record<string, string> = {};
  innerHTML = '';
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  appendChild(child: Element) {
    child.parent = this;
    this.children.push(child);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
    this.parent = null;
  }
}
class Layer {
  members = new Set<Layer>();
  handlers = new Map<string, (event: unknown) => void>();
  parent: Layer | null = null;
  tooltip = '';
  redraws = 0;
  position: unknown = null;
  constructor(
    public kind: string,
    public options?: { icon?: { html: Element } },
  ) {}
  addTo(parent: Layer) {
    parent.members.add(this);
    this.parent = parent;
    return this;
  }
  remove() {
    this.parent?.members.delete(this);
    return this;
  }
  on(event: string, callback: (event: unknown) => void) {
    this.handlers.set(event, callback);
    return this;
  }
  off() {
    this.handlers.clear();
    return this;
  }
  clearLayers() {
    this.members.clear();
    return this;
  }
  bindTooltip(element: Element) {
    this.tooltip = element.textContent;
    return this;
  }
  bindPopup(_element: Element) {
    return this;
  }
  redraw() {
    this.redraws++;
    return this;
  }
  setLatLng(position: unknown) {
    this.position = position;
    return this;
  }
}
class MapInstance extends Layer {
  removed = false;
  fits = 0;
  lastBounds: unknown;
  invalidations = 0;
  cachedSize: number[];
  fittedSize: number[] = [];
  lastInvalidation: { pan: boolean; animate: boolean } | null = null;
  attributionControl = { setPrefix() {} };
  constructor(public host: Element) {
    super('map');
    this.cachedSize = [host.clientWidth, host.clientHeight];
    host.className += ' leaflet-container leaflet-touch leaflet-grab';
  }
  setView() {
    return this;
  }
  getContainer() {
    return this.host;
  }
  fitBounds(bounds: unknown) {
    this.lastBounds = bounds;
    this.fittedSize = [...this.cachedSize];
    this.fits++;
    return this;
  }
  invalidateSize(options: { pan: boolean; animate: boolean }) {
    this.invalidations++;
    this.lastInvalidation = options;
    this.cachedSize = [this.host.clientWidth, this.host.clientHeight];
    return this;
  }
  remove() {
    this.removed = true;
    this.members.clear();
    return this;
  }
}
const code = ts.transpileModule(
  await readFile(
    new URL('../components/planner/mission-map.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

/** Executes the actual component/effects with instrumented Leaflet, without tiles or a browser. */
function harness(failInitialization = false, initiallyHidden = false) {
  const slots: unknown[] = [],
    pending: (() => void)[] = [];
  const maps: MapInstance[] = [],
    tiles: Layer[] = [];
  const frames = new Map<number, () => void>();
  const observers: { callback: () => void; disconnected: boolean }[] = [];
  let index = 0,
    dirty = false,
    tree: Node,
    frameId = 0;
  const host = new Element();
  let previousClass: unknown;
  const document = demoMission(1);
  let props: Props = {
    scenario: document.scenario,
    plan: null,
    time: 0,
    selected: document.scenario.vehicles[0].id,
    draft: [],
    mode: null,
    onPoint() {},
    fit: 1,
    showTiles: true,
    showTransit: true,
  };
  const react = {
    useRef<T>(value: T) {
      const slot = index++;
      slots[slot] ??= { current: value };
      return slots[slot];
    },
    useState<T>(value: T) {
      const slot = index++;
      slots[slot] ??= { value };
      const state = slots[slot] as { value: T };
      return [
        state.value,
        (next: T | ((previous: T) => T)) => {
          const resolved =
            typeof next === 'function'
              ? (next as (previous: T) => T)(state.value)
              : next;
          if (!Object.is(state.value, resolved)) {
            state.value = resolved;
            dirty = true;
          }
        },
      ];
    },
    useEffect(
      callback: () => void | (() => void),
      dependencies: readonly unknown[],
    ) {
      const slot = index++;
      const previous = slots[slot] as Effect | undefined;
      if (
        previous &&
        dependencies.every((value, i) =>
          Object.is(value, previous.dependencies[i]),
        )
      )
        return;
      pending.push(() => {
        previous?.cleanup?.();
        slots[slot] = { dependencies, cleanup: callback() };
      });
    },
  };
  const jsx = (type: unknown, nodeProps: Record<string, unknown>) => ({
    type,
    props: nodeProps,
  });
  const control = () => ({ addTo() {} });
  const leaflet = {
    map(element: Element) {
      const map = new MapInstance(element);
      maps.push(map);
      return map;
    },
    tileLayer() {
      const tile = new Layer('tile');
      tiles.push(tile);
      return tile;
    },
    layerGroup: () => new Layer('group'),
    polygon: () => new Layer('polygon'),
    circleMarker: () => new Layer('circle'),
    marker: (_position: unknown, options: { icon?: { html: Element } }) =>
      new Layer('marker', options),
    divIcon: (options: unknown) => options,
    polyline: () => new Layer('polyline'),
    latLngBounds: (points: unknown) => points,
    control: {
      zoom: control,
      scale: () => ({
        addTo() {
          if (failInitialization) {
            failInitialization = false;
            throw new Error('injected init failure');
          }
        },
      }),
    },
  };
  const sandboxModule = { exports: {} as { default: (props: Props) => Node } };
  runInNewContext(code, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Promise,
    require(name: string) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime')
        return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'leaflet') return leaflet;
      if (name === '@/lib/planner/territory-editing') return { ellipseDrawing };
      if (name === '@/lib/planner/mission-vehicle-label') return vehicleLabels;
      if (name === '@/lib/planner/obstacle-layer') return obstacleLayer;
      if (name === '@/lib/planner/geometry') return geometry;
      if (name.endsWith('.css')) return {};
      throw new Error(`Unexpected runtime import: ${name}`);
    },
    document: {
      createElement: () => {
        const element = new Element();
        if (initiallyHidden) {
          element.clientWidth = 0;
          element.clientHeight = 0;
        }
        return element;
      },
    },
    ResizeObserver: class {
      entry: { callback: () => void; disconnected: boolean };
      constructor(callback: () => void) {
        this.entry = { callback, disconnected: false };
        observers.push(this.entry);
      }
      observe() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
    requestAnimationFrame(callback: () => void) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
  });
  function nodes(value: unknown): Node[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    const node = value as Node;
    return [node, ...nodes(node.props.children)];
  }
  function render(next?: Partial<Props>) {
    if (next) props = { ...props, ...next };
    index = 0;
    dirty = false;
    tree = sandboxModule.exports.default(props);
    const root = nodes(tree).find(
      (node) => node.props.className === 'mission-map',
    )!;
    // React writes className only if its declared value changes between renders.
    if (root.props.className !== previousClass)
      host.className = String(root.props.className);
    previousClass = root.props.className;
    (root.props.ref as { current: Element }).current = host;
    pending.splice(0).forEach((effect) => effect());
  }
  render();
  return {
    maps,
    tiles,
    host,
    observers,
    render,
    async flush() {
      for (let i = 0; i < 12; i++) {
        await Promise.resolve();
        if (dirty) render();
      }
    },
    frame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
    nodes: () => nodes(tree),
    unmount() {
      for (const slot of slots)
        if (slot && typeof slot === 'object' && 'cleanup' in slot)
          (slot as Effect).cleanup?.();
    },
  };
}

void test('Leaflet host/classes survive drawing, calculation, fit and resize rerenders; unmount cleans ownership', async () => {
  const app = harness();
  await app.flush();
  const map = app.maps[0],
    canvas = app.host.children[0];
  assert.equal(map.fits, 1);
  const plan = { missions: [] } as unknown as Plan;
  app.render({ mode: 'area', draft: [[30.3, 60.03]], plan });
  app.render({ mode: null, draft: [], time: 20 });
  assert.equal(app.maps.length, 1);
  assert.equal(app.host.children[0], canvas);
  assert.match(canvas.className, /leaflet-container/);
  assert.match(canvas.className, /leaflet-grab/);
  assert.equal(
    map.fits,
    1,
    'Parameter changes must not reset the user viewport.',
  );
  app.render({ fit: 2 });
  assert.equal(map.fits, 2);
  app.observers[0].callback();
  app.frame();
  assert.equal(map.invalidations, 3);
  app.unmount();
  assert.equal(map.removed, true);
  assert.equal(map.handlers.size, 0);
  assert.equal(app.tiles[0].handlers.size, 0);
  assert.equal(app.observers[0].disconnected, true);
  assert.equal(app.host.children.length, 0);
});

void test('late import cannot initialize an unmounted map and failed initialization retries on a clean host', async () => {
  const gone = harness();
  gone.unmount();
  await gone.flush();
  assert.equal(gone.maps.length, 0);
  const app = harness(true);
  await app.flush();
  assert.equal(app.maps[0].removed, true);
  assert.equal(app.host.children.length, 0);
  const retry = app
    .nodes()
    .find(
      (node) =>
        node.type === 'button' &&
        node.props.children === 'Повторить инициализацию карты',
    )!;
  (retry.props.onClick as () => void)();
  await app.flush();
  assert.equal(app.maps.length, 2);
  assert.equal(app.maps[1].fits, 1);
  assert.notEqual(app.maps[0].host, app.maps[1].host);
  assert.equal(app.host.children.length, 1);
  app.unmount();
});

void test('fit requested in a hidden panel is applied once after the map becomes visible', async () => {
  const app = harness(false, true);
  await app.flush();
  const map = app.maps[0];
  assert.equal(map.fits, 0);
  map.host.clientWidth = 800;
  map.host.clientHeight = 600;
  app.observers[0].callback();
  app.frame();
  assert.equal(map.fits, 1);
  app.observers[0].callback();
  app.frame();
  assert.equal(map.fits, 1, 'Ordinary resize keeps the current viewport.');
  app.unmount();
});

void test('explicit fit includes full route detours outside work areas without refitting on plan or time updates', async () => {
  const app = harness();
  await app.flush();
  const map = app.maps[0];
  const vehicle = demoMission(1).scenario.vehicles[0];
  const plan = {
    missions: [
      {
        vehicleId: vehicle.id,
        durationSec: 100,
        segments: [
          {
            from: [30.1, 60.02],
            to: [30.5, 60.08],
            phase: 'transit',
            distanceM: 1000,
            startSec: 0,
            endSec: 100,
          },
        ],
      },
    ],
  } as unknown as Plan;
  app.render({ plan });
  assert.equal(
    map.fits,
    1,
    'A changed plan alone must not reset the viewport.',
  );
  app.render({ fit: 2 });
  const bounds = JSON.parse(JSON.stringify(map.lastBounds)) as number[][];
  assert.ok(bounds.some((point) => point[0] === 60.02 && point[1] === 30.1));
  assert.ok(bounds.some((point) => point[0] === 60.08 && point[1] === 30.5));
  assert.equal(map.fits, 2);
  app.render({ time: 50 });
  assert.equal(map.fits, 2, 'Playback ticks must not recenter the full route.');
  app.unmount();
});

void test('drone marker moves without replacement, stops pulse on pause, refreshes aliases and is removed with plan', async () => {
  const app = harness();
  await app.flush();
  const scenario = demoMission(1).scenario;
  const plan = {
    missions: [
      {
        vehicleId: scenario.vehicles[0].id,
        durationSec: 100,
        segments: [
          {
            from: [30.1, 60.02],
            to: [30.2, 60.03],
            phase: 'survey',
            distanceM: 1000,
            startSec: 0,
            endSec: 100,
            altitudeFromM: 80,
            altitudeToM: 80,
          },
        ],
      },
    ],
  } as unknown as Plan;
  app.render({ plan, time: 10, execution: true, playing: true });
  const markerLayer = [...app.maps[0].members].filter(
    (l) => l.kind === 'group',
  )[1];
  const marker = [...markerLayer.members][0],
    button = marker.options!.icon!.html;
  const position = marker.position;
  assert.match(button.className, /moving/);
  app.render({ time: 20 });
  assert.equal([...markerLayer.members][0], marker);
  assert.notDeepEqual(marker.position, position);
  app.render({ playing: false });
  assert.doesNotMatch(button.className, /moving/);
  app.render({
    scenario: { ...scenario, vehicles: [...scenario.vehicles].reverse() },
  });
  const alias = vehicleLabels.vehicleMapLabel(
    scenario.vehicles[0],
    scenario.vehicles.length - 1,
  );
  assert.equal(button.attributes['aria-label'], `На карте: ${alias}`);
  assert.equal(button.children.at(-1)!.textContent, alias);
  const symbol = button.children[0];
  assert.equal(symbol.dataset.kind, 'copter');
  const copterMarkup = symbol.innerHTML;
  const fixedWing = {
    ...scenario.vehicles[0],
    model: '201' as const,
    kind: 'fixedWing' as const,
  };
  app.render({
    scenario: {
      ...scenario,
      vehicles: [fixedWing, ...scenario.vehicles.slice(1)],
    },
  });
  assert.equal(
    [...markerLayer.members][0],
    marker,
    'Model label and silhouette refresh without recreating a marker.',
  );
  assert.equal(symbol.dataset.kind, 'plane');
  assert.notEqual(symbol.innerHTML, copterMarkup);
  assert.equal(
    button.attributes['aria-label'],
    `На карте: ${vehicleLabels.vehicleMapLabel(fixedWing, 0)}`,
  );
  app.render({ plan: null });
  assert.equal(markerLayer.members.size, 0);
  app.unmount();
});

void test('fit refreshes cached viewport before a queued resize frame; ordinary resize preserves center without fitting', async () => {
  const app = harness();
  await app.flush();
  const map = app.maps[0];
  app.frame();
  map.host.clientWidth = 390;
  map.host.clientHeight = 430;
  app.observers[0].callback();
  assert.deepEqual(map.cachedSize, [800, 600]);
  app.render({ fit: 2 });
  assert.deepEqual(map.fittedSize, [390, 430]);
  assert.equal(map.lastInvalidation?.pan, true);
  const fits = map.fits;
  app.frame();
  assert.equal(map.fits, fits);
  map.host.clientWidth = 844;
  map.host.clientHeight = 720;
  app.observers[0].callback();
  app.frame();
  assert.deepEqual(map.cachedSize, [844, 720]);
  assert.equal(map.lastInvalidation?.pan, true);
  assert.equal(map.lastInvalidation?.animate, false);
  assert.equal(map.fits, fits, 'Resize and playback must not reset user zoom.');
  app.unmount();
});

void test('tile failure keeps vector geometry and current point callback; draft numbers are actual coordinates', async () => {
  const app = harness();
  const clicks: Coordinate[] = [];
  await app.flush();
  const map = app.maps[0];
  const geometry = [...map.members].find((layer) => layer.kind === 'group')!;
  const count = geometry.members.size;
  const failedTile = {};
  app.tiles[0].handlers.get('tileerror')?.({ tile: failedTile });
  await app.flush();
  assert.equal(geometry.members.size, count);
  assert.ok(count > 0);
  app.tiles[0].handlers.get('tileload')?.({ tile: {} });
  await app.flush();
  assert.ok(
    app.nodes().some((node) => node.props.className === 'mission-map-status'),
    'An unrelated successful tile does not clear a visible failure.',
  );
  app.tiles[0].handlers.get('tileunload')?.({ tile: failedTile });
  await app.flush();
  assert.ok(
    !app.nodes().some((node) => node.props.className === 'mission-map-status'),
    'Removed failed tiles no longer claim the current viewport is unavailable.',
  );
  app.render({
    onPoint: (point) => clicks.push(point),
    mode: 'area',
    draft: [
      [30.3, 60.03],
      [30.31, 60.04],
    ],
  });
  map.handlers.get('click')?.({ latlng: { lng: 30.32, lat: 60.05 } });
  map.handlers.get('mousemove')?.({ latlng: { lng: 30.33, lat: 60.06 } });
  app.frame();
  await app.flush();
  assert.equal(JSON.stringify(clicks), JSON.stringify([[30.32, 60.05]]));
  const output = app
    .nodes()
    .find((node) => node.props.className === 'mission-map-coordinates')!;
  assert.match(JSON.stringify(output), /60.060000/);
  assert.match(JSON.stringify(output), /60.050000/);
  const draft = [...map.members]
    .filter((layer) => layer.kind === 'group')
    .at(-1)!;
  assert.deepEqual(
    [...draft.members]
      .filter((layer) => layer.kind === 'circle')
      .map((layer) => layer.tooltip),
    ['1', '2'],
  );
  app.unmount();
});

void test('work areas and volume metadata remain distinct; model time changes activity only at interval boundaries', async () => {
  const app = harness();
  await app.flush();
  const document = demoMission(1);
  const restriction = {
    id: 'timed-obstacle',
    name: '<img> · test volume',
    kind: 'obstacle' as const,
    geometry: document.jobs[0].area,
    minAltitudeM: 0,
    maxAltitudeM: 50,
    startAt: '2026-06-15T09:01:00Z',
    endAt: '2026-06-15T09:02:00Z',
    source: 'Synthetic fixture',
  };
  app.render({
    workAreas: [
      { id: 'one', name: 'First area', area: document.jobs[0].area },
      { id: 'two', name: 'Second area', area: document.jobs[0].area },
    ],
    activeJobId: 'one',
    restrictions: [restriction],
    missionStartAt: '2026-06-15T09:00:00Z',
    time: 0,
  });
  const layer = [...app.maps[0].members].find((item) => item.kind === 'group')!;
  const first = [...layer.members];
  assert.ok(
    first.some((item) => item.tooltip.includes('Работа 1: First area')),
  );
  assert.ok(
    first.some((item) => item.tooltip.includes('Работа 2: Second area')),
  );
  assert.ok(
    first.some((item) => item.tooltip.includes('неактивно в модельное время')),
  );
  app.render({ time: 30 });
  assert.deepEqual(
    [...layer.members],
    first,
    'Playback ticks do not rebuild static layers.',
  );
  app.render({ time: 60 });
  const tooltip = [...layer.members].find((item) =>
    item.tooltip.includes('test volume'),
  )!.tooltip;
  assert.match(
    tooltip,
    /<img>/,
    'Operator text is passed as textContent, not HTML.',
  );
  assert.match(tooltip, /50 м, общий локальный уровень миссии/);
  assert.match(tooltip, /· активно в модельное время/);
  app.unmount();
});
