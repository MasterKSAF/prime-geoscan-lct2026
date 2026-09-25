'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDownToLine,
  BatteryMedium,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Crosshair,
  Download,
  FileJson,
  Flag,
  FolderOpen,
  Layers,
  LoaderCircle,
  Map,
  MapPin,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Route,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  TriangleAlert,
  Wind,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { demoScenario } from '@/lib/planner/demo';
import { parseScenario } from '@/lib/planner/schema';
import type { Coordinate, Plan, Scenario, Vehicle } from '@/lib/planner/schema';
import { evidenceBundle, toGeoJSON, toKML } from '@/lib/planner/export';
import MissionMap, { flightColors } from './mission-map';
import type { DrawMode } from './mission-map';

const fmt = (v: number, d = 1) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: d });
const clock = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;
const phases: Record<string, string> = {
  takeoff: 'Взлёт',
  transit: 'Переход',
  survey: 'Съёмка',
  turn: 'Манёвр',
  return: 'Возврат',
  landing: 'Посадка',
};
const jobLabels: Record<string, string> = {
  RGB: 'RGB · фотосъёмка',
  MS: 'Мультиспектральная',
  IR: 'Тепловизионная',
  LiDAR: 'LiDAR · нужен профиль',
  Geophysics: 'Геофизика · нужен профиль',
};
function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) =>
            onChange(e.target.value === '' ? min : Number(e.target.value))
          }
        />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  );
}

export default function PlannerWorkspace() {
  const [scenario, setScenario] = useState<Scenario>(demoScenario),
    [plan, setPlan] = useState<Plan | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [selected, setSelected] = useState('gemini-01'),
    [tab, setTab] = useState('task'),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(20);
  const [mode, setMode] = useState<DrawMode>(null),
    [draft, setDraft] = useState<Coordinate[]>([]),
    [fit, setFit] = useState(0),
    [showTiles, setShowTiles] = useState(true),
    [showTransit, setShowTransit] = useState(true);
  const [exportScope, setExportScope] = useState('all');
  const file = useRef<HTMLInputElement>(null),
    pending = useRef<AbortController | null>(null),
    revision = useRef(0);
  const stale =
    !!plan && JSON.stringify(plan.scenario) !== JSON.stringify(scenario);
  const current = plan && !stale ? plan : null,
    vehicle =
      scenario.vehicles.find((v) => v.id === selected) ?? scenario.vehicles[0];
  const update = (fn: (s: Scenario) => Scenario) => {
    revision.current++;
    pending.current?.abort();
    setBusy(false);
    setPlaying(false);
    setTime(0);
    setError('');
    setScenario(fn);
  };
  const patchJob = (patch: Partial<Scenario['job']>) =>
    update((s) => ({ ...s, job: { ...s.job, ...patch } }));
  const patchVehicle = (patch: Partial<Vehicle>) =>
    update((s) => ({
      ...s,
      vehicles: s.vehicles.map((v) =>
        v.id === vehicle.id ? { ...v, ...patch } : v,
      ),
    }));
  async function calculate(input = scenario) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const rev = revision.current;
    setBusy(true);
    setError('');
    setPlaying(false);
    setTime(0);
    try {
      parseScenario(input);
      const response = await fetch('/api/planner/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const body = (await response.json()) as Plan & {
        error?: string;
        details?: string[];
      };
      if (!response.ok)
        throw new Error([body.error, ...(body.details ?? [])].join(' '));
      if (rev === revision.current) setPlan(body);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Расчёт недоступен.');
        setPlan(null);
      }
    } finally {
      if (rev === revision.current) setBusy(false);
    }
  }
  useEffect(() => {
    // Initial network calculation starts outside React's render/effect commit.
    const timer = setTimeout(() => void calculate(demoScenario()), 0);
    return () => {
      clearTimeout(timer);
      pending.current?.abort();
    };
  }, []); // Initial local demo only.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!playing || !current) return;
    const timer = setInterval(
      () =>
        setTime((t) => {
          const n = t + rate / 10;
          if (n >= current.metrics.makespanSec) {
            setPlaying(false);
            return current.metrics.makespanSec;
          }
          return n;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [playing, rate, current]);
  const startDraw = (m: DrawMode) => {
    setDraft([]);
    setMode(m);
    setPlaying(false);
  };
  const mapPoint = (p: Coordinate) => {
    if (!mode) return;
    if (mode === 'start' || mode === 'landing') {
      patchVehicle({ [mode]: p });
      setMode(null);
      return;
    }
    if (mode === 'reserve') {
      update((s) => ({ ...s, reserveSites: [...s.reserveSites, p] }));
      setMode(null);
      return;
    }
    if (draft.length < 69) setDraft((d) => [...d, p]);
  };
  const finishDraw = () => {
    if (draft.length < 3) return;
    const poly = {
      type: 'Polygon' as const,
      coordinates: [[...draft, draft[0]]],
    };
    try {
      const next = {
        ...scenario,
        ...(mode === 'exclusion'
          ? { exclusions: [...scenario.exclusions, poly] }
          : mode === 'airspace'
            ? { airspace: poly }
            : { area: poly }),
      };
      parseScenario(next);
      update(() => next);
      setMode(null);
      setDraft([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Некорректный контур.');
    }
  };
  async function importFile(f: File) {
    if (f.size > 200000) {
      setError('Файл больше 200 КБ.');
      return;
    }
    try {
      const next = parseScenario(JSON.parse(await f.text()));
      update(() => next);
      setPlan(null);
      setSelected(next.vehicles[0].id);
      setFit((n) => n + 1);
      setNotice('Сценарий загружен. Нажмите «Рассчитать».');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть сценарий.');
    }
  }
  const exportPlan = (kind: 'kml' | 'geojson' | 'evidence') => {
    if (!current || current.status === 'invalid') return;
    const scoped =
      exportScope === 'all' || kind === 'evidence'
        ? current
        : {
            ...current,
            missions: current.missions.filter(
              (m) => m.vehicleId === exportScope,
            ),
          };
    if (!scoped.missions.length) {
      setNotice('Выберите БВС, участвующий в актуальном плане.');
      return;
    }
    download(
      `prime-${kind === 'evidence' ? 'all' : exportScope}-${current.inputHash.slice(0, 10)}.${kind === 'evidence' ? 'evidence.json' : kind}`,
      kind === 'kml'
        ? toKML(scoped)
        : JSON.stringify(
            kind === 'geojson' ? toGeoJSON(scoped) : evidenceBundle(current),
            null,
            2,
          ),
      kind === 'kml'
        ? 'application/vnd.google-earth.kml+xml'
        : 'application/json',
    );
    setNotice(
      'Файл сохранён. Расчётное задание не является командой запуска БВС.',
    );
  };
  const active = scenario.vehicles.filter((v) => v.enabled).length;
  const base = current?.baseline;
  const gain =
    base && current
      ? 100 *
        (1 -
          (scenario.objective === 'makespan'
            ? current.metrics.makespanSec / base.makespanSec
            : current.metrics.flightTimeSec / base.flightTimeSec))
      : null;
  return (
    <main className="prime-planner">
      <header className="prime-header">
        <div className="prime-brand">
          <Navigation size={24} strokeWidth={2.4} />
          <strong>
            ПРАЙМ<span>PLANNER</span>
          </strong>
        </div>
        <div className="prime-breadcrumb">
          Рабочее пространство <ChevronRight size={15} />
          <b>Авиационные работы</b>
        </div>
        <span className="version-label">ЛЦТ / 05</span>
        <Link className="docs-link" href="/" title="Вернуться к обзору ЛЦТ">
          Обзор ЛЦТ
        </Link>
      </header>
      <div className="project-bar">
        <div>
          <span className="eyebrow">ПРОЕКТ</span>
          <input
            aria-label="Название проекта"
            value={scenario.name}
            onChange={(e) => update((s) => ({ ...s, name: e.target.value }))}
          />
        </div>
        <div className="project-actions">
          <input
            ref={file}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => file.current?.click()}>
            <FolderOpen />
            Открыть
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              download('prime-scenario.json', JSON.stringify(scenario, null, 2))
            }
          >
            <Download />
            Сценарий
          </Button>
          <Button
            className="calculate"
            disabled={busy}
            onClick={() => void calculate()}
          >
            {busy ? <LoaderCircle className="spinning" /> : <Route />}
            {busy ? 'Расчёт…' : 'Рассчитать'}
          </Button>
        </div>
      </div>
      <div className="workspace-grid">
        <aside className="project-panel">
          <div className="panel-title">
            <Layers size={17} />
            <h2>Состав задания</h2>
            <span>01</span>
          </div>
          <div className="tree-root">
            <ChevronRight size={15} />
            <FolderOpen size={17} />
            <b>Площадная съёмка</b>
          </div>
          <button
            className="tree-item"
            onClick={() => {
              setTab('task');
              setFit((n) => n + 1);
            }}
          >
            <span className="layer-swatch area" />
            Область работ{' '}
            <span>{current ? fmt(current.metrics.areaHa) : '—'} га</span>
          </button>
          <button className="tree-item" onClick={() => startDraw('airspace')}>
            <span className="layer-swatch airspace" />
            Разрешённая зона <ChevronRight size={14} />
          </button>
          <button className="tree-item" onClick={() => startDraw('exclusion')}>
            <span className="layer-swatch exclusion" />
            Запретные зоны <span>{scenario.exclusions.length}</span>
          </button>
          {scenario.exclusions.length > 0 && (
            <button
              className="tiny-action"
              onClick={() =>
                update((s) => ({ ...s, exclusions: s.exclusions.slice(0, -1) }))
              }
            >
              Убрать последний запрет
            </button>
          )}
          <button className="tree-item" onClick={() => startDraw('reserve')}>
            <Flag size={15} />
            Резервные площадки <span>{scenario.reserveSites.length}</span>
          </button>
          <div className="fleet-heading">
            <h3>Воздушные суда</h3>
            <span>{active} в задании</span>
          </div>
          <div className="fleet-list">
            {scenario.vehicles.map((v, i) => {
              const m = current?.missions.find((m) => m.vehicleId === v.id);
              return (
                <div
                  key={v.id}
                  className={`vehicle-card ${selected === v.id ? 'selected' : ''} ${!v.enabled ? 'inactive' : ''}`}
                  style={
                    {
                      '--vehicle-color': flightColors[i],
                    } as React.CSSProperties
                  }
                >
                  <div className="vehicle-title">
                    <input
                      type="checkbox"
                      aria-label={`Включить ${v.name}`}
                      checked={v.enabled}
                      onChange={(e) =>
                        update((s) => ({
                          ...s,
                          vehicles: s.vehicles.map((x) =>
                            x.id === v.id
                              ? { ...x, enabled: e.target.checked }
                              : x,
                          ),
                        }))
                      }
                    />
                    <button
                      onClick={() => {
                        setSelected(v.id);
                        setTab('fleet');
                      }}
                    >
                      <Navigation size={18} />
                      <strong>{v.name}</strong>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="vehicle-meta">
                    <span>{v.jobs.join(' / ')}</span>
                    <span>
                      <BatteryMedium size={14} />
                      {v.batteryPct}%
                    </span>
                  </div>
                  {m ? (
                    <>
                      <div className="vehicle-progress">
                        <i style={{ width: `${100 - m.remainingPct}%` }} />
                      </div>
                      <div className="vehicle-meta">
                        <span>
                          {clock(m.durationSec)} · {fmt(m.distanceM / 1000)} км
                        </span>
                        <span>остаток {fmt(m.remainingPct, 0)}%</span>
                      </div>
                    </>
                  ) : (
                    <p>
                      {v.kind === 'fixedWing'
                        ? 'Модель полёта в разработке'
                        : v.enabled
                          ? 'Ожидает расчёта'
                          : 'Не участвует в расчёте'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="project-bottom">
            <span className="eyebrow">ОТОБРАЖЕНИЕ</span>
            <label>
              <input
                type="checkbox"
                checked={showTiles}
                onChange={(e) => setShowTiles(e.target.checked)}
              />
              Картографическая подложка
            </label>
            <label>
              <input
                type="checkbox"
                checked={showTransit}
                onChange={(e) => setShowTransit(e.target.checked)}
              />
              Переходы и возврат
            </label>
            <p>Видимость слоя не меняет ограничения расчёта.</p>
          </div>
        </aside>
        <section className="map-panel" aria-label="План и моделирование">
          <MissionMap
            scenario={scenario}
            plan={current}
            selected={selected}
            time={time}
            mode={mode}
            draft={draft}
            onPoint={mapPoint}
            fit={fit}
            showTiles={showTiles}
            showTransit={showTransit}
          />
          <div className="map-heading">
            <span className="map-chip">
              <Map size={15} />
              WGS 84 <span>·</span> учебный сценарий
            </span>
            <button
              className="map-fit"
              aria-label="Показать область целиком"
              onClick={() => setFit((n) => n + 1)}
            >
              <Crosshair size={19} />
            </button>
          </div>
          <div className="drawing-toolbar" aria-label="Редактирование карты">
            <button
              className={mode === null ? 'active' : ''}
              title="Просмотр карты"
              aria-label="Просмотр карты"
              onClick={() => startDraw(null)}
            >
              <Navigation size={19} />
            </button>
            <button
              className={mode === 'area' ? 'active' : ''}
              title="Нарисовать область съёмки"
              aria-label="Нарисовать область съёмки"
              onClick={() => startDraw('area')}
            >
              <Square size={19} />
            </button>
            <button
              className={mode === 'exclusion' ? 'active danger' : ''}
              title="Добавить запретную зону"
              aria-label="Добавить запретную зону"
              onClick={() => startDraw('exclusion')}
            >
              <ShieldAlert size={19} />
            </button>
            <button
              title="Задать старт выбранного БВС"
              aria-label="Задать старт выбранного БВС"
              onClick={() => startDraw('start')}
            >
              <MapPin size={19} />
            </button>
          </div>
          {mode && (
            <div className="drawing-message">
              <strong>
                {mode === 'area'
                  ? 'Новая область'
                  : mode === 'exclusion'
                    ? 'Новая запретная зона'
                    : mode === 'airspace'
                      ? 'Разрешённое пространство'
                      : mode === 'reserve'
                        ? 'Резервная площадка'
                        : `${mode === 'start' ? 'Старт' : 'Посадка'} · ${vehicle.name}`}
              </strong>
              <span>
                {['start', 'landing', 'reserve'].includes(mode)
                  ? 'Нажмите точку на карте'
                  : 'Отметьте вершины по порядку'}
              </span>
              {!['start', 'landing', 'reserve'].includes(mode) && (
                <Button disabled={draft.length < 3} onClick={finishDraw}>
                  <Check />
                  Готово ({draft.length})
                </Button>
              )}
              <button
                aria-label="Отменить рисование"
                onClick={() => startDraw(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!mode && (
            <div className="wind-compass">
              <Compass
                size={32}
                style={{ transform: `rotate(${scenario.wind.fromDeg}deg)` }}
              />
              <div>
                <b>
                  {scenario.wind.speedMps} <small>м/с</small>
                </b>
                <span>ветер от {scenario.wind.fromDeg}°</span>
              </div>
            </div>
          )}
          {busy && (
            <div className="map-state">
              <LoaderCircle className="spinning" />
              <b>Распределяем работу</b>
              <span>Проходы → переходы → запас на возврат</span>
            </div>
          )}
          {stale && !busy && (
            <div className="stale-message">
              <TriangleAlert size={17} />
              Условия изменены. Маршруты и экспорт скрыты до пересчёта.
            </div>
          )}
          {error && (
            <div className="calculation-error" role="alert">
              <ShieldAlert />
              <div>
                <strong>План не сформирован</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => setError('')} aria-label="Закрыть ошибку">
                <X size={16} />
              </button>
            </div>
          )}
          <div className="map-legend">
            {current?.missions.map((m) => (
              <span key={m.vehicleId}>
                <i
                  style={{
                    background:
                      flightColors[
                        scenario.vehicles.findIndex((v) => v.id === m.vehicleId)
                      ],
                  }}
                />
                {m.name}
              </span>
            ))}
            {!current && <span>Задайте условия и запустите расчёт</span>}
          </div>
          <div className="map-disclaimer">
            Учебные границы и запреты · не аэронавигационные данные
          </div>
        </section>
        <aside className="inspector">
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList className="inspector-tabs">
              <TabsTrigger value="task">Задание</TabsTrigger>
              <TabsTrigger value="fleet">БВС</TabsTrigger>
              <TabsTrigger value="checks">
                Проверки
                {current && (
                  <span className="tab-count">
                    {current.checks.filter((c) => c.status !== 'pass').length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="task">
              <div className="inspector-content">
                <div className="section-heading">
                  <SlidersHorizontal size={16} />
                  <h3>Параметры съёмки</h3>
                </div>
                <label className="field-label">
                  Тип работ
                  <select
                    value={scenario.job.type}
                    onChange={(e) =>
                      patchJob({
                        type: e.target.value as Scenario['job']['type'],
                        qualitySource:
                          'Ручной профиль пользователя. Параметры покрытия и совместимость требуют подтверждения.',
                      })
                    }
                  >
                    {Object.entries(jobLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two-fields">
                  <NumberField
                    label="Высота от старта"
                    unit="м"
                    value={scenario.job.altitudeM}
                    min={10}
                    max={500}
                    onChange={(n) => patchJob({ altitudeM: n })}
                  />
                  <NumberField
                    label="Ширина полосы"
                    unit="м"
                    value={scenario.job.swathM}
                    min={5}
                    max={500}
                    step={0.1}
                    onChange={(n) => patchJob({ swathM: n })}
                  />
                  <NumberField
                    label="Перекрытие"
                    unit="%"
                    value={Math.round(scenario.job.sideOverlap * 100)}
                    min={0}
                    max={95}
                    onChange={(n) => patchJob({ sideOverlap: n / 100 })}
                  />
                  <NumberField
                    label="Шаг снимков"
                    unit="м"
                    value={scenario.job.triggerDistanceM}
                    min={1}
                    max={200}
                    step={0.1}
                    onChange={(n) => patchJob({ triggerDistanceM: n })}
                  />
                </div>
                <div className="inline-note">
                  <CircleHelp size={15} />
                  <span>
                    Ручной профиль: высота не пересчитывает ширину полосы
                    автоматически.
                  </span>
                </div>
                <details className="source-note">
                  <summary>Источник параметров</summary>
                  <p>{scenario.job.qualitySource}</p>
                </details>
                <div className="section-heading">
                  <Wind size={16} />
                  <h3>Условия и ограничения</h3>
                </div>
                <div className="two-fields">
                  <NumberField
                    label="Ветер"
                    value={scenario.wind.speedMps}
                    unit="м/с"
                    min={0}
                    max={30}
                    step={0.5}
                    onChange={(n) =>
                      update((s) => ({
                        ...s,
                        wind: { ...s.wind, speedMps: n },
                      }))
                    }
                  />
                  <NumberField
                    label="Направление от"
                    value={scenario.wind.fromDeg}
                    unit="°"
                    min={0}
                    max={359}
                    onChange={(n) =>
                      update((s) => ({ ...s, wind: { ...s.wind, fromDeg: n } }))
                    }
                  />
                  <NumberField
                    label="Резерв заряда"
                    value={scenario.reservePct}
                    unit="%"
                    min={10}
                    max={80}
                    onChange={(n) => update((s) => ({ ...s, reservePct: n }))}
                  />
                  <NumberField
                    label="Отступ от запрета"
                    value={scenario.clearanceM}
                    unit="м"
                    min={2}
                    max={100}
                    onChange={(n) => update((s) => ({ ...s, clearanceM: n }))}
                  />
                </div>
                <div className="section-heading">
                  <Route size={16} />
                  <h3>Цель оптимизации</h3>
                </div>
                <fieldset className="objectives">
                  <legend className="sr-only">Критерий оптимизации</legend>
                  <label
                    className={
                      scenario.objective === 'makespan' ? 'chosen' : ''
                    }
                  >
                    <input
                      type="radio"
                      name="objective"
                      checked={scenario.objective === 'makespan'}
                      onChange={() =>
                        update((s) => ({ ...s, objective: 'makespan' }))
                      }
                    />
                    <Clock3 size={18} />
                    <span>
                      <b>Быстрее закончить</b>
                      <small>До посадки последнего БВС</small>
                    </span>
                  </label>
                  <label
                    className={
                      scenario.objective === 'flightTime' ? 'chosen' : ''
                    }
                  >
                    <input
                      type="radio"
                      name="objective"
                      checked={scenario.objective === 'flightTime'}
                      onChange={() =>
                        update((s) => ({ ...s, objective: 'flightTime' }))
                      }
                    />
                    <Route size={18} />
                    <span>
                      <b>Меньше суммарный налёт</b>
                      <small>Сумма времени всех полётов</small>
                    </span>
                  </label>
                </fieldset>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={scenario.job.autoBearing}
                    onChange={(e) =>
                      patchJob({ autoBearing: e.target.checked })
                    }
                  />
                  Подобрать направление проходов
                </label>
                {!scenario.job.autoBearing && (
                  <NumberField
                    label="Направление от севера"
                    value={scenario.job.bearingDeg}
                    unit="°"
                    min={0}
                    max={179}
                    onChange={(n) => patchJob({ bearingDeg: n })}
                  />
                )}
                <div className="warning-note">
                  <TriangleAlert size={16} />
                  <div>
                    <b>Рельеф не загружен</b>
                    <p>
                      Высота относительно старта. Проверки земли и препятствий
                      нет.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="fleet">
              <div className="inspector-content">
                <div className="section-heading">
                  <Navigation size={17} />
                  <h3>{vehicle.name}</h3>
                </div>
                <p className="muted-copy">
                  Параметры конкретной конфигурации, не совмещённые паспортные
                  максимумы.
                </p>
                <div className="two-fields">
                  <NumberField
                    label="Воздушная скорость"
                    unit="м/с"
                    value={vehicle.airspeedMps}
                    min={2}
                    max={40}
                    step={0.5}
                    onChange={(n) => patchVehicle({ airspeedMps: n })}
                  />
                  <NumberField
                    label="Начальный заряд"
                    unit="%"
                    value={vehicle.batteryPct}
                    min={0}
                    max={100}
                    onChange={(n) => patchVehicle({ batteryPct: n })}
                  />
                  <NumberField
                    label="Бюджет при 100%"
                    unit="мин"
                    value={vehicle.effectiveEnduranceMin}
                    min={1}
                    max={240}
                    onChange={(n) => patchVehicle({ effectiveEnduranceMin: n })}
                  />
                  <NumberField
                    label="Предельный ветер"
                    unit="м/с"
                    value={vehicle.maxWindMps}
                    min={0}
                    max={25}
                    onChange={(n) => patchVehicle({ maxWindMps: n })}
                  />
                  <NumberField
                    label="Набор высоты"
                    unit="м/с"
                    value={vehicle.climbMps}
                    min={0.5}
                    max={10}
                    step={0.5}
                    onChange={(n) => patchVehicle({ climbMps: n })}
                  />
                  <NumberField
                    label="Снижение"
                    unit="м/с"
                    value={vehicle.descentMps}
                    min={0.3}
                    max={10}
                    step={0.1}
                    onChange={(n) => patchVehicle({ descentMps: n })}
                  />
                </div>
                <div className="warning-note">
                  <BatteryMedium size={17} />
                  <div>
                    <b>Оценочная модель АКБ</b>
                    <p>
                      Расход = время / бюджет × 100%. Бюджет включает всю
                      конфигурацию; отдельный расход камеры пока неизвестен.
                    </p>
                  </div>
                </div>
                <div className="section-heading">
                  <MapPin size={16} />
                  <h3>Старт и посадка</h3>
                </div>
                <div className="site-coordinates">
                  <span>Старт</span>
                  <code>
                    {vehicle.start[1].toFixed(5)}, {vehicle.start[0].toFixed(5)}
                  </code>
                  <Button variant="outline" onClick={() => startDraw('start')}>
                    Указать на карте
                  </Button>
                  <span>Посадка</span>
                  <code>
                    {vehicle.landing[1].toFixed(5)},{' '}
                    {vehicle.landing[0].toFixed(5)}
                  </code>
                  <Button
                    variant="outline"
                    onClick={() => startDraw('landing')}
                  >
                    Указать на карте
                  </Button>
                </div>
                <h3 className="subheading">Что требует подтверждения</h3>
                {vehicle.assumptions.map((a) => (
                  <p className="assumption" key={a}>
                    {a}
                  </p>
                ))}
                <a
                  className="source-link"
                  href={vehicle.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  Документ производителя ↗
                </a>
              </div>
            </TabsContent>
            <TabsContent value="checks">
              <div className="inspector-content">
                <div className="section-heading">
                  <ShieldAlert size={17} />
                  <h3>Проверка задания</h3>
                </div>
                {!current ? (
                  <p className="muted-copy">
                    Проверки появятся после расчёта актуального задания.
                  </p>
                ) : (
                  <>
                    <div className="validation-summary">
                      <b>
                        {
                          current.checks.filter((c) => c.status === 'pass')
                            .length
                        }{' '}
                        пройдено
                      </b>
                      <span>
                        {
                          current.checks.filter((c) => c.status === 'fail')
                            .length
                        }{' '}
                        ошибок ·{' '}
                        {
                          current.checks.filter((c) => c.status === 'unknown')
                            .length
                        }{' '}
                        не подтверждено
                      </span>
                    </div>
                    {current.checks.map((c) => (
                      <details className={`check-item ${c.status}`} key={c.id}>
                        <summary>
                          {c.status === 'pass' ? (
                            <Check size={16} />
                          ) : c.status === 'fail' ? (
                            <X size={16} />
                          ) : (
                            <CircleHelp size={16} />
                          )}
                          <span>{c.title}</span>
                        </summary>
                        <p>{c.detail}</p>
                      </details>
                    ))}
                    <h3 className="subheading">След расчёта</h3>
                    <div className="trace-list">
                      {current.trace.map((t, i) => (
                        <div key={i}>
                          <code>{t.event}</code>
                          <p>{t.detail}</p>
                        </div>
                      ))}
                    </div>
                    <p className="hash-line">
                      SHA-256 входа
                      <br />
                      <code>{current.inputHash}</code>
                    </p>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </aside>
        <section className="results-strip">
          <div className="metric">
            <span>Завершение работ</span>
            <strong>
              {current ? fmt(current.metrics.makespanSec / 60) : '—'}
              <small>мин</small>
            </strong>
          </div>
          <div className="metric">
            <span>Суммарный налёт</span>
            <strong>
              {current ? fmt(current.metrics.flightTimeSec / 60) : '—'}
              <small>мин</small>
            </strong>
          </div>
          <div className="metric">
            <span>Длина маршрутов</span>
            <strong>
              {current ? fmt(current.metrics.distanceM / 1000) : '—'}
              <small>км</small>
            </strong>
          </div>
          <div className="metric">
            <span>Доступная область</span>
            <strong>
              {current ? fmt(current.metrics.targetHa) : '—'}
              <small>га</small>
            </strong>
          </div>
          <div className="metric">
            <span>Геом. покрытие</span>
            <strong>
              {current ? fmt(current.metrics.coveragePct) : '—'}
              <small>%</small>
            </strong>
          </div>
          <div className="metric comparison">
            <span>К baseline по критерию</span>
            <strong>
              {gain === null
                ? '—'
                : `${gain >= 0 ? '−' : '+'}${fmt(Math.abs(gain))}`}
              <small>{gain !== null ? '%' : ''}</small>
            </strong>
            <small>
              {current
                ? `${current.metrics.stripCount} проходов · ${current.metrics.bearingDeg}°`
                : 'Нет актуального расчёта'}
            </small>
          </div>
        </section>
        <section className="playback-panel">
          <div className="playback-heading">
            <div>
              <Activity size={16} />
              <b>Проигрывание плана</b>
              <span>Модель · не телеметрия</span>
            </div>
            <span>
              {current
                ? `${fmt(current.computationMs, 0)} мс · ядро ${current.engineVersion}`
                : 'Ожидание расчёта'}
            </span>
          </div>
          <div className="playback-controls">
            <button
              className="play-button"
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              disabled={!current}
              onClick={() => {
                if (current && time >= current.metrics.makespanSec) setTime(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className="reset-button"
              aria-label="Сначала"
              onClick={() => {
                setPlaying(false);
                setTime(0);
              }}
            >
              <RotateCcw size={16} />
            </button>
            <code>{clock(time)}</code>
            <input
              className="time-range"
              aria-label="Время моделирования"
              type="range"
              min={0}
              max={current?.metrics.makespanSec || 1}
              step={1}
              value={time}
              disabled={!current}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
              }}
            />
            <code>{clock(current?.metrics.makespanSec ?? 0)}</code>
            <select
              aria-label="Скорость проигрывания"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            >
              <option value={1}>1×</option>
              <option value={20}>20×</option>
              <option value={60}>60×</option>
            </select>
          </div>
          <div className="flight-timelines">
            {current?.missions.map((m) => (
              <div className="flight-timeline" key={m.vehicleId}>
                <span>{m.name}</span>
                <div>
                  {m.segments.map((s, i) => (
                    <i
                      key={i}
                      title={`${phases[s.phase]} · ${clock(s.endSec - s.startSec)}`}
                      className={`phase-${s.phase}`}
                      style={{
                        left: `${(s.startSec / current.metrics.makespanSec) * 100}%`,
                        width: `${((s.endSec - s.startSec) / current.metrics.makespanSec) * 100}%`,
                        background:
                          flightColors[
                            scenario.vehicles.findIndex(
                              (v) => v.id === m.vehicleId,
                            )
                          ],
                      }}
                    />
                  ))}
                  <b
                    className="playhead"
                    style={{
                      left: `${(time / current.metrics.makespanSec) * 100}%`,
                    }}
                  />
                </div>
                <code>{clock(m.durationSec)}</code>
              </div>
            ))}
          </div>
        </section>
        <section className="export-panel">
          <h3>
            <ArrowDownToLine size={17} />
            Выходные файлы
          </h3>
          <p>Для анализа. Импорт в наземную станцию не подтверждён.</p>
          <select
            aria-label="БВС для экспорта маршрута"
            value={exportScope}
            onChange={(e) => setExportScope(e.target.value)}
          >
            <option value="all">Все БВС одним файлом</option>
            {current?.missions.map((m) => (
              <option key={m.vehicleId} value={m.vehicleId}>
                {m.name}
              </option>
            ))}
          </select>
          <div>
            <Button
              variant="outline"
              disabled={!current || current.status === 'invalid'}
              onClick={() => exportPlan('geojson')}
            >
              GeoJSON
            </Button>
            <Button
              variant="outline"
              disabled={!current || current.status === 'invalid'}
              onClick={() => exportPlan('kml')}
            >
              KML
            </Button>
            <Button
              variant="outline"
              disabled={!current || current.status === 'invalid'}
              onClick={() => exportPlan('evidence')}
            >
              <FileJson />
              Доказательства
            </Button>
          </div>
        </section>
      </div>
      <footer className="planner-status">
        <span>
          <TriangleAlert size={14} />
          Инженерная версия · не допуск к полёту
        </span>
        <span>
          {stale
            ? 'Есть изменения'
            : current
              ? `Результат: ${current.status === 'invalid' ? 'есть нарушения' : 'нужна верификация'}`
              : 'Нет результата'}
        </span>
        <button
          onClick={() => {
            update(() => demoScenario());
            setPlan(null);
            setSelected('gemini-01');
            setFit((n) => n + 1);
            setNotice('Учебный сценарий восстановлен. Нажмите «Рассчитать».');
          }}
        >
          Сбросить к демо
        </button>
      </footer>
      {notice && (
        <output className="planner-notice">
          {notice}
          <button
            aria-label="Закрыть уведомление"
            onClick={() => setNotice('')}
          >
            <X size={16} />
          </button>
        </output>
      )}
    </main>
  );
}
