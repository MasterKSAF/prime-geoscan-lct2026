'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  Archive,
  ArrowDownToLine,
  BatteryMedium,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Compass,
  Crosshair,
  Download,
  FileCheck2,
  FolderOpen,
  Layers,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Square,
  TriangleAlert,
  Upload,
  Wind,
  X,
} from 'lucide-react';
import { demoMission } from '@/lib/planner/mission-demo';
import {
  canonicalStringify,
  parseMissionDocument,
  sha256,
} from '@/lib/planner/mission-schema';
import type {
  MissionApproval,
  MissionCandidate,
  MissionDocument,
  MissionResult,
} from '@/lib/planner/mission-schema';
import type {
  Coordinate,
  Mission,
  Plan,
  Polygon,
  Scenario,
  Segment,
} from '@/lib/planner/schema';
import {
  importGeometryText,
  MAX_MISSION_FILE_BYTES,
  missionSummaryMarkdown,
  parseMissionText,
  parseSizedMissionDocument,
  serializeMissionJson,
  serializeMissionYaml,
} from '@/lib/planner/mission-io';
import type { GeometryRole } from '@/lib/planner/mission-io';
import { createMissionLibrary } from '@/lib/planner/mission-library';
import type {
  MissionLibrary,
  SavedMission,
} from '@/lib/planner/mission-library';
import {
  missionEvidence,
  missionGeoJSON,
  missionKML,
} from '@/lib/planner/mission-export';
import MissionMap, { flightColors } from './mission-map';
import type { DrawMode } from './mission-map';
import MissionWizard, { jobNames } from './mission-wizard';
import Link from 'next/link';
import MissionBrief from './mission-brief';
import MissionGallery from './mission-gallery';
import MissionComparisonView from './mission-comparison-view';
import {
  appendRestrictionLayer,
  parseRestrictionLayer,
  restrictionFromPolygon,
  serializeRestrictionLayer,
} from '@/lib/planner/mission-layers';
import type { RestrictionLayer } from '@/lib/planner/mission-layers';

const candidateTitle = (c: MissionCandidate) =>
  c.id === 'balanced'
    ? 'Баланс времени и ресурса'
    : c.objective === 'makespan'
      ? 'Раньше закончить'
      : 'Меньше летать';

const fmt = (n: number, digits = 1) =>
  Number.isFinite(n)
    ? n.toLocaleString('ru-RU', { maximumFractionDigits: digits })
    : '—';
const elapsed = (s: number) =>
  `${Math.floor(s / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((s / 60) % 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;
const phaseNames: Record<string, string> = {
  takeoff: 'Взлёт',
  transit: 'Переход',
  survey: 'Работа сенсора',
  turn: 'Манёвр',
  return: 'Возврат',
  landing: 'Посадка',
  prepare: 'Подготовка',
  service: 'Обслуживание',
  battery: 'Замена АКБ',
  complete: 'Работы завершены',
};
const candidateNames: Record<MissionCandidate['status'], string> = {
  feasible_model: 'Выполним в модели',
  invalid: 'Нарушены ограничения',
  not_found: 'Не найден за бюджет',
  partial: 'Частичное покрытие',
  unsupported: 'Нужен другой профиль',
};
function download(name: string, body: string, mime = 'application/json') {
  const a = window.document.createElement('a');
  const url = URL.createObjectURL(
    new Blob([body], { type: `${mime};charset=utf-8` }),
  );
  a.href = url;
  a.download = name.replace(/[^\p{L}\p{N}_.-]+/gu, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const rows = JSON.parse(error.message);
      if (Array.isArray(rows))
        return rows
          .map((r) => `${r.path?.join('.') || 'Документ'}: ${r.message}`)
          .join(' · ');
    } catch {
      /* ordinary error */
    }
    return error.message;
  }
  return 'Операция не выполнена.';
}
function timestamp(document: MissionDocument, seconds: number) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: document.window.timezone,
    }).format(new Date(Date.parse(document.window.start) + seconds * 1000));
  } catch {
    return 'Неверная дата';
  }
}
function Modal({
  title,
  children,
  footer,
  onClose,
  error,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  error?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className={`mw-modal ${wide ? 'ms-modal-wide' : ''}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="mw-modal-head">
        <h2>{title}</h2>
        <button
          className="mw-button square quiet"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="mw-modal-body">
        {error && (
          <div className="mw-alert error" role="alert">
            {error}
          </div>
        )}
        {children}
      </div>
      {footer && <div className="mw-modal-footer">{footer}</div>}
    </dialog>
  );
}

/** A display-only projection. Ground waits bridge absolute sortie timestamps; no second simulation route is fabricated. */
function mapPlan(
  candidate: MissionCandidate | null,
  scenario: Scenario,
): Plan | null {
  if (!candidate) return null;
  const missions: Mission[] = [];
  for (const vehicle of scenario.vehicles) {
    const sorties = candidate.sorties
      .filter((s) => s.vehicleId === vehicle.id)
      .sort((a, b) => a.startSec - b.startSec);
    if (!sorties.length) continue;
    const segments: Segment[] = [];
    for (const sortie of sorties) {
      const previous = segments.at(-1),
        next = sortie.segments[0];
      if (previous && next && next.startSec > previous.endSec)
        segments.push({
          ...previous,
          from: previous.to,
          to: previous.to,
          phase: 'turn',
          startSec: previous.endSec,
          endSec: next.startSec,
          altitudeFromM: 0,
          altitudeToM: 0,
          distanceM: 0,
          groundSpeedMps: 0,
          airspeedMps: 0,
          batteryFromPct: previous.batteryToPct,
          batteryToPct: previous.batteryToPct,
        });
      segments.push(...sortie.segments);
    }
    missions.push({
      vehicleId: vehicle.id,
      name: vehicle.name,
      segments,
      durationSec: sorties.at(-1)!.endSec,
      distanceM: sorties.reduce((s, x) => s + x.distanceM, 0),
      remainingPct: sorties.at(-1)!.remainingPct,
      strips: sorties.reduce((s, x) => s + x.strips, 0),
      shots: sorties.every((s) => s.shots !== null)
        ? sorties.reduce((s, x) => s + (x.shots ?? 0), 0)
        : null,
    });
  }
  return { ...candidate.plan, scenario, missions };
}

export default function MissionWorkbench() {
  const [document, setDocument] = useState<MissionDocument>(() =>
    demoMission(1),
  );
  const [result, setResult] = useState<MissionResult | null>(null),
    [candidateId, setCandidateId] = useState('');
  const [approval, setApproval] = useState<MissionApproval | null>(null),
    [acknowledged, setAcknowledged] = useState(false);
  const [wizard, setWizard] = useState(true),
    [jobIndex, setJobIndex] = useState(0),
    [selected, setSelected] = useState('gemini-1');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(40);
  const [mode, setMode] = useState<DrawMode>(null),
    [draft, setDraft] = useState<Coordinate[]>([]),
    [fit, setFit] = useState(0),
    [showTiles, setShowTiles] = useState(true),
    [showTransit, setShowTransit] = useState(true);
  const [modal, setModal] = useState<
    | 'library'
    | 'preview'
    | 'geometry'
    | 'approval'
    | 'backup'
    | 'catalog'
    | 'overview'
    | 'saveas'
    | 'layers'
    | 'comparison'
    | null
  >(null);
  const [copyId, setCopyId] = useState(''),
    [copyName, setCopyName] = useState(''),
    [copyBusy, setCopyBusy] = useState(false);
  const [layerPreview, setLayerPreview] = useState<RestrictionLayer | null>(
      null,
    ),
    [obstacleHeight, setObstacleHeight] = useState('120');
  const [backupPreview, setBackupPreview] = useState<{
    name: string;
    text: string;
    count: number;
  } | null>(null);
  const [preview, setPreview] = useState<MissionDocument | null>(null),
    [previewName, setPreviewName] = useState('');
  const [geometry, setGeometry] = useState<{
      text: string;
      format: 'geojson' | 'kml';
      name: string;
    } | null>(null),
    [geometryRole, setGeometryRole] = useState<GeometryRole>('area');
  const [libraryRows, setLibraryRows] = useState<SavedMission[]>([]),
    [savedRevision, setSavedRevision] = useState<number | undefined>(),
    [archiveId, setArchiveId] = useState<string | null>(null),
    [exportVehicle, setExportVehicle] = useState('all'),
    [dirty, setDirty] = useState(false);
  const library = useRef<MissionLibrary | null>(null),
    request = useRef<AbortController | null>(null),
    revision = useRef(0),
    calculationSequence = useRef(0),
    file = useRef<HTMLInputElement>(null),
    geoFile = useRef<HTMLInputElement>(null),
    backupFile = useRef<HTMLInputElement>(null),
    layerFile = useRef<HTMLInputElement>(null);
  const currentJob = document.jobs[jobIndex] ?? document.jobs[0];
  const stale =
    !!result &&
    canonicalStringify(result.document) !== canonicalStringify(document);
  const current = result && !stale ? result : null;
  const currentCandidates = current
    ? [
        ...current.candidates,
        ...(current.recommendation ? [current.recommendation.candidate] : []),
      ]
    : [];
  const candidate =
    (candidateId === 'balanced'
      ? current?.recommendation?.candidate
      : current?.candidates.find((c) => c.id === candidateId)) ??
    current?.candidates[0] ??
    null;
  const isApproved =
    !!approval &&
    !!candidate &&
    approval.inputHash === current?.inputHash &&
    approval.candidateId === candidate.id;
  const activeVehicle =
    document.scenario.vehicles.find((v) => v.id === selected) ??
    document.scenario.vehicles[0];
  const duration = candidate?.metrics.makespanSec ?? 0;
  const activeRestrictionIds = document.restrictions
    .filter(
      (r) =>
        !r.startAt ||
        (Date.parse(document.window.start) + time * 1000 >=
          Date.parse(r.startAt) &&
          Date.parse(document.window.start) + time * 1000 <
            Date.parse(r.endAt!)),
    )
    .map((r) => r.id)
    .join('|');
  // Change route layers only when geometry or active zones change, not on every 100 ms playback tick.
  const sceneScenario = useMemo<Scenario>(
    () => ({
      ...document.scenario,
      name: document.name,
      area: currentJob.area,
      job: currentJob.job,
      exclusions: [
        ...document.scenario.exclusions,
        ...document.restrictions
          .filter((r) => activeRestrictionIds.split('|').includes(r.id))
          .map((r) => r.geometry),
      ],
    }),
    [document, currentJob, activeRestrictionIds],
  );
  const scenePlan = useMemo(
    () => mapPlan(candidate, sceneScenario),
    [candidate, sceneScenario],
  );
  const activeSortie = candidate?.sorties.find(
    (s) =>
      s.vehicleId === activeVehicle.id && time >= s.startSec && time < s.endSec,
  );
  const activeSegment = activeSortie?.segments.find(
    (s) => time >= s.startSec && time < s.endSec,
  );
  const lastSortie = candidate?.sorties
    .filter((s) => s.vehicleId === activeVehicle.id && s.endSec <= time)
    .sort((a, b) => b.endSec - a.endSec)[0];
  const nextSortie = candidate?.sorties
    .filter((s) => s.vehicleId === activeVehicle.id && s.startSec > time)
    .sort((a, b) => a.startSec - b.startSec)[0];
  const progress = activeSegment
    ? Math.min(
        1,
        Math.max(
          0,
          (time - activeSegment.startSec) /
            Math.max(0.001, activeSegment.endSec - activeSegment.startSec),
        ),
      )
    : 0;
  const battery = activeSegment
    ? activeSegment.batteryFromPct +
      (activeSegment.batteryToPct - activeSegment.batteryFromPct) * progress
    : (lastSortie?.remainingPct ??
      document.batteries.find((b) => b.vehicleId === activeVehicle.id)
        ?.initialPct);
  const stateLabel = activeSegment
    ? phaseNames[activeSegment.phase]
    : nextSortie
      ? lastSortie
        ? 'Обслуживание / ожидание'
        : 'Подготовка / ожидание'
      : lastSortie
        ? 'Работы завершены'
        : 'Не назначен';
  const validation = useMemo(() => {
    try {
      parseMissionDocument(document);
      return '';
    } catch (e) {
      return errorMessage(e);
    }
  }, [document]);
  const geometryPreview = useMemo(() => {
    if (!geometry) return { data: null, error: '' };
    try {
      return {
        data: importGeometryText(geometry.text, geometry.format, geometryRole),
        error: '',
      };
    } catch (e) {
      return { data: null, error: errorMessage(e) };
    }
  }, [geometry, geometryRole]);

  useEffect(() => {
    library.current = createMissionLibrary();
    return () => {
      library.current?.close();
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!playing || !isApproved || !candidate) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        dt = (now - previous) / 1000;
      previous = now;
      setTime((t) => {
        const next = Math.min(duration, t + dt * rate);
        if (next >= duration) setPlaying(false);
        return next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [playing, isApproved, candidate, duration, rate]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  function edit(next: MissionDocument) {
    revision.current++;
    request.current?.abort();
    setBusy(false);
    setPlaying(false);
    setApproval(null);
    setTime(0);
    setError('');
    setDirty(true);
    setDocument(next);
  }
  function openPreview(next: MissionDocument, label: string) {
    setError('');
    setPreview(next);
    setPreviewName(label);
    setPlaying(false);
    setModal('preview');
  }
  function acceptPreview() {
    if (!preview) return;
    edit(preview);
    setSavedRevision(undefined);
    setResult(null);
    setJobIndex(0);
    setSelected(preview.scenario.vehicles[0].id);
    setFit((x) => x + 1);
    setMode(null);
    setDraft([]);
    setModal(null);
    setWizard(true);
    setNotice(
      `Миссия ${preview.id} загружена: ${preview.jobs.length} работ. Паспорт содержит полное описание; изменения доступны в мастере.`,
    );
  }
  async function calculate() {
    request.current?.abort();
    const controller = new AbortController(),
      rev = revision.current,
      sequence = ++calculationSequence.current;
    request.current = controller;
    setError('');
    setPlaying(false);
    setApproval(null);
    setTime(0);
    try {
      const input = parseMissionDocument(document);
      setBusy(true);
      const response = await fetch('/api/planner/missions/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const data = (await response.json()) as MissionResult & {
        error?: string;
        details?: string[];
      };
      if (!response.ok)
        throw new Error(
          [data.error, ...(data.details ?? [])].filter(Boolean).join(' · ') ||
            `Ошибка сервера ${response.status}`,
        );
      if (
        rev !== revision.current ||
        sequence !== calculationSequence.current ||
        controller.signal.aborted
      )
        return;
      setResult(data);
      setCandidateId(
        data.candidates.find((c) => c.objective === input.scenario.objective)
          ?.id ??
          data.candidates[0]?.id ??
          '',
      );
      setWizard(false);
      setNotice(
        'Варианты рассчитаны. Проверьте ограничения и подтвердите выбранный план перед симуляцией.',
      );
    } catch (e) {
      if (
        !controller.signal.aborted &&
        rev === revision.current &&
        sequence === calculationSequence.current
      ) {
        setError(errorMessage(e));
        setResult(null);
      }
    } finally {
      if (rev === revision.current && sequence === calculationSequence.current)
        setBusy(false);
    }
  }
  async function approve() {
    if (
      !candidate ||
      !current ||
      !acknowledged ||
      candidate.status !== 'feasible_model' ||
      candidate.checks.some((c) => c.status === 'fail')
    )
      return;
    const rev = revision.current,
      inputHash = current.inputHash,
      id = candidate.id;
    const planHash = await sha256(candidate);
    if (rev !== revision.current) return;
    setApproval({
      inputHash,
      candidateId: id,
      planHash,
      approvedAt: new Date().toISOString(),
    });
    setModal(null);
    setTime(0);
    setNotice(
      'Выбранный план подтверждён для модельной симуляции. Изменение задания отменит это подтверждение.',
    );
  }
  async function save(copy = false) {
    try {
      const rev = revision.current;
      const d = parseMissionDocument(document),
        next = copy
          ? {
              ...d,
              id: `mission-${Date.now()}`,
              name: `${d.name.slice(0, 90)} · копия`,
            }
          : d;
      if (!library.current)
        throw new Error(
          'Локальная библиотека недоступна. Выгрузите JSON как резервную копию.',
        );
      const saved = await library.current.save(
        next,
        copy ? {} : { expectedRevision: savedRevision },
      );
      if (rev === revision.current) {
        if (copy) edit(saved.document);
        setDirty(false);
        setSavedRevision(saved.revision);
      }
      setLibraryRows(await library.current.list());
      setNotice(
        `Сохранено локально: версия ${saved.revision}. Рекомендуется также выгрузить файл.`,
      );
    } catch (e) {
      setError(
        `${errorMessage(e)} Если ID занят другой версией, используйте «Сохранить копию» в библиотеке.`,
      );
    }
  }
  async function showLibrary() {
    setError('');
    setModal('library');
    setArchiveId(null);
    try {
      setLibraryRows(await library.current!.list());
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function showSaveAs() {
    setCopyId(`mission-${Date.now()}`);
    setCopyName(`${document.name.slice(0, 90)} · копия`);
    setError('');
    setPlaying(false);
    setModal('saveas');
  }
  async function saveAs() {
    if (copyBusy) return;
    setCopyBusy(true);
    setError('');
    const rev = revision.current;
    try {
      if (copyId === document.id)
        throw new Error(
          'Для копии укажите другой ID. Исходная миссия не перезаписывается.',
        );
      const next = parseMissionDocument({
        ...document,
        id: copyId,
        name: copyName,
        scenario: { ...document.scenario, name: copyName },
      });
      if (!library.current)
        throw new Error(
          'Библиотека недоступна. Сохраните задание файлом JSON.',
        );
      const saved = await library.current.save(next, {});
      if (revision.current === rev) {
        edit(saved.document);
        setResult(null);
        setSavedRevision(saved.revision);
        setDirty(false);
        setModal(null);
        setNotice(
          `Сохранена новая миссия ${saved.id}. Исходная запись не изменена; новая версия требует расчёта.`,
        );
      }
      setLibraryRows(await library.current.list());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCopyBusy(false);
    }
  }
  function showLayers() {
    setLayerPreview(null);
    setError('');
    setPlaying(false);
    setModal('layers');
  }
  async function loadFile(f: File, geometryOnly = false) {
    try {
      if (f.size > MAX_MISSION_FILE_BYTES)
        throw new Error(
          'Файл больше 200 КиБ. Упростите геометрию или разделите вход.',
        );
      const text = await f.text();
      if (geometryOnly) {
        setError('');
        setGeometry({
          text,
          format: /\.kml$/i.test(f.name) ? 'kml' : 'geojson',
          name: f.name,
        });
        setGeometryRole('area');
        setModal('geometry');
      } else
        openPreview(
          parseMissionText(text, /\.ya?ml$/i.test(f.name) ? 'yaml' : 'auto'),
          f.name,
        );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function applyGeometry() {
    const data = geometryPreview.data;
    if (!data) return;
    const d = structuredClone(document),
      polygons = data.features
        .filter((f) => f.geometry.type === 'Polygon')
        .map((f) => ({ ...f, geometry: f.geometry as Polygon })),
      points = data.features
        .filter((f) => f.geometry.type === 'Point')
        .map(
          (f) =>
            (f.geometry as { type: 'Point'; coordinates: Coordinate })
              .coordinates,
        );
    if (geometryRole === 'area') {
      if (d.jobs.length - 1 + polygons.length > 8) {
        setError(
          'После импорта получится более 8 работ. Ни одна область не добавлена.',
        );
        return;
      }
      d.jobs.splice(
        jobIndex,
        1,
        ...polygons.map((f, i) => ({
          ...structuredClone(currentJob),
          id: i === 0 ? currentJob.id : `import-${Date.now()}-${i}`,
          name: f.name.slice(0, 100) || `Область ${i + 1}`,
          area: f.geometry,
        })),
      );
    } else if (geometryRole === 'airspace')
      d.scenario.airspace = polygons[0].geometry;
    else if (geometryRole === 'exclusion') {
      if (d.scenario.exclusions.length + polygons.length > 5) {
        setError(
          'Можно хранить до 5 постоянных запретов. Удалите ненужные; ничего не добавлено.',
        );
        return;
      }
      d.scenario.exclusions.push(...polygons.map((p) => p.geometry));
    } else if (geometryRole === 'obstacle') {
      try {
        const added = polygons.map((p, i) =>
          restrictionFromPolygon(
            p.geometry,
            `volume-${Date.now()}-${i}`,
            p.name.slice(0, 100),
            obstacleHeight.trim() === '' ? null : Number(obstacleHeight),
            `Контур ${geometry?.name}; высота задана оператором в общем локальном уровне миссии. Не DEM.`,
          ),
        );
        d.restrictions = appendRestrictionLayer(d, {
          type: 'prime-restrictions',
          schemaVersion: '1.0',
          altitudeReference: 'mission-reference',
          source: 'Объёмы из координатного слоя',
          restrictions: added,
        }).restrictions;
      } catch (e) {
        setError(errorMessage(e));
        return;
      }
    } else if (geometryRole === 'reserve') {
      if (d.scenario.reserveSites.length + points.length > 10) {
        setError(
          'Можно хранить до 10 резервных площадок; ничего не добавлено.',
        );
        return;
      }
      d.scenario.reserveSites.push(...points);
    } else
      d.scenario.vehicles = d.scenario.vehicles.map((v) =>
        v.id === activeVehicle.id ? { ...v, [geometryRole]: points[0] } : v,
      );
    try {
      edit(parseSizedMissionDocument(d));
      setFit((n) => n + 1);
      setModal(null);
      setNotice(
        `Геометрия применена: ${data.features.length} объектов. Подтверждение прежнего плана отменено.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function startDrawing(drawMode: DrawMode) {
    setDraft([]);
    setMode(drawMode);
    setPlaying(false);
  }
  function mapPoint(point: Coordinate) {
    if (!mode) return;
    if (mode === 'start' || mode === 'landing') {
      edit({
        ...document,
        scenario: {
          ...document.scenario,
          vehicles: document.scenario.vehicles.map((v) =>
            v.id === activeVehicle.id ? { ...v, [mode]: point } : v,
          ),
        },
      });
      setMode(null);
    } else if (mode === 'reserve') {
      if (document.scenario.reserveSites.length >= 10) {
        setError('Достигнут предел 10 резервных площадок.');
        return;
      }
      edit({
        ...document,
        scenario: {
          ...document.scenario,
          reserveSites: [...document.scenario.reserveSites, point],
        },
      });
      setMode(null);
    } else if (draft.length < 69) setDraft((points) => [...points, point]);
    else setError('В одном контуре допускается до 69 вершин.');
  }
  function finishDrawing() {
    if (draft.length < 3) return;
    const shape: Polygon = {
      type: 'Polygon',
      coordinates: [[...draft, draft[0]]],
    };
    if (mode === 'area')
      edit({
        ...document,
        jobs: document.jobs.map((j) =>
          j.id === currentJob.id ? { ...j, area: shape } : j,
        ),
      });
    else if (mode === 'airspace')
      edit({
        ...document,
        scenario: { ...document.scenario, airspace: shape },
      });
    else if (mode === 'exclusion') {
      if (document.restrictions.length >= 20) {
        setError('Достигнут предел 20 ограничений.');
        return;
      }
      edit({
        ...document,
        restrictions: [
          ...document.restrictions,
          {
            id: `zone-${Date.now()}`,
            name: `Запрет ${document.restrictions.length + 1}`,
            kind: 'noFlight',
            geometry: shape,
            minAltitudeM: 0,
            maxAltitudeM: null,
            startAt: null,
            endAt: null,
            source:
              'Нарисовано оператором; учебная зона, не официальное воздушное ограничение.',
          },
        ],
      });
    }
    setMode(null);
    setDraft([]);
  }
  function exportTask(format: 'json' | 'yaml' | 'md') {
    try {
      download(
        `${document.id}.mission.${format}`,
        format === 'json'
          ? serializeMissionJson(document)
          : format === 'yaml'
            ? serializeMissionYaml(document)
            : missionSummaryMarkdown(document),
        format === 'json' ? 'application/json' : 'text/plain',
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function exportPlan(format: 'json' | 'kml' | 'geojson' | 'evidence') {
    if (!candidate || !current) return;
    try {
      const scope = exportVehicle === 'all' ? undefined : exportVehicle;
      if (format === 'evidence')
        download(
          `${document.id}.evidence.json`,
          JSON.stringify(
            await missionEvidence(current, candidate, approval ?? undefined),
            null,
            2,
          ),
        );
      else if (format === 'kml')
        download(
          `${document.id}.${scope ?? 'all'}.kml`,
          missionKML(document, candidate, scope),
          'application/vnd.google-earth.kml+xml',
        );
      else if (format === 'geojson')
        download(
          `${document.id}.${scope ?? 'all'}.geojson`,
          JSON.stringify(missionGeoJSON(document, candidate, scope), null, 2),
          'application/geo+json',
        );
      else
        download(
          `${document.id}.plan.json`,
          JSON.stringify(
            { result: current, selectedCandidateId: candidate.id, approval },
            null,
            2,
          ),
        );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const checkCounts = {
    pass: candidate?.checks.filter((c) => c.status === 'pass').length ?? 0,
    fail: candidate?.checks.filter((c) => c.status === 'fail').length ?? 0,
    unknown:
      candidate?.checks.filter((c) => c.status === 'unknown').length ?? 0,
  };
  const onModalClose = () => {
    setModal(null);
    setArchiveId(null);
  };
  return (
    <main className="mission-workbench">
      <header className="mw-header">
        <div className="mw-brand">
          <Compass size={32} />
          <strong>
            ПРАЙМ<small>MISSION PLANNER</small>
          </strong>
        </div>
        <div className="mw-header-label">
          <b>Групповые авиационные работы</b>Геоскан · ЛЦТ 2026 · задача №5
        </div>
        <div className="mw-header-actions">
          <Link
            className="mw-button small quiet"
            href="/planner/legacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Диагностика v1
          </Link>
          <span className="mw-badge">
            <Activity size={12} />
            CPU · МОДЕЛЬНЫЙ СТЕНД
          </span>
          <button className="mw-button" onClick={showLibrary}>
            <FolderOpen size={15} />
            Библиотека
          </button>
          <button
            className="mw-button"
            onClick={() => {
              setPlaying(false);
              setError('');
              setModal('catalog');
            }}
          >
            <Layers size={15} />
            Сценарии
          </button>
          <button className="mw-button" onClick={showLayers}>
            Слои карты
          </button>
          <button className="mw-button" onClick={() => file.current?.click()}>
            <Upload size={15} />
            Импорт
          </button>
        </div>
      </header>
      <section className="mw-titlebar">
        <div>
          <h1>{document.name || 'Новая миссия'}</h1>
          <p>
            {document.jobs.length} работ ·{' '}
            {document.scenario.vehicles.filter((v) => v.enabled).length}{' '}
            доступных БВС · схема {document.schemaVersion} ·{' '}
            {document.window.timezone}
          </p>
          <span className="ms-mission-id">
            МИССИЯ {document.id}
            {savedRevision
              ? ` · ревизия ${savedRevision}`
              : ' · не сохранена в этой сессии'}
          </span>
        </div>
        <div className="mw-actions">
          <button
            className="mw-button"
            onClick={() => {
              setPlaying(false);
              setError('');
              setModal('overview');
            }}
          >
            Паспорт миссии
          </button>
          <button
            className="mw-button"
            onClick={() => {
              setWizard((w) => !w);
              setPlaying(false);
            }}
          >
            <Settings2 size={15} />
            {wizard ? 'Обзор задания' : 'Изменить задание'}
          </button>
          <button className="mw-button" onClick={() => void save()}>
            <Save size={15} />
            Сохранить
          </button>
          <button className="mw-button" onClick={showSaveAs}>
            Сохранить как
          </button>
          <button
            className="mw-button primary"
            disabled={busy || !!validation}
            onClick={calculate}
          >
            {busy ? (
              <LoaderCircle size={15} className="mw-spinner" />
            ) : (
              <Play size={15} />
            )}
            {busy ? 'Расчёт вариантов…' : 'Рассчитать варианты'}
          </button>
          {busy && (
            <button
              className="mw-button"
              onClick={() => {
                request.current?.abort();
                calculationSequence.current++;
                setBusy(false);
                setNotice(
                  'Ожидание расчёта отменено. Серверный поиск ограничен заданным бюджетом.',
                );
              }}
            >
              Отмена
            </button>
          )}
        </div>
      </section>
      <div className="mw-process" aria-label="Состояние миссии">
        {[
          'Задание',
          'Расчёт вариантов',
          'Подтверждение',
          'Симуляция',
          'Экспорт',
        ].map((label, index) => (
          <span
            key={label}
            className={
              index === (isApproved ? (time > 0 ? 3 : 2) : candidate ? 1 : 0)
                ? 'active'
                : ''
            }
          >
            {index > 0 && <em />}
            <i>{index + 1}</i>
            {label}
          </span>
        ))}
      </div>
      {error && (
        <div className="mw-alert error" role="alert">
          <TriangleAlert size={16} />
          <span>{error}</span>
          <button
            className="mw-button small quiet"
            style={{ marginLeft: 'auto' }}
            aria-label="Закрыть ошибку"
            onClick={() => setError('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {validation && (
        <div className="mw-alert error" role="alert">
          <TriangleAlert size={16} />
          <span>Исправьте ввод: {validation}</span>
        </div>
      )}
      {notice && (
        <output className="mw-alert success">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </output>
      )}
      {stale && (
        <div className="mw-alert">
          <TriangleAlert size={16} />
          <span>
            Задание изменено. Предыдущие маршруты и подтверждение не
            используются. Нужен новый расчёт.
          </span>
        </div>
      )}
      <div className="mw-grid">
        <aside className="mw-sidebar">
          <div className="mw-panel-head">
            <Layers size={16} />
            <h2>{wizard ? 'Мастер миссии' : 'Состав задания'}</h2>
            <small>2D</small>
          </div>
          {wizard ? (
            <MissionWizard
              document={document}
              onChange={edit}
              selectedJob={jobIndex}
              onSelectJob={(n) => {
                setJobIndex(n);
                setFit((x) => x + 1);
              }}
              onDraw={startDrawing}
              onImportGeometry={() => geoFile.current?.click()}
              onExample={(n) =>
                openPreview(demoMission(n), `Контрольный сценарий ${n} км²`)
              }
              onDone={() => {
                if (!validation) void calculate();
                else setError(validation);
              }}
              onSave={() => void save()}
            />
          ) : (
            <>
              <div className="mw-tree-section">
                <div className="mw-section-label">Территория и работы</div>
                {document.jobs.map((j, i) => (
                  <button
                    className={`mw-choice ${jobIndex === i ? 'active' : ''}`}
                    key={j.id}
                    onClick={() => {
                      setJobIndex(i);
                      setFit((n) => n + 1);
                    }}
                  >
                    <MapPin size={15} />
                    <span>
                      <strong>{j.name}</strong>
                      <small>
                        {jobNames[j.job.type]} · {j.job.altitudeM} м
                      </small>
                    </span>
                  </button>
                ))}
                <div className="mw-tree-row">
                  <span className="mw-dot" style={{ background: '#789584' }} />
                  <strong>Граница полётов</strong>
                  <small>задана</small>
                </div>
                <div className="mw-tree-row">
                  <span className="mw-dot" style={{ background: '#bd6b5f' }} />
                  <strong>Запреты / препятствия</strong>
                  <small>
                    {document.restrictions.length +
                      document.scenario.exclusions.length}
                  </small>
                </div>
              </div>
              <div className="mw-tree-section">
                <div className="mw-section-label">Парк БВС</div>
                {document.scenario.vehicles.map((v, i) => (
                  <button
                    key={v.id}
                    className={`mw-card mw-vehicle ${v.id === selected ? 'selected' : ''}`}
                    onClick={() => setSelected(v.id)}
                  >
                    <div>
                      <span
                        className="mw-dot"
                        style={{
                          background: flightColors[i % flightColors.length],
                        }}
                      />
                      <strong>{v.name}</strong>
                    </div>
                    <p className="mw-caption">
                      {v.enabled ? 'Доступен' : 'Исключён'} ·{' '}
                      {v.jobs.join(' / ')} ·{' '}
                      {
                        document.batteries.filter((b) => b.vehicleId === v.id)
                          .length
                      }{' '}
                      АКБ
                    </p>
                  </button>
                ))}
              </div>
              <div className="mw-tree-section">
                <div className="mw-tree-row">
                  <Wind size={15} />
                  {document.scenario.wind.speedMps} м/с · от{' '}
                  {document.scenario.wind.fromDeg}°
                </div>
                <div className="mw-tree-row">
                  <BatteryMedium size={15} />
                  Резерв {document.scenario.reservePct}%
                </div>
                <p className="mw-caption">
                  Подложка OSM не содержит официальных разрешений. Базы и
                  границы учебного сценария синтетические.
                </p>
              </div>
            </>
          )}
        </aside>
        <section
          className="mw-map-wrap"
          aria-label="Карта задания и рассчитанных маршрутов"
        >
          <MissionMap
            scenario={sceneScenario}
            plan={scenePlan}
            selected={selected}
            time={time}
            mode={mode}
            draft={draft}
            onPoint={mapPoint}
            fit={fit}
            showTiles={showTiles}
            showTransit={showTransit}
          />
          <div className="mw-map-tools">
            <button
              className="mw-button square"
              title="Показать всю область"
              aria-label="Показать всю область"
              onClick={() => setFit((n) => n + 1)}
            >
              <Crosshair size={17} />
            </button>
            <button
              className={`mw-button square ${mode === 'area' ? 'active' : ''}`}
              title="Нарисовать область работ"
              aria-label="Нарисовать область работ"
              onClick={() => startDrawing('area')}
            >
              <Square size={16} />
            </button>
            <button
              className={`mw-button square ${mode === 'exclusion' ? 'active' : ''}`}
              title="Нарисовать запрет"
              aria-label="Нарисовать запрет"
              onClick={() => startDrawing('exclusion')}
            >
              <ShieldCheck size={17} />
            </button>
            <span className="spacer" />
            <button
              className={`mw-button small ${showTransit ? 'active' : ''}`}
              onClick={() => setShowTransit((s) => !s)}
              aria-pressed={showTransit}
            >
              Переходы
            </button>
            <button
              className={`mw-button small ${showTiles ? 'active' : ''}`}
              onClick={() => setShowTiles((s) => !s)}
              aria-pressed={showTiles}
            >
              Подложка
            </button>
          </div>
          <div className="mw-map-legend">
            <strong>{currentJob.name}</strong>
            <div>
              <i className="mw-legend-line" />
              Маршрут / рабочие полосы
            </div>
            <div>
              <i
                className="mw-legend-line"
                style={{ borderColor: '#759280', borderTopStyle: 'dashed' }}
              />
              Граница допустимых полётов
            </div>
            <div>
              <i
                className="mw-legend-line"
                style={{ borderColor: '#bc5353' }}
              />
              Активные запреты (проекция)
            </div>
          </div>
          {mode && (
            <div className="mw-map-draw">
              <p>
                {mode === 'start' || mode === 'landing' || mode === 'reserve'
                  ? 'Укажите точку на карте'
                  : `Нажимайте на карту: ${draft.length} вершин. Минимум 3.`}
              </p>
              <div className="mw-actions">
                {!['start', 'landing', 'reserve'].includes(mode) && (
                  <>
                    <button
                      className="mw-button primary small"
                      disabled={draft.length < 3}
                      onClick={finishDrawing}
                    >
                      Применить контур
                    </button>
                    <button
                      className="mw-button small"
                      disabled={!draft.length}
                      onClick={() => setDraft((points) => points.slice(0, -1))}
                    >
                      Убрать точку
                    </button>
                  </>
                )}
                <button
                  className="mw-button small"
                  onClick={() => {
                    setMode(null);
                    setDraft([]);
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </section>
        <aside className="mw-inspector">
          <div className="mw-panel-head">
            <FileCheck2 size={16} />
            <h2>Результат и доказательства</h2>
          </div>
          <div className="mw-panel-content">
            {!candidate ? (
              <div className="mw-empty">
                <Compass size={35} />
                <h3>Сначала — задача</h3>
                <p>
                  Задайте работы и ресурсы. После расчёта здесь появятся
                  варианты, ограничения и объяснение выбора.
                </p>
                <p style={{ marginTop: 12 }}>
                  Ничего не отправляется реальным БВС.
                </p>
              </div>
            ) : (
              <>
                <div className="mw-section-label">
                  Варианты на одинаковом входе
                </div>
                <button
                  className="mw-button"
                  style={{ width: '100%', marginBottom: 12 }}
                  onClick={() => {
                    setPlaying(false);
                    setError('');
                    setModal('comparison');
                  }}
                >
                  Сравнить и объяснить варианты
                </button>
                {currentCandidates.map((c) => (
                  <button
                    key={c.id}
                    className={`mw-card mw-vehicle ${candidate.id === c.id ? 'selected' : ''}`}
                    onClick={() => {
                      setCandidateId(c.id);
                      setApproval(null);
                      setPlaying(false);
                      setTime(0);
                    }}
                  >
                    <h3>{candidateTitle(c)}</h3>
                    <p className="mw-caption">{candidateNames[c.status]}</p>
                    <dl className="mw-definition">
                      <dt>Завершение</dt>
                      <dd>
                        {c.sorties.length
                          ? timestamp(document, c.metrics.makespanSec)
                          : '—'}
                      </dd>
                      <dt>Суммарный налёт</dt>
                      <dd>{fmt(c.metrics.flightTimeSec / 60)} мин</dd>
                      <dt>БВС / вылеты</dt>
                      <dd>
                        {c.metrics.vehicleCount} / {c.metrics.sortieCount}
                      </dd>
                      <dt>Покрытие целевой площади</dt>
                      <dd>{fmt(c.metrics.coveragePct)}%</dd>
                      <dt>Минимальный остаток АКБ</dt>
                      <dd>
                        {c.sorties.length
                          ? `${fmt(c.metrics.minimumRemainingPct)}%`
                          : '—'}
                      </dd>
                    </dl>
                    {c.id === 'balanced' && (
                      <p className="mw-caption">
                        Компромисс 50/50 среди найденных допустимых планов; не
                        прогноз износа.
                      </p>
                    )}
                  </button>
                ))}
                {current?.recommendation?.samePlan && (
                  <p className="ms-notice">
                    Баланс совпал с{' '}
                    {current.recommendation.samePlanAs
                      .map((x) => (x === 'makespan' ? 'быстрым' : 'ресурсным'))
                      .join(' и ')}{' '}
                    вариантом. Отдельный маршрут не выдумываем.
                  </p>
                )}
                {current?.candidates.length === 2 &&
                  ['makespanSec', 'flightTimeSec', 'sortieCount'].every(
                    (k) =>
                      current.candidates[0].metrics[
                        k as keyof MissionCandidate['metrics']
                      ] ===
                      current.candidates[1].metrics[
                        k as keyof MissionCandidate['metrics']
                      ],
                  ) && (
                    <p className="mw-caption">
                      По времени и числу вылетов варианты совпали. Разница может
                      быть только в назначениях.
                    </p>
                  )}
                <button
                  className="mw-button primary"
                  style={{ width: '100%', marginTop: 10 }}
                  disabled={
                    candidate.status !== 'feasible_model' ||
                    checkCounts.fail > 0 ||
                    isApproved
                  }
                  onClick={() => {
                    setAcknowledged(false);
                    setModal('approval');
                  }}
                >
                  <ShieldCheck size={15} />
                  {isApproved ? 'План подтверждён' : 'Проверить и подтвердить'}
                </button>
                <p className="mw-caption" style={{ marginTop: 8 }}>
                  Подтверждение разрешает только симуляцию. Не является допуском
                  к реальному полёту.
                </p>
              </>
            )}
          </div>
          <div
            className="mw-panel-content"
            style={{ borderTop: '1px solid #e5ecef' }}
          >
            <div className="mw-section-label">
              Проверки: {checkCounts.pass} пройдено · {checkCounts.fail} ошибок
              · {checkCounts.unknown} неизвестно
            </div>
            <div className="mw-scroll">
              {candidate?.checks.map((c, i) => (
                <div className={`mw-check ${c.status}`} key={`${c.id}-${i}`}>
                  {c.status === 'pass' ? (
                    <CheckCircle2 size={14} />
                  ) : c.status === 'fail' ? (
                    <TriangleAlert size={14} />
                  ) : (
                    <CircleHelp size={14} />
                  )}
                  <div>
                    <strong>{c.title}</strong>
                    <p>{c.detail}</p>
                  </div>
                </div>
              ))}
              {!candidate && (
                <p className="mw-caption">
                  Проверки ещё не запускались. Зелёный статус без расчёта не
                  показываем.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      <section className="mw-metrics" aria-label="Показатели плана">
        <div className="mw-metric">
          <strong>
            {candidate ? `${fmt(candidate.metrics.coveragePct)}%` : '—'}
          </strong>
          <span>Покрытие целевой площади</span>
        </div>
        <div className="mw-metric">
          <strong>
            {candidate ? `${fmt(candidate.metrics.makespanSec / 60)} мин` : '—'}
          </strong>
          <span>До завершения миссии</span>
        </div>
        <div className="mw-metric">
          <strong>
            {candidate
              ? `${candidate.metrics.sortieCount} / ${candidate.metrics.batteryChanges}`
              : '—'}
          </strong>
          <span>Вылеты / смены АКБ</span>
        </div>
        <div className="mw-metric">
          <strong>
            {candidate ? `${fmt(candidate.metrics.minimumRemainingPct)}%` : '—'}
          </strong>
          <span>Минимальный остаток при посадке</span>
        </div>
      </section>
      <section className="mw-playback" aria-label="Модельная симуляция">
        <div className="mw-playback-controls">
          <button
            className="mw-button primary"
            disabled={!isApproved || !duration}
            onClick={() => {
              if (time >= duration) setTime(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            {playing ? 'Пауза' : 'Начать симуляцию'}
          </button>
          <button
            className="mw-button square"
            aria-label="В начало симуляции"
            disabled={!isApproved}
            onClick={() => {
              setPlaying(false);
              setTime(0);
            }}
          >
            <RotateCcw size={15} />
          </button>
          <span className="mw-playback-time">
            {elapsed(time)} / {elapsed(duration)}
          </span>
          <input
            type="range"
            aria-label="Время симуляции"
            min={0}
            max={duration || 1}
            step="any"
            value={time}
            disabled={!isApproved}
            onChange={(e) => {
              const next = Math.min(
                duration,
                Math.max(0, Number(e.target.value)),
              );
              // Browser range rounding must still reach the exact mission end.
              setTime(duration - next <= 1e-7 ? duration : next);
              setPlaying(false);
            }}
          />
          <label className="mw-caption">
            Скорость{' '}
            <select
              value={rate}
              aria-label="Скорость симуляции"
              onChange={(e) => setRate(Number(e.target.value))}
            >
              {[1, 10, 40, 100, 300].map((n) => (
                <option key={n} value={n}>
                  ×{n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!isApproved && (
          <p className="mw-caption" style={{ marginTop: 8 }}>
            Симуляция станет доступна после подтверждения выполнимого в модели
            плана.
          </p>
        )}
        {candidate && (
          <div className="mw-timeline">
            {document.scenario.vehicles
              .filter((v) =>
                candidate.sorties.some((s) => s.vehicleId === v.id),
              )
              .map((v, i) => (
                <div className="mw-timeline-row" key={v.id}>
                  <button
                    className="mw-button small quiet"
                    onClick={() => setSelected(v.id)}
                  >
                    {v.name}
                  </button>
                  <div
                    className="mw-timeline-track"
                    aria-label={`Вылеты ${v.name}`}
                  >
                    {candidate.sorties
                      .filter((s) => s.vehicleId === v.id)
                      .map((s) => (
                        <span
                          className="mw-timeline-span"
                          key={s.id}
                          title={`${s.id} · ${s.batteryId} · ${timestamp(document, s.startSec)}–${timestamp(document, s.endSec)}`}
                          style={{
                            left: `${(s.startSec / Math.max(1, duration)) * 100}%`,
                            width: `${((s.endSec - s.startSec) / Math.max(1, duration)) * 100}%`,
                            background: flightColors[i % flightColors.length],
                          }}
                        />
                      ))}
                    <i
                      className="mw-timeline-cursor"
                      style={{
                        left: `${(time / Math.max(1, duration)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
      <div className="mw-bottom">
        <section>
          <h2>
            БВС: {activeVehicle.name}{' '}
            <span className="mw-badge">
              {isApproved ? stateLabel : 'НЕ ЗАПУЩЕН'}
            </span>
          </h2>
          <dl className="mw-definition">
            <dt>Батарея / модельный заряд</dt>
            <dd>
              {activeSortie?.batteryId ?? lastSortie?.batteryId ?? '—'} ·{' '}
              {isApproved && battery !== undefined ? `${fmt(battery)}%` : '—'}
            </dd>
            <dt>Высота относительно старта</dt>
            <dd>
              {isApproved && activeSegment
                ? `${fmt(activeSegment.altitudeFromM + (activeSegment.altitudeToM - activeSegment.altitudeFromM) * progress)} м`
                : '—'}
            </dd>
            <dt>Путевая скорость</dt>
            <dd>
              {isApproved && activeSegment
                ? `${fmt(activeSegment.groundSpeedMps)} м/с`
                : '—'}
            </dd>
            <dt>Следующий вылет</dt>
            <dd>
              {nextSortie
                ? `${timestamp(document, nextSortie.startSec)} · ${nextSortie.batteryId}`
                : '—'}
            </dd>
          </dl>
          <div className="mw-actions">
            <button
              className="mw-button small"
              onClick={() => startDrawing('start')}
            >
              Задать старт на карте
            </button>
            <button
              className="mw-button small"
              onClick={() => startDrawing('landing')}
            >
              Задать посадку
            </button>
          </div>
          <h2 style={{ marginTop: 20 }}>Журнал модельных событий</h2>
          <div className="mw-scroll" style={{ maxHeight: 160 }}>
            {isApproved && candidate ? (
              candidate.events
                .filter((e) => e.timeSec <= time)
                .slice(-30)
                .map((event, i) => (
                  <div
                    className="mw-event"
                    key={`${event.timeSec}-${event.type}-${i}`}
                  >
                    <time>{timestamp(document, event.timeSec)}</time>
                    <p>
                      <strong>{phaseNames[event.type] ?? event.type}</strong> ·{' '}
                      {event.vehicleId}
                      <br />
                      {event.detail}
                    </p>
                  </div>
                ))
            ) : (
              <p className="mw-caption">
                В журнал попадут события того же подтверждённого плана, который
                виден на карте. Это не бортовая телеметрия.
              </p>
            )}
          </div>
        </section>
        <section>
          <h2>Задание и комплект воспроизведения</h2>
          <div className="mw-actions">
            <button className="mw-button" onClick={() => exportTask('yaml')}>
              <Download size={14} />
              Задание YAML
            </button>
            <button className="mw-button" onClick={() => exportTask('json')}>
              JSON
            </button>
            <button className="mw-button" onClick={() => exportTask('md')}>
              Описание MD
            </button>
          </div>
          <p className="mw-caption" style={{ marginTop: 8 }}>
            YAML и JSON можно загрузить обратно. MD — читаемое описание, не
            обратный импорт.
          </p>
          <hr className="mw-separator" />
          <label className="mw-field">
            Индивидуальная выдача
            <select
              value={exportVehicle}
              onChange={(e) => setExportVehicle(e.target.value)}
            >
              <option value="all">Все задействованные БВС</option>
              {document.scenario.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mw-actions">
            <button
              className="mw-button"
              disabled={!candidate}
              onClick={() => void exportPlan('geojson')}
            >
              GeoJSON
            </button>
            <button
              className="mw-button"
              disabled={!candidate}
              onClick={() => void exportPlan('kml')}
            >
              KML
            </button>
            <button
              className="mw-button"
              disabled={!candidate}
              onClick={() => void exportPlan('json')}
            >
              План JSON
            </button>
            <button
              className="mw-button"
              disabled={!candidate}
              onClick={() => void exportPlan('evidence')}
            >
              <ArrowDownToLine size={14} />
              Доказательства
            </button>
          </div>
          <p className="mw-caption" style={{ marginTop: 8 }}>
            Экспорт сохраняет и неудачные проверки. KML/GeoJSON предназначены
            для анализа, не проверены как команды автопилота.
          </p>
          {current && (
            <>
              <p className="mw-code" style={{ marginTop: 10 }}>
                Вход SHA-256: {current.inputHash}
              </p>
              <p className="mw-caption">
                Ядро {current.engineVersion} · расчёт{' '}
                {fmt(current.computationMs, 0)} мс
              </p>
            </>
          )}
          {approval && (
            <p className="mw-code" style={{ marginTop: 6 }}>
              План SHA-256: {approval.planHash}
            </p>
          )}
          <details className="mw-details">
            <summary>Допущения и ограничения модели</summary>
            {(candidate?.assumptions ?? [document.notes]).map((a, i) => (
              <p className="mw-caption" style={{ marginTop: 7 }} key={i}>
                {a}
              </p>
            ))}
            {current?.warnings.map((w, i) => (
              <p className="mw-caption" key={`w-${i}`}>
                {w}
              </p>
            ))}
          </details>
        </section>
      </div>
      <footer className="mw-footer">
        <span>
          ПРАЙМ · 2D-планирование · модельная симуляция · без подключения БВС
        </span>
        <span>
          Библиотека хранится в этом браузере. Файловый экспорт — ваша резервная
          копия.
        </span>
      </footer>
      <input
        ref={file}
        aria-label="Файл задания миссии"
        hidden
        type="file"
        accept=".json,.yaml,.yml"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={geoFile}
        aria-label="Файл координатного слоя"
        hidden
        type="file"
        accept=".json,.geojson,.kml"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f, true);
          e.target.value = '';
        }}
      />
      <input
        ref={backupFile}
        aria-label="Файл резервной копии"
        hidden
        type="file"
        accept=".json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            if (f.size > 10 * 1024 * 1024)
              throw new Error('Резервная копия больше 10 МиБ.');
            const text = await f.text();
            const value: unknown = JSON.parse(text);
            if (
              !value ||
              typeof value !== 'object' ||
              !('entries' in value) ||
              !Array.isArray(value.entries)
            )
              throw new Error('Это не резервная копия библиотеки.');
            setError('');
            setBackupPreview({
              name: f.name,
              text,
              count: value.entries.length,
            });
            setModal('backup');
          } catch (error) {
            setError(errorMessage(error));
          }
        }}
      />
      <input
        ref={layerFile}
        hidden
        type="file"
        aria-label="Файл объёмных ограничений"
        accept=".json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            if (f.size > MAX_MISSION_FILE_BYTES)
              throw new Error('Слой больше 200 КиБ.');
            setLayerPreview(parseRestrictionLayer(await f.text()));
            setError('');
            setModal('layers');
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
      {modal === 'catalog' && (
        <Modal title="Демонстрационные сценарии" wide onClose={onModalClose}>
          <MissionGallery onOpen={openPreview} />
        </Modal>
      )}
      {modal === 'comparison' && current && (
        <Modal title="Сравнение вариантов миссии" wide onClose={onModalClose}>
          <MissionComparisonView
            result={current}
            selectedId={candidateId}
            onSelect={(id) => {
              setCandidateId(id);
              setApproval(null);
              setPlaying(false);
              setTime(0);
            }}
          />
        </Modal>
      )}
      {modal === 'overview' && (
        <Modal
          title="Паспорт миссии"
          wide
          onClose={onModalClose}
          footer={
            <>
              <button className="mw-button" onClick={() => exportTask('md')}>
                Скачать описание MD
              </button>
              <button
                className="mw-button primary"
                onClick={() => {
                  setWizard(true);
                  setModal(null);
                }}
              >
                Редактировать миссию
              </button>
            </>
          }
        >
          <MissionBrief document={document} />
        </Modal>
      )}
      {modal === 'saveas' && (
        <Modal
          title="Сохранить миссию под новым ID"
          error={error}
          onClose={onModalClose}
          footer={
            <>
              <button
                className="mw-button"
                disabled={copyBusy}
                onClick={onModalClose}
              >
                Отмена
              </button>
              <button
                className="mw-button primary"
                disabled={copyBusy}
                onClick={() => void saveAs()}
              >
                {copyBusy ? 'Сохранение…' : 'Создать новую миссию'}
              </button>
            </>
          }
        >
          <p className="ms-notice">
            Все работы, назначения, геометрия и параметры будут сохранены как
            новое задание. Исходная запись не перезаписывается, прежнее
            подтверждение плана не переносится.
          </p>
          <label className="mw-field">
            Новый номер / ID миссии
            <input
              value={copyId}
              maxLength={60}
              onChange={(e) => setCopyId(e.target.value)}
              placeholder="mission-27"
            />
          </label>
          <p className="mw-caption">
            Латинские буквы, цифры, дефис и подчёркивание; до 60 символов.
            Например: 27 или mission-27.
          </p>
          <label className="mw-field">
            Название новой миссии
            <input
              value={copyName}
              maxLength={100}
              onChange={(e) => setCopyName(e.target.value)}
            />
          </label>
        </Modal>
      )}
      {modal === 'layers' && (
        <Modal
          title="Слои карты и объёмные ограничения"
          wide
          error={error}
          onClose={onModalClose}
          footer={
            layerPreview ? (
              <>
                <button
                  className="mw-button"
                  onClick={() => setLayerPreview(null)}
                >
                  Отменить импорт слоя
                </button>
                <button
                  className="mw-button primary"
                  onClick={() => {
                    try {
                      const next = appendRestrictionLayer(
                        document,
                        layerPreview,
                      );
                      edit(next);
                      setFit((n) => n + 1);
                      setLayerPreview(null);
                      setModal(null);
                      setNotice(
                        'Все объёмы слоя добавлены. Высоты и интервалы сохранены; нужен новый расчёт.',
                      );
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  Добавить проверенные объёмы
                </button>
              </>
            ) : undefined
          }
        >
          <p>
            Загрузите геометрию территории, запреты, точки баз или объёмы
            препятствий. Обычная фотография карты без координат не становится
            геоданными.
          </p>
          <div className="ms-file-actions">
            <button
              className="mw-button"
              onClick={() => geoFile.current?.click()}
            >
              Загрузить GeoJSON / KML
            </button>
            <button
              className="mw-button"
              onClick={() => layerFile.current?.click()}
            >
              Загрузить объёмы JSON
            </button>
            <button
              className="mw-button"
              onClick={() => {
                try {
                  download(
                    `${document.id}.restrictions.json`,
                    serializeRestrictionLayer(document),
                  );
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Скачать объёмы JSON
            </button>
          </div>
          <div className="ms-notice">
            GeoJSON/KML содержит координаты WGS84; назначение и высоту выбираете
            перед добавлением. Наш JSON объёмов сохраняет высоты, источник и
            время действия каждого объекта. Возвышенность можно задать
            препятствием заданной высоты — это консервативный объём,{' '}
            <strong>не цифровая модель рельефа</strong>. TIFF/DEM и
            автоматическое распознавание препятствий из картинки не поддержаны.
          </div>
          {layerPreview && (
            <h3>
              Перед добавлением: {layerPreview.restrictions.length} объёмов ·{' '}
              {layerPreview.source}
            </h3>
          )}
          <div className="ms-table-scroll">
            <table className="ms-table">
              <thead>
                <tr>
                  <th>Объект / ID</th>
                  <th>Высоты</th>
                  <th>Время действия</th>
                  <th>Источник</th>
                </tr>
              </thead>
              <tbody>
                {(layerPreview?.restrictions ?? document.restrictions).map(
                  (r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        <small>
                          {r.id} ·{' '}
                          {r.kind === 'obstacle' ? 'препятствие' : 'запрет'}
                        </small>
                      </td>
                      <td>
                        {r.minAltitudeM}…{r.maxAltitudeM ?? '∞'} м
                      </td>
                      <td>
                        {r.startAt ? `${r.startAt} — ${r.endAt}` : 'Постоянно'}
                      </td>
                      <td>{r.source}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {!layerPreview && !document.restrictions.length && (
            <p className="mw-caption">
              Объёмов пока нет. Нарисуйте препятствие на карте или загрузите
              слой. Параметры каждого объёма доступны на шаге «Правила».
            </p>
          )}
          <p className="mw-caption">
            Высоты: общий локальный уровень миссии. AMSL, AGL и WGS84 не
            преобразуются автоматически. Коллизия ID отменит импорт целиком;
            существующие объекты не заменяются.
          </p>
        </Modal>
      )}
      {modal === 'backup' && backupPreview && (
        <Modal
          title="Восстановление резервной копии"
          error={error}
          onClose={onModalClose}
          footer={
            <>
              <button className="mw-button" onClick={onModalClose}>
                Отмена
              </button>
              <button
                className="mw-button primary"
                onClick={async () => {
                  try {
                    const count = await library.current!.importBackup(
                      backupPreview.text,
                    );
                    setLibraryRows(await library.current!.list());
                    setModal('library');
                    setNotice(
                      `Добавлено заданий: ${count}. Существующие записи не перезаписаны.`,
                    );
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Проверить и добавить записи
              </button>
            </>
          }
        >
          <p>
            {backupPreview.name} · заявлено записей: {backupPreview.count}.
          </p>
          <p className="mw-caption">
            Перед добавлением все записи проходят строгую проверку. Если хотя бы
            один ID уже занят или данные неверны, импорт целиком отменится.
            Текущее задание и существующая библиотека не перезаписываются.
          </p>
        </Modal>
      )}
      {modal === 'preview' && preview && (
        <Modal
          title="Проверка перед загрузкой"
          error={error}
          onClose={onModalClose}
          footer={
            <>
              <button className="mw-button" onClick={onModalClose}>
                Отмена
              </button>
              <button className="mw-button primary" onClick={acceptPreview}>
                Заменить текущее задание
              </button>
            </>
          }
        >
          <p className="mw-caption">
            Источник: {previewName}. Текущие несохранённые правки и выбор плана
            будут заменены. Сохранённая библиотека не изменяется.
          </p>
          <div className="mw-import-summary">
            <h3>{preview.name}</h3>
            <p>
              {preview.jobs.length} работ · {preview.scenario.vehicles.length}{' '}
              БВС · {preview.batteries.length} батарей
            </p>
            <p>
              {preview.window.start} — {preview.window.end}
            </p>
            <p>{preview.jobs.map((j) => jobNames[j.job.type]).join(', ')}</p>
          </div>
          <MissionBrief document={preview} />
          <details className="mw-details">
            <summary>Полное содержимое файла</summary>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
          </details>
        </Modal>
      )}
      {modal === 'geometry' && geometry && (
        <Modal
          title="Импорт координатного слоя"
          error={error}
          onClose={onModalClose}
          footer={
            <>
              <button className="mw-button" onClick={onModalClose}>
                Отмена
              </button>
              <button
                className="mw-button primary"
                disabled={!geometryPreview.data}
                onClick={applyGeometry}
              >
                Применить весь слой
              </button>
            </>
          }
        >
          <p className="mw-caption">
            {geometry.name} · геометрия не назначает скрытых правил. Выберите
            значение слоя.
          </p>
          <label className="mw-field" style={{ marginTop: 14 }}>
            Назначение
            <select
              value={geometryRole}
              onChange={(e) => setGeometryRole(e.target.value as GeometryRole)}
            >
              <option value="area">
                Области работ — заменить выбранную / добавить части
              </option>
              <option value="airspace">Граница полётов — заменить</option>
              <option value="exclusion">Постоянные запреты — добавить</option>
              <option value="obstacle">
                Препятствия / возвышенности — добавить объёмы
              </option>
              <option value="start">Старт выбранного БВС — заменить</option>
              <option value="landing">Посадка выбранного БВС — заменить</option>
              <option value="reserve">Резервные площадки — добавить</option>
            </select>
          </label>
          {geometryRole === 'obstacle' && (
            <>
              <label className="mw-field">
                Верхняя высота препятствий, м
                <input
                  type="number"
                  min={0}
                  max={6000}
                  value={obstacleHeight}
                  onChange={(e) => setObstacleHeight(e.target.value)}
                  placeholder="Пусто = весь столб"
                />
              </label>
              <p className="mw-caption">
                От 0 до указанной высоты в общем локальном уровне миссии. Пустое
                значение закрывает весь столб. Это не высота рельефа над уровнем
                моря. Каждый объект можно уточнить на шаге «Правила».
              </p>
            </>
          )}
          {geometryPreview.error ? (
            <div className="mw-alert error" role="alert">
              {geometryPreview.error}
            </div>
          ) : (
            <>
              <p>
                Распознано объектов: {geometryPreview.data?.features.length}
              </p>
              {geometryPreview.data?.features.map((f, i) => (
                <p className="mw-caption" key={i}>
                  {f.name} ·{' '}
                  {f.geometry.type === 'Polygon'
                    ? `${f.geometry.coordinates.length} контуров`
                    : f.geometry.coordinates.join(', ')}
                </p>
              ))}
              {geometryPreview.data?.warnings.map((warning, i) => (
                <p className="mw-alert" key={i}>
                  {warning}
                </p>
              ))}
            </>
          )}
          <p className="mw-caption" style={{ marginTop: 12 }}>
            Подтверждение плана будет отменено. Это координатный слой, не
            подложка и не DEM.
          </p>
        </Modal>
      )}
      {modal === 'approval' && candidate && (
        <Modal
          title="Подтвердить модельный план"
          error={error}
          onClose={onModalClose}
          footer={
            <>
              <button className="mw-button" onClick={onModalClose}>
                Вернуться к проверкам
              </button>
              <button
                className="mw-button primary"
                disabled={!acknowledged}
                onClick={() => void approve()}
              >
                Подтвердить для симуляции
              </button>
            </>
          }
        >
          <div className="mw-import-summary">
            <h3>
              {candidate.objective === 'makespan'
                ? 'Раньше закончить работы'
                : 'Минимальный суммарный налёт'}
            </h3>
            <p>
              {candidate.metrics.vehicleCount} БВС ·{' '}
              {candidate.metrics.sortieCount} вылетов ·{' '}
              {candidate.metrics.batteryChanges} смен АКБ
            </p>
            <p>
              Окончание: {timestamp(document, candidate.metrics.makespanSec)} ·
              покрытие {fmt(candidate.metrics.coveragePct)}%
            </p>
          </div>
          <p>
            Проверок пройдено: {checkCounts.pass}. Неизвестно:{' '}
            {checkCounts.unknown}. Ошибок: {checkCounts.fail}.
          </p>
          <div className="mw-scroll">
            {candidate.checks
              .filter((c) => c.status !== 'pass')
              .map((c, i) => (
                <div className="mw-check unknown" key={i}>
                  <CircleHelp size={15} />
                  <div>
                    <strong>{c.title}</strong>
                    <p>{c.detail}</p>
                  </div>
                </div>
              ))}
          </div>
          <label className="mw-checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              Я ознакомился с допущениями. Подтверждаю этот вариант только для
              модельной симуляции; разрешения и реальная безопасность полёта не
              удостоверены.
            </span>
          </label>
          <p className="mw-code">SHA-256 входа: {current?.inputHash}</p>
        </Modal>
      )}
      {modal === 'library' && (
        <Modal
          title="Локальная библиотека миссий"
          error={error}
          onClose={onModalClose}
          footer={
            <>
              <button className="mw-button" onClick={() => void save(true)}>
                <Plus size={14} />
                Сохранить копию
              </button>
              <button
                className="mw-button"
                onClick={async () => {
                  try {
                    download(
                      'prime-mission-library.json',
                      await library.current!.exportBackup(),
                    );
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Резервная копия
              </button>
              <button
                className="mw-button"
                onClick={() => backupFile.current?.click()}
              >
                Восстановить копию
              </button>
            </>
          }
        >
          <p className="mw-caption">
            Хранится только в этом браузере (IndexedDB). Очистка данных браузера
            может удалить библиотеку. Загрузка открывает предпросмотр и не
            запускает расчёт.
          </p>
          {!libraryRows.length && (
            <div className="mw-empty">
              <FolderOpen size={30} />
              <h3>Пока нет сохранённых заданий</h3>
              <p>
                Нажмите «Сохранить» в рабочем окне или «Сохранить копию» здесь.
              </p>
            </div>
          )}
          {libraryRows.map((entry) => (
            <div className="mw-library-card" key={entry.id}>
              <div>
                <h3>{entry.document.name}</h3>
                <p className="mw-caption">
                  ID {entry.id} · версия {entry.revision} ·{' '}
                  {entry.document.jobs.length} работ ·{' '}
                  {
                    entry.document.scenario.vehicles.filter((v) => v.enabled)
                      .length
                  }{' '}
                  БВС
                </p>
                <p className="mw-caption">
                  {new Date(entry.savedAt).toLocaleString('ru-RU')}
                </p>
                <details className="mw-details">
                  <summary>Полное описание</summary>
                  <pre>{missionSummaryMarkdown(entry.document)}</pre>
                </details>
              </div>
              <div className="mw-actions">
                <button
                  className="mw-button small"
                  onClick={() =>
                    openPreview(
                      {
                        ...structuredClone(entry.document),
                        id: `mission-${Date.now()}`,
                        name: `${entry.document.name.slice(0, 90)} · копия`,
                      },
                      `Библиотека, версия ${entry.revision}`,
                    )
                  }
                >
                  Открыть копию
                  <ChevronRight size={12} />
                </button>
                <button
                  className="mw-button small"
                  onClick={() =>
                    download(
                      `${entry.id}.mission.yaml`,
                      serializeMissionYaml(entry.document),
                      'text/yaml',
                    )
                  }
                >
                  YAML
                </button>
                <button
                  className="mw-button small danger"
                  aria-label={`Архивировать ${entry.document.name}`}
                  onClick={() => setArchiveId(entry.id)}
                >
                  <Archive size={13} />
                </button>
                {archiveId === entry.id && (
                  <div className="mw-card warning">
                    <p className="mw-caption">
                      Скрыть из библиотеки? В резервной копии запись сохранится.
                    </p>
                    <button
                      className="mw-button small danger"
                      onClick={async () => {
                        try {
                          await library.current!.archive(
                            entry.id,
                            entry.revision,
                          );
                          setLibraryRows(await library.current!.list());
                          setArchiveId(null);
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      Архивировать
                    </button>
                    <button
                      className="mw-button small"
                      onClick={() => setArchiveId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Modal>
      )}
    </main>
  );
}
