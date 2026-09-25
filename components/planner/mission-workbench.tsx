'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  Archive,
  ArrowDownToLine,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Download,
  FileCheck2,
  FolderOpen,
  Layers,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Save,
  Settings,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Settings2,
  ShieldCheck,
  Square,
  TriangleAlert,
  Upload,
  Wind,
  X,
  Trash2,
} from 'lucide-react';
import { demoMission } from '@/lib/planner/mission-demo';
import { simulatedTrialFleetChanges } from '@/lib/planner/mission-demo-trial';
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
import MissionImportCard from './mission-import-card';
import { missionPassportHtml } from '@/lib/planner/mission-passport';
import ObstacleLayerPanel from './obstacle-layer-panel';
import {
  buildMissionArchive,
  buildMissionDiagnosticArchive,
  buildIncidentArchive,
  createStoredZip,
} from '@/lib/planner/mission-archive';
import {
  MAX_OBSTACLE_MISSION_BYTES,
  type Bounds,
} from '@/lib/planner/obstacle-layer';
import type { DrawMode } from './mission-map';
import MissionEditor from './mission-editor';
import MissionDataPanel from './mission-data-panel';
import MissionMapObjects from './mission-map-objects';
import {
  changedBaseVehicles,
  missionBases,
  moveMissionBase,
} from '@/lib/planner/mission-bases';
import type { BaseAction } from './mission-base-editor';
import {
  upsertMission,
  importedFleetConflicts,
  reconcileImportedFleet,
} from '@/lib/planner/mission-collection';
import { alternativeLimitExplanation } from '@/lib/planner/mission-alternatives';
import { effectiveMissionRestrictions } from '@/lib/planner/mission-catalog';
import { prepareGroundRevision } from '@/lib/planner/mission-revision';
import {
  appendEmptyArea,
  synchronizeWorkSettings,
} from '@/lib/planner/mission-editing';
import {
  missionRunReport,
  missionRunReportHtml,
} from '@/lib/planner/mission-run-export';
import {
  createFleetRegistry,
  applyRegistryFleet,
  type FleetRegistry,
} from '@/lib/planner/fleet-registry';
import Link from 'next/link';
import MissionBrief from './mission-brief';
import MissionGallery from './mission-gallery';
import MissionComparisonView from './mission-comparison-view';
import MissionAnalysisPanel from './mission-analysis-panel';
import MissionDataSummary from './mission-data-summary';
import { photoCoverageGeoJSON } from '@/lib/planner/mission-photo-footprints';
import { MissionSafetySummary } from './mission-safety-summary';
import { MissionCheckGroups } from './mission-check-details';
import MissionFailedChecks from './mission-failed-checks';
import { prepareSharedDemoFleet } from '@/lib/planner/demo-shared-fleet';
import { withMissionReservations } from '@/lib/planner/mission-resource-reservations';
import {
  concurrentVehicleCount,
  missionFleetLabel,
} from '@/lib/planner/mission-alternatives';
import { expertCandidateGroups } from '@/lib/planner/expert-presentation';
import { EditorHistory } from '@/lib/planner/editor-history';
import { useViewHistory } from '@/hooks/use-view-history';
import { useMissionRecordings } from '@/hooks/use-mission-recordings';
import { createRecoveryClock } from '@/lib/planner/mission-recovery-clock';
import DemoMissionCards from './mission-session-cards';
import DemoReportTable, { type DemoDownload } from './mission-session-report';
import DemoFleet from './demo-fleet';
import type { CameraPatch } from './vehicle-camera-editor';
import { migrateMissionCameraBindings } from '@/lib/planner/camera-profile';
import { DEMO_IDS, prepareDemoDocument } from '@/lib/planner/demo-session';
import { catalogueCameraConfiguration } from '@/lib/planner/mission-vehicle-catalog';
import {
  appendRestrictionLayer,
  parseRestrictionLayer,
  restrictionFromPolygon,
  serializeRestrictionLayer,
} from '@/lib/planner/mission-layers';
import type { RestrictionLayer } from '@/lib/planner/mission-layers';
import MissionThemeSelector from './mission-theme';
import { InfoHint } from './mission-help';
import MissionWind from './mission-wind';
import MissionOperationsBoard from './mission-operations-board';
import { deriveOperationVehicleStates } from '@/lib/planner/mission-operations';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import { useMissionOperations } from '@/hooks/use-mission-operations';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  vehicleDisplayName,
  vehicleMapLabel,
} from '@/lib/planner/mission-vehicle-label';
import { MissionNotificationCenter } from './mission-notification-center';
import MissionFleetEditor from './mission-fleet-editor';
import MissionJournalReview from './mission-journal-review';
import MissionExecutionQueue from './mission-execution-queue';
import MissionOperationJournal from './mission-operation-journal';
import MissionProgramHelp from './mission-program-help';
import {
  recoveryOptions,
  safetyDocument,
  safetyMapPlan,
  incidentLabels,
  returnReserveAlert,
  recoverySnapshot,
} from '@/lib/planner/mission-safety';
import type { IncidentKind } from '@/lib/planner/mission-safety';
import { positionAt } from '@/lib/planner/mission-validation';
import { validatePolygonTopology } from '@/lib/planner/geometry';
import {
  closedDrawing,
  firstDrawingLoop,
  ellipseDrawing,
  simplifyDrawing,
  moveAreaVertex,
} from '@/lib/planner/territory-editing';
import MissionTerritoryEditor from './mission-territory-editor';
import MissionFleetStatePanel from './mission-fleet-state-panel';
import {
  applyFleetState,
  refreshMissionFleetState,
  installedBatteryDocument,
  fleetStateFromDocument,
} from '@/lib/planner/mission-fleet-state';

const candidateTitle = (c: MissionCandidate) =>
  c.id === 'balanced'
    ? 'Уложиться в срок'
    : c.objective === 'makespan'
      ? 'Быстрее закончить'
      : 'Меньше налёт';

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
  battery: 'Батарея',
  complete: 'Работы завершены',
};
const candidateNames: Record<MissionCandidate['status'], string> = {
  feasible_model: 'Выполним в модели',
  invalid: 'Нарушены ограничения',
  not_found: 'Полный маршрут не найден',
  partial: 'Выполняется только часть работ',
  unsupported: 'Эти параметры пока не поддерживаются',
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
  help,
  children,
  footer,
  onClose,
  wide = false,
  open = true,
  className = '',
}: {
  title: string;
  help?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  error?: string;
  wide?: boolean;
  open?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open) {
      closeRef.current?.setAttribute('autofocus', '');
      dialog?.showModal();
      // Do not autofocus the first help trigger: it would display unsolicited prose.
      closeRef.current?.focus({ preventScroll: true });
    } else dialog?.close();
    return () => dialog?.close();
  }, [open]);
  return (
    <dialog
      className={`mw-modal ${wide ? 'ms-modal-wide' : ''} ${className}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="mw-modal-head">
        <div className="mw-heading-with-hint">
          <h2>{title}</h2>
          {help && <InfoHint label={title}>{help}</InfoHint>}
        </div>
        <button
          className="mw-button square quiet"
          aria-label="Закрыть окно"
          ref={closeRef}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="mw-modal-body">{children}</div>
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
  const [session, setSession] = useState<string | null>(null);
  useEffect(() => {
    const reset = () => setSession('prime-demo-session-' + crypto.randomUUID());
    queueMicrotask(reset);
    window.addEventListener('prime:reset-demo', reset);
    return () => window.removeEventListener('prime:reset-demo', reset);
  }, []);
  useEffect(() => {
    if (!session) return;
    const cleanup = () => {
      for (const suffix of ['-operations', '-library', '-fleet'])
        indexedDB.deleteDatabase(session + suffix);
    };
    window.addEventListener('pagehide', cleanup);
    return () => {
      window.removeEventListener('pagehide', cleanup);
      cleanup();
    };
  }, [session]);
  return session ? (
    <DemoWorkbench key={session} session={session} />
  ) : (
    <main>Подготовка трёх миссий…</main>
  );
}
function DemoWorkbench({ session }: { session: string }) {
  const [demoDocuments, setDemoDocuments] = useState<MissionDocument[]>([]);
  const [demoResults, setDemoResults] = useState<Record<string, MissionResult>>(
    {},
  );
  const [openedDemo, setOpenedDemo] = useState(false);
  const [workspace, setWorkspace] = useState('missions');
  const editHistories = useRef(
    new Map<string, EditorHistory<MissionDocument>>(),
  );
  const [historyVersion, setHistoryVersion] = useState(0);
  const [editorTab, setEditorTab] = useState<
    'area' | 'quality' | 'vehicles' | 'time'
  >('area');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const [focusMode, setFocusMode] = useState(false);
  const [resultsTab, setResultsTab] = useState<
    'summary' | 'analysis' | 'files'
  >('summary');
  const [flightDetails, setFlightDetails] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [reportPreview, setReportPreview] = useState('');
  const [reviewMissionId, setReviewMissionId] = useState<string | null>(null);
  const [demoSelection, setDemoSelection] = useState<Record<string, string>>(
    {},
  );
  const [incidentKind, setIncidentKind] = useState<IncidentKind>('obstacle');
  const [incidentWind, setIncidentWind] = useState(4);
  const [incidentBattery, setIncidentBattery] = useState(30);
  const [recoveryTime, setRecoveryTime] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [operatorSeconds, setOperatorSeconds] = useState(60);
  const incidentBusy = useRef(false);
  const safetyDecisionBusy = useRef(false);
  const recoveryRunner = useRef<ReturnType<typeof createRecoveryClock> | null>(
    null,
  );
  const [editorSession, setEditorSession] = useState(0);
  const [planningStep, setPlanningStep] = useState<
    'task' | 'variants' | 'confirm'
  >('task');
  const [document, setDocument] = useState<MissionDocument>(() =>
    installedBatteryDocument(demoMission(1)),
  );
  const vehicleCallsign = (index: number) =>
    document.scenario.vehicles[index]
      ? vehicleMapLabel(document.scenario.vehicles[index], index)
      : 'БВС';
  const mapBases = useMemo(() => missionBases(document), [document]);
  const [panelWidth, setPanelWidth] = useState(50);
  const [executionTab, setExecutionTab] = useState<
    'summary' | 'vehicles' | 'journal'
  >('summary');
  const [fleetView, setFleetView] = useState<'catalog' | 'state'>('catalog');
  const navigation = useViewHistory(
    { workspace, resultsTab, planningStep, editorTab, executionTab, fleetView },
    (v) => {
      setWorkspace(v.workspace);
      setResultsTab(v.resultsTab);
      setPlanningStep(v.planningStep);
      setEditorTab(v.editorTab);
      setExecutionTab(v.executionTab);
      setFleetView(v.fleetView);
      setMode(null);
      setDraft([]);
      setModal(null);
    },
    document.id,
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
    [notice, updateNotice] = useState<{
      text: string;
      workspace: string;
    } | null>(null);
  const setNotice = (text: string) =>
    updateNotice(text ? { text, workspace } : null);
  const [clearedAreaId, setClearedAreaId] = useState<string | null>(null);
  const [areaRestore, setAreaRestore] = useState<{
    id: string;
    area: Polygon;
  } | null>(null);
  const [drawTool, setDrawTool] = useState<
    'polygon' | 'freehand' | 'circle' | 'ellipse'
  >('polygon');
  const [territoryEditing, setTerritoryEditing] = useState(false);
  const [boundaryEditing, setBoundaryEditing] = useState(false);
  const [selectedBase, setSelectedBase] = useState<string | null>(null);
  const [baseAction, setBaseAction] = useState<BaseAction | null>(null);
  const [movingBaseId, setMovingBaseId] = useState<string | null>(null);
  const [basePreview, setBasePreview] = useState<Coordinate | null>(null);
  const [baseFeedback, setBaseFeedback] = useState<{
    missionId: string;
    text: string;
    error?: boolean;
  } | null>(null);
  const [baseUndo, setBaseUndo] = useState<{
    before: MissionDocument;
    after: MissionDocument;
  } | null>(null);
  const baseChangeLock = useRef(false);
  const [pickedMapPoint, setPickedMapPoint] = useState<{
    kind: 'base' | 'reserve';
    point: Coordinate;
    key: number;
  } | null>(null);
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(40);
  const [mode, setMode] = useState<DrawMode>(null),
    [draft, setDraft] = useState<Coordinate[]>([]),
    [fit, setFit] = useState(0),
    [showTiles, setShowTiles] = useState(true),
    [showObstacles, setShowObstacles] = useState(true),
    [obstacleFocus, setObstacleFocus] = useState<Bounds | null>(null),
    [showWind, setShowWind] = useState(false),
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
    | 'operations'
    | 'guide'
    | 'settings'
    | 'mission-actions'
    | 'upload'
    | 'fleet-state'
    | 'journal-review'
    | 'operation-journal'
    | 'telemetry'
    | 'report-preview'
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
    [previewName, setPreviewName] = useState(''),
    [previewRevision, setPreviewRevision] = useState<number | undefined>();
  const previewJobId = useRef<string | null>(null);
  const previewTrialOrigin = useRef<MissionDocument | null>(null);
  const [previewImport, setPreviewImport] = useState(false);
  const [importFleetChoice, setImportFleetChoice] = useState(false);
  const [importCopyChoice, setImportCopyChoice] = useState(false);
  const requestedGeometryRole = useRef<GeometryRole>('area');
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
  const operations = useMissionOperations({
    dbName: session + '-operations',
    demoSession: true,
  });
  const [fleetRegistry, setFleetRegistry] = useState<FleetRegistry | null>(
    null,
  );
  const registryStore = useRef<ReturnType<typeof createFleetRegistry> | null>(
    null,
  );
  useEffect(() => {
    const store = createFleetRegistry(indexedDB, session + '-fleet');
    registryStore.current = store;
    let disposed = false;
    void store
      .read()
      .then((value) => {
        if (!disposed) setFleetRegistry(value);
      })
      .catch((e) => {
        if (!disposed) setError(errorMessage(e));
      });
    return () => {
      disposed = true;
      registryStore.current = null;
      void store.close();
    };
  }, [session]);
  async function applyGlobalFleet() {
    if (!fleetRegistry) return;
    if (
      !window.confirm(
        'Заменить состав этой миссии снимком общего парка? Потребуется новый расчёт.',
      )
    )
      return;
    try {
      let next = applyRegistryFleet(document, fleetRegistry);
      const states = await operations.listFleet();
      const ids = new Set(next.scenario.vehicles.map((v) => v.id));
      if (states.length)
        next = applyFleetState(
          next,
          states.filter((s) => ids.has(s.id)),
        );
      edit(next);
      setNotice('Общий парк применён к миссии. Нужен расчёт.');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [journalRunId, setJournalRunId] = useState<string | null>(null);
  const openRunJournal = (row: MissionOperation) => {
    setJournalRunId(row.id);
    setModal('operation-journal');
  };
  const [operationActionBusy, setOperationActionBusy] = useState(false);
  const [restoredSnapshot, setRestoredSnapshot] = useState(false);
  const playbackStop = useRef<() => Promise<void>>(async () => {});
  const playbackRate = useRef(rate);
  const operationsRef = useRef(operations);
  useEffect(() => {
    playbackRate.current = rate;
  }, [rate]);
  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);
  const library = useRef<MissionLibrary | null>(null),
    request = useRef<AbortController | null>(null),
    revision = useRef(0),
    calculationSequence = useRef(0),
    file = useRef<HTMLInputElement>(null),
    geoFile = useRef<HTMLInputElement>(null),
    backupFile = useRef<HTMLInputElement>(null),
    layerFile = useRef<HTMLInputElement>(null);
  const currentJob = document.jobs[jobIndex] ?? document.jobs[0];
  const previewConflicts = useMemo(
    () =>
      preview && previewImport
        ? importedFleetConflicts(preview, demoDocuments, operations.fleet)
        : [],
    [preview, previewImport, demoDocuments, operations.fleet],
  );
  const previewDuplicate =
    previewImport &&
    !!preview &&
    demoDocuments.some((d) => d.id === preview.id);
  const resultDocument = result?.document;
  const stale = useMemo(
    () =>
      !!resultDocument &&
      (!!clearedAreaId ||
        (resultDocument !== document &&
          canonicalStringify(resultDocument) !== canonicalStringify(document))),
    [resultDocument, document, clearedAreaId],
  );
  const current = result && !stale ? result : null;
  const currentCandidates = current
    ? [
        ...current.candidates,
        ...(current.recommendation ? [current.recommendation.candidate] : []),
      ]
    : [];
  const candidate =
    (candidateId === 'balanced'
      ? (current?.recommendation?.candidate ??
        current?.candidates.find((c) => c.id === 'balanced'))
      : current?.candidates.find((c) => c.id === candidateId)) ??
    current?.candidates[0] ??
    null;
  const isApproved =
    !!approval &&
    !!candidate &&
    approval.inputHash === current?.inputHash &&
    approval.candidateId === candidate.id;
  const displaySelected =
    candidate && !candidate.sorties.some((s) => s.vehicleId === selected)
      ? (candidate.sorties[0]?.vehicleId ?? selected)
      : selected;
  const activeVehicle =
    document.scenario.vehicles.find((v) => v.id === displaySelected) ??
    document.scenario.vehicles[0];
  const duration = candidate?.metrics.makespanSec ?? 0;
  const activeRun =
    operations.rows.find((row) => row.id === activeRunId) ?? null;
  const reviewOperation = reviewMissionId
    ? (operations.rows.find((row) => row.document.id === reviewMissionId) ??
      null)
    : activeRun;
  const reviewResult = reviewMissionId ? demoResults[reviewMissionId] : current;
  const reviewDocument = reviewOperation?.document ?? reviewResult?.document;
  const reviewCandidate =
    reviewOperation?.candidate ??
    (reviewResult
      ? ([
          ...reviewResult.candidates,
          ...(reviewResult.recommendation
            ? [reviewResult.recommendation.candidate]
            : []),
        ].find(
          (c) =>
            c.id ===
            (reviewMissionId ? demoSelection[reviewMissionId] : candidateId),
        ) ?? reviewResult.candidates[0])
      : null);
  const journalRun = operations.rows.find((row) => row.id === journalRunId);
  const safety = activeRun?.safety;
  const recoveryChoices = useMemo(
    () =>
      safety && candidate ? recoveryOptions(document, candidate, safety) : [],
    [document, candidate, safety],
  );
  const recoveryChoice =
    recoveryChoices.find((o) => o.policy === safety?.policy) ?? null;
  const safetySceneDocument = useMemo(
    () =>
      safety && candidate
        ? safetyDocument(document, candidate, safety)
        : document,
    [document, candidate, safety],
  );
  const safetyDisplayTime = safety
    ? Math.max(safety.progressSec, recoveryTime)
    : time;
  const sceneRestrictions = useMemo(() => {
    try {
      return effectiveMissionRestrictions(safetySceneDocument);
    } catch {
      return safetySceneDocument.restrictions;
    } // Invalid source blocks solving; keep the editor/map usable.
  }, [safetySceneDocument]);
  const vehicleStates = useMemo(
    () =>
      activeRun && candidate
        ? deriveOperationVehicleStates({ ...activeRun, progressSec: time })
        : [],
    [activeRun, candidate, time],
  );
  const activeVehicleState = vehicleStates.find(
    (v) => v.vehicleId === activeVehicle.id,
  );
  const activeRestrictionIds = sceneRestrictions
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
      area: currentJob.area.coordinates[0]?.length
        ? currentJob.area
        : document.scenario.area,
      job: currentJob.job,
      exclusions: [
        ...document.scenario.exclusions,
        ...sceneRestrictions
          .filter((r) => activeRestrictionIds.split('|').includes(r.id))
          .map((r) => r.geometry),
      ],
    }),
    [document, currentJob, activeRestrictionIds, sceneRestrictions],
  );
  const scenePlan = useMemo(
    () => mapPlan(candidate, sceneScenario),
    [candidate, sceneScenario],
  );
  const visibleWorkAreas = useMemo(
    () =>
      document.jobs.filter(
        (j) => j.id !== clearedAreaId && j.area.coordinates[0]?.length,
      ),
    [document.jobs, clearedAreaId],
  );
  const displayedPlan = useMemo(
    () =>
      safety && scenePlan
        ? safetyMapPlan(scenePlan, recoveryChoice, safety)
        : scenePlan,
    [scenePlan, recoveryChoice, safety],
  );
  const displayedScenario = useMemo(
    () =>
      safety
        ? { ...sceneScenario, wind: safetySceneDocument.scenario.wind }
        : sceneScenario,
    [sceneScenario, safetySceneDocument, safety],
  );
  const activeSortie = candidate?.sorties.find(
    (s) =>
      s.vehicleId === activeVehicle.id && time >= s.startSec && time < s.endSec,
  );
  const activeSegment = safety
    ? displayedPlan?.missions
        .find((m) => m.vehicleId === activeVehicle.id)
        ?.segments.find(
          (s) =>
            safetyDisplayTime >= s.startSec && safetyDisplayTime < s.endSec,
        )
    : activeSortie?.segments.find((s) => time >= s.startSec && time < s.endSec);
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
          ((safety ? safetyDisplayTime : time) - activeSegment.startSec) /
            Math.max(0.001, activeSegment.endSec - activeSegment.startSec),
        ),
      )
    : 0;
  const battery = activeSegment
    ? activeSegment.batteryFromPct +
      (activeSegment.batteryToPct - activeSegment.batteryFromPct) * progress
    : ((safety
        ? recoveryChoice?.sorties.find((s) => s.vehicleId === activeVehicle.id)
            ?.remainingPct
        : lastSortie?.remainingPct) ??
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
      if (!document.scenario.airspace.coordinates[0]?.length)
        return 'Граница полётов удалена. Откройте «Данные миссии → Объекты карты → Граница полётов» и задайте новый контур.';
      const emptyArea = document.jobs.find(
        (j) => !j.area.coordinates[0]?.length || j.id === clearedAreaId,
      );
      if (emptyArea)
        return `Участок «${emptyArea.name}» без территории. Нарисуйте контур или удалите участок.`;
      parseMissionDocument(document);
      return '';
    } catch (e) {
      return errorMessage(e);
    }
  }, [document, clearedAreaId]);
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
    library.current = createMissionLibrary({ dbName: session + '-library' });
    void library.current
      .list(true)
      .then(setLibraryRows)
      .catch((e) => setError(errorMessage(e)));
    return () => {
      library.current?.close();
      request.current?.abort();
    };
  }, [session]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(
      DEMO_IDS.map(async (id) => {
        const r = await fetch(`/planner/scenarios/${id}.mission.json`, {
          signal: controller.signal,
        });
        if (!r.ok)
          throw new Error(
            'Не удалось загрузить три демо-миссии. Обновите страницу.',
          );
        return prepareDemoDocument(parseMissionText(await r.text()));
      }),
    )
      .then((d) => {
        const prepared = prepareSharedDemoFleet(d);
        setDemoDocuments(prepared);
        setDocument(prepared[0]);
        setSelected(prepared[0].scenario.vehicles[0].id);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const ownedRuns = useRef(new Set<string>());
  const modelClocks = useRef(new Map<string, number>());
  const recordings = useMissionRecordings(() =>
    operationsRef.current.rows.map((row) => ({
      row,
      rate: playbackRate.current,
      time: row.safety
        ? (recoveryRunner.current?.time(row) ?? row.safety.progressSec)
        : Math.max(row.progressSec, modelClocks.current.get(row.id) ?? 0),
    })),
  );
  const selectedRunRef = useRef(activeRunId);
  const openRunRef = useRef<(row: MissionOperation) => Promise<void>>(
    async () => {},
  );
  useEffect(() => {
    const runner = createRecoveryClock({
      rows: () => operationsRef.current.rows,
      change: (id, action) => operationsRef.current.safetyChange(id, action),
      rate: () => playbackRate.current,
      frame: (row, time, running) => {
        if (row.id === selectedRunRef.current) {
          setRecoveryTime(time);
          setRecovering(running);
        }
      },
      error: (e) => setError(errorMessage(e)),
    });
    recoveryRunner.current = runner;
    const timer = setInterval(runner.tick, 100);
    return () => {
      clearInterval(timer);
      recoveryRunner.current = null;
    };
  }, []);
  useEffect(() => {
    const owners = ownedRuns.current,
      clocks = modelClocks.current;
    let previous = performance.now(),
      saving = false;
    const timer = setInterval(() => {
      const now = performance.now(),
        dt = Math.min(1, (now - previous) / 1000);
      previous = now;
      for (const id of ownedRuns.current) {
        const row = operationsRef.current.get(id);
        if (!row || row.status !== 'running' || row.safety) {
          ownedRuns.current.delete(id);
          modelClocks.current.delete(id);
          continue;
        }
        const t = Math.min(
          row.candidate.metrics.makespanSec,
          Math.max(
            row.progressSec,
            modelClocks.current.get(id) ?? row.progressSec,
          ) +
            dt * playbackRate.current,
        );
        modelClocks.current.set(id, t);
        if (id === selectedRunRef.current) {
          setTime(t);
          setPlaying(true);
        }
      }
      if (saving) return;
      saving = true;
      void (async () => {
        for (const id of ownedRuns.current) {
          const row = operationsRef.current.get(id);
          if (!row || row.status !== 'running') continue;
          const t = modelClocks.current.get(id) ?? row.progressSec;
          const vehicleId = returnReserveAlert(row.document, row.candidate, t);
          if (vehicleId && t < row.candidate.metrics.makespanSec) {
            await operationsRef.current.pause(id, t);
            ownedRuns.current.delete(id);
            const changed = await operationsRef.current.safetyChange(id, {
              type: 'detect',
              id: crypto.randomUUID(),
              kind: 'reserve',
              vehicleId,
              windMps: row.document.scenario.wind.speedMps,
              batteryPct: recoverySnapshot(row.document, row.candidate, t).find(
                (v) => v.vehicleId === vehicleId,
              )!.batteryPct,
            });
            await openRunRef.current(changed);
            setError('Проверка безопасного возврата: требуется внимание.');
          } else {
            const changed = await operationsRef.current.checkpoint(id, t);
            if (changed?.status === 'completed') {
              ownedRuns.current.delete(id);
              if (id === selectedRunRef.current) setPlaying(false);
            }
          }
        }
      })()
        .catch((e) => {
          ownedRuns.current.clear();
          setPlaying(false);
          setError(errorMessage(e));
        })
        .finally(() => {
          saving = false;
        });
    }, 100);
    return () => {
      clearInterval(timer);
      for (const id of owners) {
        const row = operationsRef.current.get(id);
        if (row?.status === 'running')
          void operationsRef.current
            .pause(id, clocks.get(id) ?? row.progressSec)
            .catch(() => undefined);
      }
      owners.clear();
    };
  }, []);
  useEffect(() => {
    playbackStop.current = async () => {
      const id = selectedRunRef.current;
      if (!id) return;
      const row = operationsRef.current.get(id);
      ownedRuns.current.delete(id);
      if (row?.status === 'running')
        await operationsRef.current.pause(
          id,
          modelClocks.current.get(id) ?? row.progressSec,
        );
      modelClocks.current.delete(id);
      setPlaying(false);
    };
  });
  useEffect(() => {
    if (!safety || safety.stage !== 'pending' || !activeRunId) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((Date.parse(safety.detectedAt) + 60_000 - Date.now()) / 1000),
      );
      setOperatorSeconds(left);
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [safety, activeRunId]);
  useEffect(() => {
    setRecoveryTime(
      operationsRef.current.get(activeRunId ?? '')?.safety?.progressSec ?? 0,
    );
    setRecovering(
      operationsRef.current.get(activeRunId ?? '')?.safety?.stage ===
        'returning',
    );
  }, [activeRunId]);
  async function triggerIncident() {
    if (incidentBusy.current || !activeRunId) return;
    incidentBusy.current = true;
    setOperationActionBusy(true);
    setPlaying(false);
    setError('');
    try {
      await playbackStop.current();
      const row = operationsRef.current.get(activeRunId);
      if (!row || row.status !== 'paused')
        throw new Error('Запустите симуляцию и выберите летящий аппарат.');
      const airborne = row.candidate.sorties.filter(
        (s) => s.startSec <= row.progressSec && row.progressSec < s.endSec,
      );
      const vehicleId =
        airborne.find((s) => s.vehicleId === displaySelected)?.vehicleId ??
        airborne[0]?.vehicleId;
      if (!vehicleId)
        throw new Error(
          'Сейчас нет БВС в воздухе. Продолжите выполнение до взлёта.',
        );
      setSelected(vehicleId);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      );
      const updated = await operationsRef.current.safetyChange(row.id, {
        type: 'detect',
        id: crypto.randomUUID(),
        kind: incidentKind,
        vehicleId,
        windMps:
          incidentKind === 'wind'
            ? incidentWind
            : document.scenario.wind.speedMps,
        batteryPct: incidentBattery,
      });
      setRecoveryTime(updated.progressSec);
      setOperatorSeconds(60);
      setWorkspace('execution');
      setFit((n) => n + 1);
      setRecovering(updated.safety?.stage === 'returning');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      incidentBusy.current = false;
      setOperationActionBusy(false);
    }
  }
  async function chooseRecovery(policy: 'home' | 'nearest') {
    if (!activeRunId || safetyDecisionBusy.current) return;
    safetyDecisionBusy.current = true;
    setOperationActionBusy(true);
    try {
      await operationsRef.current.safetyChange(activeRunId, {
        type: 'decide',
        policy,
        reason: 'operator',
      });
      setRecovering(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      safetyDecisionBusy.current = false;
      setOperationActionBusy(false);
    }
  }
  async function reviseActiveMission() {
    if (!activeRun || !candidate) return;
    if (
      !window.confirm(
        'После подтверждённой посадки остановить этот снимок и создать отдельный пересмотр миссии? История сохранится. Из остатка будут вычтены только полностью выполненные модельные проходы.',
      )
    )
      return;
    setPlaying(false);
    setRecovering(false);
    try {
      if (!safety) await playbackStop.current();
      const row = operationsRef.current.get(activeRun.id) ?? activeRun;
      const states = await operationsRef.current.listFleet();
      if (
        row.candidate.sorties.some(
          (s) => !states.find((v) => v.id === s.vehicleId)?.grounded,
        )
      )
        throw new Error(
          'Сначала завершите безопасный возврат группы. Пересмотр не переносит аппараты из воздуха на базу.',
        );
      const closed =
        row.status === 'cancelled'
          ? row
          : await operationsRef.current.cancel(row.id);
      const draft = await prepareGroundRevision(
        closed,
        await operationsRef.current.listFleet(),
        'Пересмотр по запросу оператора после безопасной посадки',
      );
      setActiveRunId(null);
      openPreview(draft, 'Пересмотр остатка · выполненные проходы сохранены');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    if (!mode) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !window.document.querySelector('dialog[open]')
      ) {
        setMode(null);
        setDraft([]);
        setMovingBaseId(null);
        setBasePreview(null);
        updateNotice({
          text:
            mode === 'base' || mode === 'reserve'
              ? 'Выбор точки отменён.'
              : 'Рисование отменено. Исходная область сохранена.',
          workspace: 'planning',
        });
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [mode]);
  function edit(next: MissionDocument, record = true) {
    next = synchronizeWorkSettings(next);
    try {
      upsertMission(demoDocuments, next);
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    const existing = operations.rows.find((r) => r.document.id === next.id);
    if (existing) {
      setError(
        'Сначала удалите запуск этой миссии из «Выполнения». Затем можно изменить и пересчитать её.',
      );
      return;
    }
    if (record && next.id === document.id) {
      const history =
        editHistories.current.get(next.id) ??
        new EditorHistory<MissionDocument>();
      history.record(document);
      editHistories.current.set(next.id, history);
      setHistoryVersion((n) => n + 1);
    }
    setRecovering(false);
    setPlanningStep('task');
    setWizard(true);
    revision.current++;
    request.current?.abort();
    setBusy(false);
    setPlaying(false);
    setActiveRunId(null);
    setRestoredSnapshot(false);
    setApproval(null);
    setTime(0);
    setError('');
    setDirty(true);
    setDocument(next);
    setDemoDocuments((ds) => upsertMission(ds, next));
    // Keep the last checked input/plan in Reports, even while its draft changes.
  }
  function undoEdit(redo = false) {
    if (operations.rows.some((r) => r.document.id === document.id)) return;
    const history = editHistories.current.get(document.id);
    const next = redo ? history?.redo(document) : history?.undo(document);
    if (!next) return;
    edit(next, false);
    setClearedAreaId(null);
    setAreaRestore(null);
    setMode(null);
    setDraft([]);
    setJobIndex((i) => Math.min(i, next.jobs.length - 1));
    setHistoryVersion((n) => n + 1);
  }
  function openPreview(
    next: MissionDocument,
    label: string,
    storedRevision?: number,
    imported = false,
  ) {
    previewTrialOrigin.current = null;
    setPreviewImport(imported);
    setImportFleetChoice(false);
    setImportCopyChoice(false);
    const existing = operations.rows.find((r) => r.document.id === next.id);
    if (existing && !imported) {
      void openOperation(existing);
      return;
    }
    setError('');
    setPreview(next);
    setPreviewName(label);
    setPreviewRevision(storedRevision);
    setPlaying(false);
    setModal('preview');
  }
  async function acceptPreview() {
    if (!preview || operationActionBusy) return;
    let incoming = preview;
    try {
      if (previewDuplicate) {
        if (!importCopyChoice)
          throw new Error(
            'Выберите создание копии или откройте существующую миссию.',
          );
        incoming = {
          ...incoming,
          id: `mission-${crypto.randomUUID().slice(0, 20)}`,
          name: `${incoming.name.slice(0, 90)} · копия`,
        };
      }
      if (previewConflicts.length) {
        if (!importFleetChoice)
          throw new Error(
            'Параметры БВС отличаются от общего парка. Подтвердите использование общего парка либо отмените импорт и задайте другим аппаратам новые ID.',
          );
        incoming = reconcileImportedFleet(
          incoming,
          demoDocuments,
          await operations.listFleet(),
        );
      }
      incoming = installedBatteryDocument(incoming);
      upsertMission(demoDocuments, incoming);
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    if (previewTrialOrigin.current) {
      setOperationActionBusy(true);
      try {
        const reports = simulatedTrialFleetChanges(
          previewTrialOrigin.current,
          preview,
          await operations.listFleet(),
          new Date().toISOString(),
        );
        for (const report of reports) await operations.reportFleet(report);
        if (reports.length)
          setDemoDocuments((ds) =>
            ds.map((d) => ({
              ...d,
              scenario: {
                ...d.scenario,
                vehicles: d.scenario.vehicles.map(
                  (v) =>
                    reports.find((r) => r.state.id === v.id)?.state.vehicle ??
                    v,
                ),
              },
              batteries: d.batteries.map((b) => {
                const state = reports.find(
                  (r) => r.state.id === b.vehicleId,
                )?.state;
                return state ? { ...state.battery, readyAt: b.readyAt } : b;
              }),
            })),
          );
        previewTrialOrigin.current = null;
      } catch (e) {
        setError(errorMessage(e));
        return;
      } finally {
        setOperationActionBusy(false);
      }
    }
    setOpenedDemo(true);
    setClearedAreaId(null);
    setAreaRestore(null);
    setTerritoryEditing(false);
    setBoundaryEditing(false);
    setSelectedBase(null);
    edit(incoming, false);
    setSavedRevision(previewRevision);
    setDirty(
      previewRevision === undefined ||
        !preview.planning.batteryPolicy ||
        !preview.planning.safetyPolicy,
    );
    setResult(null);
    setJobIndex(
      Math.max(
        0,
        preview.jobs.findIndex((j) => j.id === previewJobId.current),
      ),
    );
    previewJobId.current = null;
    setSelected(preview.scenario.vehicles[0].id);
    setFit((x) => x + 1);
    setMode(null);
    setDraft([]);
    setModal(null);
    setWizard(true);
    setEditorSession((n) => n + 1);
    setWorkspace('planning');
    setPlanningStep('task');
    setNotice('Миссия открыта в редакторе.');
  }
  async function calculate() {
    if (busy) return;
    const invalidDate = window.document.querySelector<HTMLInputElement>(
      '.expert-date-field input[aria-invalid="true"]',
    );
    if (invalidDate) {
      setError('Исправьте дату или время в редакторе перед расчётом.');
      invalidDate.focus();
      return;
    }
    if (validation) {
      setError(validation);
      return;
    }
    if (mode) {
      setError(
        'Завершите или отмените рисование (Esc), затем рассчитайте варианты. Исходная карта сохранена.',
      );
      return;
    }
    request.current?.abort();
    const controller = new AbortController(),
      rev = ++revision.current,
      sequence = ++calculationSequence.current;
    request.current = controller;
    setError('');
    setPlaying(false);
    setActiveRunId(null);
    setRestoredSnapshot(false);
    setApproval(null);
    setTime(0);
    setResult(null);
    setBusy(true);
    setWizard(false);
    setWorkspace('planning');
    setPlanningStep('variants');
    try {
      if (operations.rows.some((r) => r.document.id === document.id))
        throw new Error(
          'Удалите предыдущий запуск этой миссии перед новым расчётом.',
        );
      const otherOperations = await operations.refresh();
      const known = await operations.listFleet();
      // Camera bindings are an explicit working-draft migration before polling.
      // Saved executions and their old hashes are never rewritten here.
      const workingDocument = migrateMissionCameraBindings(document).document;
      for (const v of workingDocument.scenario.vehicles) {
        const previous = known.find((s) => s.id === v.id);
        if (previous?.operationId) continue;
        const state = structuredClone(
          previous ??
            fleetStateFromDocument(
              workingDocument,
              v.id,
              new Date().toISOString(),
            ),
        );
        // A recalculation is a poll, not a battery replacement. Shared missions
        // cannot restore spent charge or move an aircraft using an older draft.
        const polledVehicle =
          previous &&
          state.vehicle.cameraIds === undefined &&
          state.vehicle.cameraProfiles === undefined
            ? migrateMissionCameraBindings({
                ...workingDocument,
                scenario: {
                  ...workingDocument.scenario,
                  vehicles: [state.vehicle],
                },
              }).document.scenario.vehicles[0]
            : state.vehicle;
        state.vehicle = previous
          ? { ...polledVehicle, enabled: v.enabled }
          : { ...v };
        state.ready =
          v.enabled &&
          state.grounded &&
          (!previous || state.ready || !previous.vehicle.enabled);
        state.source = 'simulation';
        state.observedAt = new Date(
          Math.max(Date.now(), Date.parse(state.observedAt) + 1),
        ).toISOString();
        state.lastEvent = 'Симулятор: опрос выполнен';
        await operations.reportFleet({
          expectedRevision: previous?.revision ?? 0,
          state,
          replacement: false,
        });
      }
      const input = withMissionReservations(
        refreshMissionFleetState(workingDocument, await operations.listFleet()),
        otherOperations,
      );
      // A new editor calculation opts into multi-area flights; archived snapshots stay immutable.
      input.planning.areaTransferPolicy = 'compatible-work-v1';
      if (rev !== revision.current || controller.signal.aborted) return;
      setDocument(input);
      setDirty(true);
      const response = await fetch(
        input.obstacleLayer || input.catalogLayers
          ? '/api/planner/missions/solve-with-obstacles'
          : '/api/planner/missions/solve',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal,
        },
      );
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
      setDocument(data.document);
      setDemoSelection((s) => ({
        ...s,
        [data.document.id]:
          data.candidates.find((c) => c.objective === input.scenario.objective)
            ?.id ??
          data.candidates[0]?.id ??
          '',
      }));
      setDemoResults((rs) => ({ ...rs, [data.document.id]: data }));
      setDemoDocuments((ds) =>
        ds.map((d) => (d.id === data.document.id ? data.document : d)),
      );
      setCandidateId(
        data.candidates.find((c) => c.objective === input.scenario.objective)
          ?.id ??
          data.candidates[0]?.id ??
          '',
      );
      setWizard(false);
      setWorkspace('planning');
      setPlanningStep('variants');
      setFit((n) => n + 1);
      setNotice('Расчёт завершён. Выберите план и откройте его проверки.');
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
    if (validation) {
      setError(validation);
      return;
    }
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
    setPlanningStep('confirm');
    setNotice('Модельный план подтверждён.');
  }
  function chooseCandidate(id: string) {
    if (id === candidateId) return;
    revision.current++;
    setCandidateId(id);
    setDemoSelection((s) => ({ ...s, [document.id]: id }));
    setApproval(null);
    setPlaying(false);
    setActiveRunId(null);
    setTime(0);
    setFit((n) => n + 1);
  }
  async function scheduleOperation(startNow: boolean) {
    if (validation) {
      setError(validation);
      return;
    }
    if (safety) {
      setError(
        'Исходный план остановлен. Завершите защитный сценарий и создайте пересмотр миссии.',
      );
      return;
    }
    if (
      !isApproved ||
      !candidate ||
      !approval ||
      !current ||
      operationActionBusy
    )
      return;
    setOperationActionBusy(true);
    setError('');
    const rev = revision.current;
    try {
      if (rev !== revision.current) return;
      setPlaying(false);
      let row = activeRunId
        ? operations.get(activeRunId)
        : (operations.rows.find((r) => r.document.id === current.document.id) ??
          null);
      if (
        row &&
        (row.inputHash !== approval.inputHash ||
          row.planHash !== approval.planHash ||
          row.status === 'completed' ||
          row.status === 'cancelled')
      )
        throw new Error(
          'Удалите прежний запуск этой миссии перед повторным выполнением.',
        );
      if (
        !row ||
        row.inputHash !== approval.inputHash ||
        row.planHash !== approval.planHash ||
        row.status === 'completed' ||
        row.status === 'cancelled'
      ) {
        row = await operations.enqueue({
          id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          document: current.document,
          candidate,
          approval,
        });
      }
      if (rev !== revision.current) return;
      if (row.status === 'running')
        throw new Error(
          'В журнале остался незавершённый запуск. Откройте «Мои миссии» и явно нажмите «Зафиксировать паузу». Автоматический перехват другой вкладки запрещён.',
        );
      if (rev !== revision.current) return;
      if (startNow) {
        row = await operations.start(row.id);
        ownedRuns.current.add(row.id);
        modelClocks.current.set(row.id, row.progressSec);
      }
      if (rev !== revision.current) {
        if (row.status === 'running')
          await operations.pause(row.id, row.progressSec);
        return;
      }
      setActiveRunId(row.id);
      setTime(row.progressSec);
      setPlaying(row.status === 'running' && ownedRuns.current.has(row.id));
      setWorkspace(startNow ? 'execution' : 'missions');
      setMode(null);
      setDraft([]);
      setNotice(
        startNow
          ? 'Модельный полёт начат. Журнал сохраняется.'
          : row.status === 'paused'
            ? 'Снимок уже сохранён на паузе. Продолжить можно из «Мои миссии» или кнопкой «Выполнить миссию».'
            : 'Подтверждённый снимок в очереди. Запуск только вручную из «Мои миссии»; реальные часы его не запускают.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOperationActionBusy(false);
    }
  }
  async function openOperation(snapshot: MissionOperation, startNow = false) {
    if (
      dirty &&
      !window.confirm(
        'Открыть сохранённый снимок? Несохранённые правки текущей миссии будут заменены.',
      )
    )
      return;
    setOperationActionBusy(true);
    setError('');
    const rev = ++revision.current;
    request.current?.abort();
    setBusy(false);
    setPlaying(false);
    try {
      if (revision.current !== rev) return;
      let row = operations.get(snapshot.id) ?? snapshot;
      if (startNow) {
        row = await operations.start(row.id);
        ownedRuns.current.add(row.id);
        modelClocks.current.set(row.id, row.progressSec);
      }
      if (revision.current !== rev) {
        if (startNow && row.status === 'running')
          await operations.pause(row.id, row.progressSec);
        return;
      }
      setDocument(structuredClone(row.document));
      setClearedAreaId(null);
      setTerritoryEditing(false);
      setResult({
        schemaVersion: '2.0',
        engineVersion: row.engineVersion,
        inputHash: row.inputHash,
        createdAt: row.createdAt,
        document: row.document,
        candidates: [row.candidate],
        computationMs: 0,
        warnings: [
          'Открыт сохранённый снимок одного варианта; новый расчёт не выполнялся.',
        ],
      });
      setCandidateId(row.candidate.id);
      setApproval(row.approval);
      setActiveRunId(row.id);
      setTime(row.progressSec);
      setRestoredSnapshot(true);
      setJobIndex(0);
      setSelected(
        row.candidate.sorties[0]?.vehicleId ??
          row.document.scenario.vehicles[0].id,
      );
      setSavedRevision(undefined);
      setDirty(false);
      setWizard(false);
      setMode(null);
      setDraft([]);
      setFit((n) => n + 1);
      setModal(null);
      setPlaying(row.status === 'running' && ownedRuns.current.has(row.id));
      setWorkspace(
        row.status === 'completed' || row.status === 'cancelled'
          ? 'results'
          : 'execution',
      );
      setNotice(
        startNow
          ? 'Модель возобновлена с сохранённого времени.'
          : 'Открыт подтверждённый снимок и его маршруты. Ползунок — просмотр; сохранённая история назад не перематывается.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOperationActionBusy(false);
    }
  }
  useEffect(() => {
    selectedRunRef.current = activeRunId;
    openRunRef.current = openOperation;
  });
  async function pauseOperation(row: MissionOperation) {
    try {
      if (row.id === activeRunId && playing) {
        await playbackStop.current();
        setPlaying(false);
      } else await operations.pause(row.id, row.progressSec);
    } catch (e) {
      setPlaying(false);
      setError(errorMessage(e));
    }
  }
  async function cancelOperation(row: MissionOperation) {
    if (
      !window.confirm(
        `Отменить выполнение «${row.document.name}»? Снимок и история сохранятся; реальным БВС команда не отправляется.`,
      )
    )
      return;
    try {
      if (row.id === activeRunId) {
        await playbackStop.current();
        setPlaying(false);
      }
      await operations.cancel(row.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function save(_copy = false) {
    try {
      if (validation) throw new Error(validation);
      if (mode) throw new Error('Завершите рисование перед сохранением.');
      const d = parseMissionDocument(document);
      setDemoDocuments((ds) => upsertMission(ds, d));
      setDirty(false);
      setNotice(
        'Изменения сохранены в карточке этой сессии. JSON можно скачать в меню.',
      );
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }
  async function showLibrary() {
    setError('');
    setModal('library');
    setArchiveId(null);
    try {
      setLibraryRows(await library.current!.list(true));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function saveAs() {
    if (copyBusy) return;
    if (mode) {
      setError('Сначала примените контур или отмените рисование.');
      return;
    }
    if (validation) {
      setError(validation);
      return;
    }
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
        throw new Error('Библиотека недоступна. Сохраните миссия файлом JSON.');
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
      setLibraryRows(await library.current.list(true));
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
  function importObjects(role: GeometryRole) {
    requestedGeometryRole.current = role;
    geoFile.current?.click();
  }
  function showMapObjects() {
    setWorkspace('planning');
    setPlanningStep('task');
    setWizard(true);
    requestAnimationFrame(() => {
      const panel = window.document.querySelector<HTMLDetailsElement>(
        '.mission-data-panel',
      );
      if (panel) {
        panel.open = true;
        panel.scrollIntoView({ block: 'nearest' });
      }
    });
  }
  async function applyBaseChanges(next: MissionDocument, undoing = false) {
    if (busy || operationActionBusy || baseChangeLock.current)
      throw new Error('Дождитесь окончания текущего действия.');
    baseChangeLock.current = true;
    setOperationActionBusy(true);
    try {
      const changes = changedBaseVehicles(document, next);
      const originalBases = missionBases(document);
      const changedBaseIds = new Set(
        [...originalBases, ...(next.bases ?? [])]
          .filter(
            (b) =>
              JSON.stringify(originalBases.find((o) => o.id === b.id)) !==
              JSON.stringify(next.bases?.find((n) => n.id === b.id)),
          )
          .map((b) => b.id),
      );
      const rows = await operations.refresh();
      if (rows.some((r) => r.document.id === document.id))
        throw new Error(
          'Для этой миссии уже сохранён запуск. Откройте её копию в редакторе; история останется неизменной.',
        );
      if (
        changes.length &&
        rows.some((r) => !['completed', 'cancelled'].includes(r.status))
      )
        throw new Error(
          'Есть запланированные или выполняемые миссии. Завершите или отмените их перед переносом общего парка.',
        );
      const affected = demoDocuments.filter(
        (d) =>
          d.id !== document.id &&
          (d.scenario.vehicles.some((v) =>
            changes.some((x) => x.id === v.id),
          ) ||
            missionBases(d).some((b) => changedBaseIds.has(b.id))),
      );
      const known = await operations.listFleet();
      const reports = changes.map((v) => {
        const old = known.find((s) => s.id === v.id);
        const state = structuredClone(
          old ??
            fleetStateFromDocument(document, v.id, new Date().toISOString()),
        );
        if (state.operationId || !state.grounded)
          throw new Error(`БВС ${v.name} не свободен на земле.`);
        state.vehicle = {
          ...state.vehicle,
          start: v.start,
          landing: v.landing,
        };
        state.source = 'simulation';
        state.observedAt = new Date(
          Math.max(Date.now(), Date.parse(state.observedAt) + 1),
        ).toISOString();
        state.lastEvent = 'Оператор изменил модельное размещение БВС на базе';
        return {
          expectedRevision: old?.revision ?? 0,
          state,
          replacement: false,
        };
      });
      // Validate all affected drafts before writing the shared fleet transaction.
      const updated = reports.map((r) => r.state);
      const oldBaseIds = new Set(missionBases(document).map((b) => b.id));
      const propagate = (d: MissionDocument): MissionDocument => {
        if (d.id !== next.id && !affected.some((a) => a.id === d.id)) return d;
        const out = {
          ...d,
          scenario: {
            ...d.scenario,
            vehicles: d.scenario.vehicles.map(
              (v) => updated.find((s) => s.id === v.id)?.vehicle ?? v,
            ),
          },
          batteries: d.batteries.map((b) => {
            const s = updated.find((s) => s.id === b.vehicleId);
            return s ? { ...s.battery, readyAt: b.readyAt } : b;
          }),
          bases:
            d.id === next.id
              ? next.bases
              : [
                  ...(d.bases ?? []).filter(
                    (b) =>
                      !oldBaseIds.has(b.id) &&
                      !next.bases?.some((n) => n.id === b.id),
                  ),
                  ...(next.bases ?? []),
                ],
        };
        return out;
      };
      const activeNext = propagate(next);
      let nextDocuments = demoDocuments.map((d) =>
        d.id === next.id ? activeNext : propagate(d),
      );
      for (const d of nextDocuments.filter(
        (d) => d === activeNext || affected.some((a) => a.id === d.id),
      )) {
        try {
          parseMissionDocument(d);
        } catch (e) {
          throw new Error(
            `Изменение базы не применено: проверьте миссию «${d.name}». ${errorMessage(e)}`,
          );
        }
      }
      nextDocuments = upsertMission(nextDocuments, activeNext);
      if (reports.length) await operations.reportFleetBatch(reports);
      edit(activeNext);
      setDemoDocuments(nextDocuments);
      for (const d of [document, ...affected])
        editHistories.current.delete(d.id);
      setHistoryVersion((n) => n + 1);
      setBoundaryEditing(false);
      setTerritoryEditing(false);
      setMode(null);
      setMovingBaseId(null);
      setBasePreview(null);
      setPickedMapPoint(null);
      setBaseUndo(
        undoing
          ? null
          : {
              before: structuredClone(document),
              after: synchronizeWorkSettings(activeNext),
            },
      );
      setBaseFeedback({
        missionId: document.id,
        text: undoing
          ? 'Изменение базы отменено.'
          : `База обновлена. БВС и заряд сохранены.${affected.length ? ` Обновлены также миссии: ${affected.length}.` : ''} Пересчитайте план.`,
      });
    } finally {
      baseChangeLock.current = false;
      setOperationActionBusy(false);
    }
  }
  async function moveBase(id: string, point: Coordinate): Promise<boolean> {
    try {
      if (baseChangeLock.current)
        throw new Error('Дождитесь окончания переноса базы.');
      setBasePreview(point);
      await applyBaseChanges(moveMissionBase(document, id, point));
      setSelectedBase(id);
      return true;
    } catch (e) {
      setBaseFeedback({
        missionId: document.id,
        text: errorMessage(e),
        error: true,
      });
      return false;
    } finally {
      setBasePreview(null);
      setMovingBaseId(null);
      setMode(null);
    }
  }
  function pickBase(kind: 'base' | 'reserve', id?: string) {
    setMovingBaseId(id ?? null);
    setBasePreview(null);
    setPickedMapPoint(null);
    setMode(kind);
    setDraft([]);
    setTerritoryEditing(false);
    setBoundaryEditing(false);
    setBaseFeedback(null);
  }
  async function undoBaseChange() {
    if (!baseUndo) return;
    try {
      if (canonicalStringify(document) !== canonicalStringify(baseUndo.after))
        throw new Error(
          'Миссия уже изменена. Перенесите базу заново, чтобы не отменить последующие правки.',
        );
      await applyBaseChanges(baseUndo.before, true);
    } catch (e) {
      setBaseFeedback({
        missionId: document.id,
        text: errorMessage(e),
        error: true,
      });
    }
  }
  async function loadFile(f: File, geometryOnly = false) {
    try {
      if (
        f.size >
        (geometryOnly ? MAX_MISSION_FILE_BYTES : MAX_OBSTACLE_MISSION_BYTES)
      )
        throw new Error(
          'Файл превышает предел: геометрия 200 КиБ, миссия с источником препятствий 12 МиБ.',
        );
      const text = await f.text();
      if (geometryOnly) {
        setError('');
        setGeometry({
          text,
          format: /\.kml$/i.test(f.name) ? 'kml' : 'geojson',
          name: f.name,
        });
        setGeometryRole(requestedGeometryRole.current);
        setModal('geometry');
      } else
        openPreview(
          parseMissionText(text, /\.ya?ml$/i.test(f.name) ? 'yaml' : 'auto'),
          f.name,
          undefined,
          true,
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
    } else if (geometryRole === 'airspace') {
      if (polygons.length !== 1) {
        setError(
          'Для общей границы выберите файл с одним полигоном. Миссия не изменена.',
        );
        return;
      }
      d.scenario.airspace = polygons[0].geometry;
    } else if (geometryRole === 'exclusion') {
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
      polygons.forEach((p) => validatePolygonTopology(p.geometry));
      edit(parseSizedMissionDocument(d));
      if (geometryRole === 'area' && currentJob.id === clearedAreaId)
        setClearedAreaId(null);
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
    setBoundaryEditing(drawMode === 'airspace');
    setDrawTool('polygon');
    // A finished restriction must not expose unrelated work-area drag handles.
    setTerritoryEditing(drawMode === 'area');
    setWizard(true);
    setWorkspace('planning');
    setPlanningStep('task');
    setDraft([]);
    setMode((currentMode) => (currentMode === drawMode ? null : drawMode));
    setPlaying(false);
  }
  function mapPoint(point: Coordinate) {
    if (!mode) return;
    if (mode === 'base' || mode === 'reserve') {
      if (mode === 'base' && movingBaseId) {
        void moveBase(movingBaseId, point);
        return;
      }
      if (mode === 'base') setBasePreview(point);
      setPickedMapPoint({ kind: mode, point, key: Date.now() });
      setMode(null);
      return;
    }
    if (mode === 'start' || mode === 'landing') {
      edit({
        ...document,
        scenario: {
          ...document.scenario,
          vehicles: document.scenario.vehicles.map((v) =>
            v.id === selected ? { ...v, [mode]: point } : v,
          ),
        },
      });
      setMode(null);
    } else if (draft.length < 69) {
      const points = [...draft, point];
      const loop = firstDrawingLoop(points);
      if (loop) finishDrawing(loop);
      else setDraft(points);
    } else setError('В одном контуре допускается до 69 вершин.');
  }
  function finishDrawing(points: Coordinate[] = draft) {
    if (points.length < 3) return;
    try {
      const shape = closedDrawing(
        points,
        mode === 'area' && clearedAreaId !== currentJob.id
          ? currentJob.area.coordinates.slice(1)
          : mode === 'airspace'
            ? document.scenario.airspace.coordinates.slice(1)
            : [],
      );
      let next = document;
      if (mode === 'area')
        next = {
          ...document,
          jobs: document.jobs.map((j) =>
            j.id === currentJob.id ? { ...j, area: shape } : j,
          ),
        };
      else if (mode === 'airspace')
        next = {
          ...document,
          scenario: { ...document.scenario, airspace: shape },
        };
      else if (mode === 'exclusion') {
        if (document.restrictions.length >= 20) {
          setError('Достигнут предел 20 ограничений.');
          return;
        }
        next = {
          ...document,
          restrictions: [
            ...document.restrictions,
            {
              id: `zone-${crypto.randomUUID()}`,
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
        };
      }
      // Validate before replacing the last valid geometry. Invalid drafts stay editable.
      edit(parseMissionDocument(next));
      if (mode === 'area' && currentJob.id === clearedAreaId)
        setClearedAreaId(null);
      setMode(null);
      setDraft([]);
      setFit((n) => n + 1);
      setNotice('Контур применён. Сохраните миссию и пересчитайте варианты.');
    } catch (e) {
      setError(
        `Контур не применён: ${errorMessage(e)}. Исправьте точки или нажмите Esc.`,
      );
    }
  }
  function exportTask(format: 'json' | 'yaml' | 'md') {
    try {
      if (validation) throw new Error(validation);
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
    if (validation) {
      setError(validation);
      return;
    }
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
  async function exportRun(html = false) {
    if (!activeRun) return;
    try {
      const report = await missionRunReport(activeRun, operations.rows);
      download(
        `${activeRun.id}.report.${html ? 'html' : 'json'}`,
        html ? missionRunReportHtml(report) : JSON.stringify(report, null, 2),
        html ? 'text/html' : 'application/json',
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function changeDemoAvailability(
    vehicleId: string,
    enabled: boolean,
    configuration?: string,
    maintenance?: NonNullable<
      MissionDocument['scenario']['vehicles'][number]['maintenance']
    >,
    cameras?: CameraPatch,
  ) {
    if (operationActionBusy || busy) return;
    if (
      operations.rows.some(
        (r) =>
          ['scheduled', 'running', 'paused'].includes(r.status) &&
          r.candidate.sorties.some((s) => s.vehicleId === vehicleId),
      )
    ) {
      setError('БВС занят. Дождитесь завершения его миссии.');
      return;
    }
    setOperationActionBusy(true);
    try {
      const source = demoDocuments.find((d) =>
        d.scenario.vehicles.some((v) => v.id === vehicleId),
      );
      if (!source) return;
      const known = (await operations.listFleet()).find(
        (s) => s.id === vehicleId,
      );
      const state = structuredClone(
        known ??
          fleetStateFromDocument(source, vehicleId, new Date().toISOString()),
      );
      const old = state.vehicle;
      state.vehicle = {
        ...old,
        ...(configuration && old.model !== 'Custom'
          ? catalogueCameraConfiguration(old.model, configuration)
          : {}),
        ...cameras,
        id: old.id,
        name: configuration ? `Геоскан ${old.model} · ${old.id}` : old.name,
        start: old.start,
        landing: old.landing,
        batteryPct: state.battery.initialPct,
        maintenance: maintenance ?? old.maintenance,
        enabled,
      };
      state.ready = enabled && state.grounded;
      state.source = 'simulation';
      state.observedAt = new Date(
        Math.max(Date.now(), Date.parse(state.observedAt) + 1),
      ).toISOString();
      state.lastEvent = maintenance
        ? 'Симулятор: оператор обновил наработку аппарата после ТО'
        : configuration || cameras
          ? 'Симулятор: изменено установленное оборудование'
          : 'Изменена доступность в общем парке';
      await operations.reportFleet({
        state,
        expectedRevision: known?.revision ?? 0,
        replacement: false,
      });
      const update = (d: MissionDocument): MissionDocument => ({
        ...d,
        scenario: {
          ...d.scenario,
          vehicles: d.scenario.vehicles.map((v) =>
            v.id === vehicleId ? { ...state.vehicle } : v,
          ),
        },
        batteries: d.batteries.map((b) =>
          b.vehicleId === vehicleId
            ? { ...state.battery, readyAt: b.readyAt }
            : b,
        ),
      });
      const ownsRun = operations.rows.some(
        (r) => r.document.id === document.id,
      );
      if (
        !ownsRun &&
        document.scenario.vehicles.some((v) => v.id === vehicleId)
      )
        edit(update(document));
      setDemoDocuments((ds) =>
        ds.map((d) =>
          d.scenario.vehicles.some((v) => v.id === vehicleId) ? update(d) : d,
        ),
      );
      setNotice(
        'Парк обновлён для всех миссий. Предыдущие проверки сохранены; изменения требуют нового расчёта.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOperationActionBusy(false);
    }
  }
  async function deleteDemoRun(documentId: string) {
    const row = operations.rows.find((r) => r.document.id === documentId);
    if (!row) return;
    if (
      !window.confirm(
        'Удалить модельное выполнение и его журнал? Предустановленная миссия останется для повторного редактирования.',
      )
    )
      return;
    setOperationActionBusy(true);
    ownedRuns.current.delete(row.id);
    modelClocks.current.delete(row.id);
    if (activeRunId === row.id) setPlaying(false);
    try {
      await recoveryRunner.current?.pause(row.id);
      await operations.removeDemo(row.id);
      recoveryRunner.current?.forget(row.id);
      recordings.forget(row.id);
      if (activeRunId === row.id) {
        setActiveRunId(null);
        setApproval(null);
        setResult(null);
        setTime(0);
        setRestoredSnapshot(false);
        setWorkspace('missions');
      }
      setDemoResults((rs) => {
        const next = { ...rs };
        delete next[documentId];
        return next;
      });
      setNotice('Выполнение и журнал удалены. Миссию можно запустить заново.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOperationActionBusy(false);
    }
  }
  async function downloadDemoArtifact(id: string, kind: DemoDownload) {
    if (exportBusy) return;
    const row = operations.rows.find((r) => r.document.id === id);
    if (kind === 'video') {
      if (!row) return;
      try {
        await recordings.download(row.id);
      } catch (e) {
        setError(errorMessage(e));
      }
      return;
    }
    const result = demoResults[id];
    const doc = row?.document ?? result?.document;
    const selected =
      row?.candidate ??
      (current?.document.id === id ? candidate : undefined) ??
      (demoSelection[id] === 'balanced'
        ? result?.recommendation?.candidate
        : result?.candidates.find((c) => c.id === demoSelection[id])) ??
      result?.candidates[0];
    if (!doc || !selected) return;
    setExportBusy(true);
    try {
      const archive =
        selected.status === 'feasible_model'
          ? await buildMissionArchive(doc, selected, row, operations.rows)
          : await buildMissionDiagnosticArchive(doc, selected);
      if (kind === 'kml' || kind === 'geojson') {
        if (selected.status !== 'feasible_model')
          throw new Error('Нет допустимых маршрутов. Откройте проверки плана.');
        const files = Object.fromEntries(
          Object.entries(archive.files)
            .filter(
              ([path]) =>
                path.startsWith('data/routes/') && path.endsWith(`.${kind}`),
            )
            .map(([path, text]) => [path.replace('data/routes/', ''), text]),
        );
        if (!Object.keys(files).length)
          throw new Error('В плане нет маршрутов назначенных БВС.');
        files['README.md'] =
          `# Маршруты по БВС\n\nМиссия: ${doc.name}\nID: ${doc.id}\nЗапуск: ${row?.id ?? 'только план'}\n\nКаждый файл относится к одному БВС. Высоты, скорости, этапы и временные метки — в свойствах. Полный вход и проверки доступны в «Доказательства ZIP». Это модельный план, не команды подключённому автопилоту.\n`;
        const url = URL.createObjectURL(
          new Blob([createStoredZip(files)], { type: 'application/zip' }),
        );
        const link = window.document.createElement('a');
        link.href = url;
        link.download = `${id}.routes-${kind}.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } else if (kind === 'view') {
        setReportPreview(archive.files['data/report.html']);
        setModal('report-preview');
      } else if (kind === 'report')
        download(
          `${id}.report.html`,
          archive.files['data/report.html'],
          'text/html',
        );
      else if (kind === 'checks')
        download(
          `${id}.checks.json`,
          archive.files['data/checks/validation.json'],
        );
      else {
        const url = URL.createObjectURL(
          new Blob([archive.bytes], { type: 'application/zip' }),
        );
        const link = window.document.createElement('a');
        link.href = url;
        link.download = `${id}.evidence.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      setNotice('Файл подготовлен.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExportBusy(false);
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
  const revealChecks = () => {
    setReviewMissionId(current?.document.id ?? document.id);
    setWorkspace('results');
    setResultsTab('analysis');
  };
  const openReportChecks = (id: string) => {
    setReviewMissionId(id);
    setWorkspace('results');
    setResultsTab('analysis');
  };
  return (
    <main
      className="mission-workbench expert-workbench demo-workbench"
      data-workspace={workspace}
      data-execution-tab={executionTab}
      style={
        { '--panel-share': panelWidth + '%' } as import('react').CSSProperties
      }
      data-planning-step={planningStep}
      data-focus={focusMode}
      data-results-tab={resultsTab}
      data-safety-active={!!safety}
      data-territory-editing={territoryEditing || !!mode}
    >
      <header className="mw-appbar">
        <button
          className="mw-brand"
          aria-label="Планер — список миссий"
          onClick={() => setWorkspace('missions')}
        >
          <Image
            unoptimized
            className="mw-brand-image"
            src="/planner/branding/planner-brush.png"
            alt="Planner"
            width={2048}
            height={768}
            draggable={false}
          />
        </button>
        <Tabs
          className="mw-workspace-tabs"
          value={workspace}
          onValueChange={(value) => {
            setMode(null);
            setDraft([]);
            setWorkspace(String(value));
            setFocusMode(false);
            if (value === 'results') setResultsTab('summary');
          }}
        >
          <TabsList aria-label="Разделы стенда" variant="line">
            {(
              [
                ['missions', 'Миссии'],
                ['planning', 'Редактор'],
                ['execution', 'Выполнение'],
                ['results', 'Отчёт'],
                ['fleet', 'Парк БВС'],
              ] as const
            ).map(([id, label]) => (
              <TabsTrigger
                key={id}
                id={`workspace-${id}`}
                value={id}
                aria-controls="workspace-content"
                disabled={
                  !hydrated ||
                  (!openedDemo && (id === 'planning' || id === 'execution'))
                }
                onClick={() => {
                  if (workspace === 'results' && id === 'missions')
                    setWorkspace('missions');
                }}
              >
                {label}
                {id === 'execution' &&
                  (playing || recovering || safety?.stage === 'pending') && (
                    <span className="mw-live-label">
                      {safety ? 'Событие' : 'Идёт симуляция'}
                    </span>
                  )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div
          className="mw-actions mw-header-actions"
          hidden={
            workspace === 'missions' ||
            workspace === 'fleet' ||
            workspace === 'results'
          }
        >
          {workspace === 'planning' && planningStep === 'task' && (
            <span
              className="mw-undo-controls"
              data-history-version={historyVersion}
            >
              <button
                className="mw-button small"
                aria-label="Отменить изменение"
                title="Отменить изменение"
                disabled={
                  !editHistories.current.get(document.id)?.canUndo ||
                  !!activeRun
                }
                onClick={() => undoEdit()}
              >
                ↶
              </button>
              <button
                className="mw-button small"
                aria-label="Повторить изменение"
                title="Повторить изменение"
                disabled={
                  !editHistories.current.get(document.id)?.canRedo ||
                  !!activeRun
                }
                onClick={() => undoEdit(true)}
              >
                ↷
              </button>
            </span>
          )}
          <button
            className="mw-button mw-edit-action"
            hidden={workspace !== 'planning' || planningStep === 'task'}
            onClick={() => {
              setWizard(true);
              setWorkspace('planning');
              setPlanningStep('task');
              setPlaying(false);
            }}
          >
            <Settings2 size={15} />
            Редактировать
          </button>
          <button
            className="mw-button mw-plan-action"
            hidden={workspace !== 'planning' || planningStep !== 'task'}
            onClick={() => void save()}
          >
            <Save size={15} />
            Сохранить
          </button>
          <button
            className="mw-button square"
            aria-label="Действия с этой миссией"
            title="Действия с этой миссией"
            onClick={() => setModal('mission-actions')}
          >
            <MoreHorizontal size={20} />
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
        <MissionNotificationCenter
          compact
          modalKey={modal ?? ''}
          entries={[
            ...(operations.error
              ? [
                  {
                    id: 'journal-error',
                    title: 'Журнал миссий',
                    text: operations.error,
                    tone: 'warning' as const,
                    onDismiss: operations.dismissError,
                  },
                ]
              : []),
            ...(error
              ? [
                  {
                    id: 'workbench-error',
                    title: 'Требуется внимание',
                    text: error,
                    tone: 'warning' as const,
                    onDismiss: () => setError(''),
                  },
                ]
              : []),
            ...(notice
              ? [
                  {
                    id: 'workbench-notice',
                    title: 'Миссия',
                    text: notice.text,
                    tone: 'info' as const,
                    onDismiss: () => updateNotice(null),
                  },
                ]
              : []),
            ...(validation && workspace === 'planning'
              ? [
                  {
                    id: 'input-validation',
                    title: 'Проверьте миссию',
                    text: validation,
                    tone: 'warning' as const,
                  },
                ]
              : []),
            ...(operations.rejected.some((row) => !row.archived)
              ? [
                  {
                    id: 'journal-review',
                    title: 'Сохранённая история',
                    tone: 'warning' as const,
                    text: `Старые снимки требуют проверки: ${operations.rejected.filter((row) => !row.archived).length}. Исходные миссии сохранены.${operations.rejected.some((row) => row.blocksExecution) ? ' Перед новым запуском подтвердите остановку старой симуляции.' : ' Их можно открыть отдельной копией и пересчитать.'}`,
                    action: {
                      label: 'Проверить снимки',
                      onClick: () => setModal('journal-review'),
                    },
                  },
                ]
              : []),
          ]}
        />
        <button
          className="mw-settings-button"
          aria-label="Настройки и справка"
          title="Настройки и справка"
          onClick={() => setModal('settings')}
        >
          <Settings size={21} />
        </button>
      </header>
      <nav
        className="mw-navigation-row"
        aria-label="Возврат к предыдущему экрану"
      >
        <button
          className="mw-button mw-back"
          disabled={!navigation.canBack && !modal && workspace === 'missions'}
          aria-label="Назад"
          title="Предыдущий экран — выполнение миссии продолжается"
          onClick={() => {
            if (modal) onModalClose();
            else if (navigation.canBack) navigation.back();
            else setWorkspace('missions');
          }}
        >
          ← Назад
        </button>
      </nav>
      {modal === 'fleet-state' && (
        <Modal title="Парк БВС" onClose={() => setModal(null)} wide>
          <fieldset
            className="mw-actions"
            style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}
            aria-label="Раздел парка БВС"
          >
            <button
              className={`mw-button ${fleetView === 'catalog' ? 'primary' : ''}`}
              aria-pressed={fleetView === 'catalog'}
              onClick={() => setFleetView('catalog')}
            >
              Модели и состав миссии
            </button>
            <button
              className={`mw-button ${fleetView === 'state' ? 'primary' : ''}`}
              aria-pressed={fleetView === 'state'}
              onClick={() => setFleetView('state')}
            >
              Текущее состояние
            </button>
          </fieldset>
          {fleetView === 'catalog' ? (
            <MissionFleetEditor
              document={document}
              onChange={edit}
              onNotice={setNotice}
            />
          ) : (
            <MissionFleetStatePanel
              document={document}
              states={operations.fleet}
              onReport={operations.reportFleet}
              onApply={async () => {
                try {
                  if (
                    activeRun &&
                    !['completed', 'cancelled'].includes(activeRun.status)
                  ) {
                    setModal(null);
                    await reviseActiveMission();
                    return;
                  }
                  await playbackStop.current();
                  const states = await operations.listFleet();
                  edit(applyFleetState(document, states));
                  setWizard(true);
                  setWorkspace('planning');
                  setModal(null);
                  setNotice(
                    'Текущее состояние парка перенесено. Нужен новый расчёт и подтверждение.',
                  );
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            />
          )}
        </Modal>
      )}
      {modal === 'journal-review' && (
        <Modal title="Проверка сохранённой истории" onClose={onModalClose} wide>
          <MissionJournalReview
            rejected={operations.rejected}
            busy={operations.busy || operations.loading}
            onExport={async (id) => {
              try {
                download(
                  `${id}-original.json`,
                  JSON.stringify(await operations.exportRaw(id), null, 2),
                );
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
            onRecover={async (id) => {
              try {
                const recovered = await operations.recoverDocument(id);
                openPreview(
                  {
                    ...recovered,
                    id: `mission-${crypto.randomUUID()}`,
                    name: `${recovered.name.slice(0, 78)} · восстановлено`,
                  },
                  'Копия исходной миссии · нужен новый расчёт',
                );
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
            onArchive={async (id, hash) => {
              try {
                await operations.archiveRejected(id, hash);
                setNotice(
                  'Старая симуляция архивирована по вашему подтверждению. Снимок сохранён; положение и заряд БВС не изменены.',
                );
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          />
        </Modal>
      )}
      {modal === 'operation-journal' && (
        <Modal title="Журнал миссии" onClose={onModalClose} wide>
          {journalRun ? (
            <MissionOperationJournal key={journalRun.id} row={journalRun} />
          ) : (
            <p>
              Снимок недоступен. Обновите журнал или проверьте сохранённую
              историю.
            </p>
          )}
        </Modal>
      )}
      <div
        id="workspace-content"
        role="tabpanel"
        aria-labelledby={`workspace-${workspace}`}
      >
        <div className="mw-fleet-summary" hidden={workspace !== 'fleet'}>
          <DemoFleet
            documents={demoDocuments}
            states={operations.fleet}
            lockedIds={operations.rows
              .filter((r) =>
                ['scheduled', 'running', 'paused'].includes(r.status),
              )
              .flatMap((r) => r.candidate.sorties.map((s) => s.vehicleId))}
            busy={busy || operationActionBusy}
            onAvailability={(id, enabled, configuration) =>
              void changeDemoAvailability(id, enabled, configuration)
            }
            onMaintenance={(id, maintenance) => {
              const v =
                operations.fleet.find((s) => s.id === id)?.vehicle ??
                demoDocuments
                  .flatMap((d) => d.scenario.vehicles)
                  .find((v) => v.id === id);
              if (v)
                void changeDemoAvailability(
                  id,
                  v.enabled,
                  undefined,
                  maintenance,
                );
            }}
            onCameras={(id, cameras) => {
              const v =
                operations.fleet.find((s) => s.id === id)?.vehicle ??
                demoDocuments
                  .flatMap((d) => d.scenario.vehicles)
                  .find((v) => v.id === id);
              if (v)
                void changeDemoAvailability(
                  id,
                  v.enabled,
                  undefined,
                  undefined,
                  cameras,
                );
            }}
          />
        </div>
        <section className="mw-missions-home" hidden={workspace !== 'missions'}>
          <div className="mw-home-heading">
            <h1>Миссии</h1>
            <span className="demo-mode-label">Демонстрационный стенд</span>
          </div>
          <DemoMissionCards
            documents={demoDocuments}
            rows={operations.rows}
            onEdit={(d) => {
              const next = structuredClone(d);
              if (operations.rows.some((r) => r.document.id === d.id)) {
                next.id = `mission-${crypto.randomUUID().slice(0, 20)}`;
                next.name = `${d.name.slice(0, 90)} · копия`;
              }
              openPreview(next, 'Карточка миссии');
            }}
            onOpen={(r) => void openOperation(r)}
            onDelete={(id) => void deleteDemoRun(id)}
            onDownload={(d) =>
              download(`${d.id}.mission.json`, serializeMissionJson(d))
            }
            onImport={() => file.current?.click()}
            onRemove={(id) => {
              if (
                !window.confirm(
                  'Удалить карточку миссии? Скачайте JSON, если хотите сохранить её.',
                )
              )
                return;
              setDemoDocuments((ds) => ds.filter((d) => d.id !== id));
              setDemoResults((rs) => {
                const next = { ...rs };
                delete next[id];
                return next;
              });
              if (document.id === id) {
                setOpenedDemo(false);
                setResult(null);
                setApproval(null);
                setDirty(false);
              }
            }}
          />
        </section>
        {workspace === 'planning' && (
          <div className="mw-editor-top-tabs" aria-label="Разделы редактора">
            <input
              className="mw-inline-mission-name"
              aria-label="Название миссии"
              title={document.name}
              value={document.name}
              maxLength={100}
              onChange={(e) =>
                edit({
                  ...document,
                  name: e.target.value,
                  scenario: { ...document.scenario, name: e.target.value },
                })
              }
            />
            <button
              aria-pressed={planningStep === 'task'}
              onClick={() => {
                setPlanningStep('task');
                setWizard(true);
              }}
            >
              Миссия
            </button>
            <button
              className="mw-button primary mw-calculate-action"
              disabled={busy || !!validation}
              onClick={() => void calculate()}
            >
              {busy && <LoaderCircle size={15} className="mw-spinner" />}
              {busy ? 'Расчёт…' : 'Рассчитать варианты'}
            </button>
          </div>
        )}
        <section className="mw-contextbar">
          <div className="mw-titlebar">
            <div>
              <h1 title={document.name}>{document.name || 'Новая миссия'}</h1>
              {stale && workspace === 'planning' && (
                <span className="mw-recalculate-badge">Нужен перерасчёт</span>
              )}
              <p className="mw-document-status">
                {workspace === 'execution'
                  ? 'Модельный полёт · без подключения БВС'
                  : workspace === 'results'
                    ? 'Проверки и файлы этой миссии'
                    : dirty
                      ? 'Есть несохранённые изменения'
                      : savedRevision
                        ? 'Изменения сохранены'
                        : 'Редактируется'}
              </p>
            </div>
          </div>
          {workspace === 'planning' && (
            <span className="mw-stage-label">
              {planningStep === 'task'
                ? 'Подготовка миссии'
                : isApproved
                  ? 'План подтверждён'
                  : 'Выбор плана'}
            </span>
          )}
          <span
            className="demo-mode-label"
            title="Фиксированные тестовые условия, не прогноз."
          >
            Модельная погода · ветер {document.scenario.wind.speedMps} м/с ·
            ясно
          </span>
        </section>
        <section
          className="mw-overview-strip"
          aria-label="Обзор моих миссий"
          hidden
        >
          {(
            [
              ['Сохранённые миссии', libraryRows.length, 'library'],
              [
                'В очереди',
                operations.rows.filter((r) => r.status === 'scheduled').length,
                'operations',
              ],
              [
                'Выполняется / пауза',
                operations.rows.filter(
                  (r) => r.status === 'running' || r.status === 'paused',
                ).length,
                'operations',
              ],
              [
                'Завершено в модели',
                operations.rows.filter((r) => r.status === 'completed').length,
                'operations',
              ],
            ] as const
          ).map(([label, count, target]) => (
            <button
              className="mw-overview-stat"
              key={label}
              onClick={() =>
                target === 'library'
                  ? void showLibrary()
                  : setModal('operations')
              }
            >
              <b>
                {operations.loading && target === 'operations' ? '…' : count}
              </b>
              <span>{label}</span>
            </button>
          ))}
          <span className="mw-model-source">
            Только этот браузер · модель, не реальные полёты
          </span>
        </section>
        {workspace === 'planning' && document.revisionSource && (
          <details className="mw-revision-diff">
            <summary>Пересмотр · что изменилось</summary>
            <p>
              Исходный запуск: {document.revisionSource.operationId}.{' '}
              {document.revisionSource.reason}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Работа</th>
                  <th>Зачтено в модели</th>
                  <th>Осталось</th>
                </tr>
              </thead>
              <tbody>
                {document.revisionSource.coverage.map((c) => (
                  <tr key={c.jobId}>
                    <td>{c.jobId}</td>
                    <td>{Math.round(c.completedM2)} м²</td>
                    <td>{Math.round(c.remainingM2)} м²</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Новая версия: {document.jobs.length} участков. Для применения
              нужны новый расчёт, проверка актуального парка и подтверждение.
            </p>
          </details>
        )}
        <div className="mw-grid">
          {(workspace === 'planning' || workspace === 'execution') && (
            <label className="mw-panel-resize" title="Ширина панели">
              <input
                aria-label="Ширина панели"
                type="range"
                min="35"
                max="65"
                value={panelWidth}
                onChange={(e) => setPanelWidth(Number(e.target.value))}
              />
            </label>
          )}
          <aside className="mw-sidebar">
            {workspace === 'execution' && (
              <div className="mw-execution-heading">
                <h2>{document.name}</h2>
                <div className="me-local-tabs" aria-label="Раздел выполнения">
                  {(
                    [
                      ['summary', 'Сводка'],
                      ['vehicles', 'БВС'],
                      ['journal', 'Журнал'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={executionTab === id}
                      onClick={() => setExecutionTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {activeRun && (
                  <div className="execution-actions">
                    <button
                      className="mw-button small"
                      onClick={() => void reviseActiveMission()}
                    >
                      Изменить план
                    </button>
                    <button
                      className="mw-button small"
                      onClick={() => {
                        setWorkspace('results');
                        setResultsTab('summary');
                      }}
                    >
                      Отчёт миссии
                    </button>
                    <button
                      className="mw-button small"
                      disabled={
                        !recordings.info[activeRun.id]?.bytes ||
                        ['recording', 'converting'].includes(
                          recordings.info[activeRun.id]?.status,
                        )
                      }
                      title={
                        recordings.info[activeRun.id]?.error ??
                        'Доступно после завершения записи'
                      }
                      onClick={() =>
                        void recordings
                          .download(activeRun.id)
                          .catch((e) => setError(errorMessage(e)))
                      }
                    >
                      Скачать MP4
                    </button>
                    <button
                      className="mw-button small"
                      onClick={() =>
                        download(
                          `${activeRun.document.id}.mission.json`,
                          serializeMissionJson(activeRun.document),
                        )
                      }
                    >
                      Скачать миссию
                    </button>
                    <button
                      className="mw-button small demo-delete"
                      disabled={operationActionBusy || operations.busy}
                      onClick={() => void deleteDemoRun(activeRun.document.id)}
                    >
                      Удалить
                    </button>
                  </div>
                )}
                {candidate && !activeRun && (
                  <button
                    className="mw-button small"
                    onClick={() => {
                      setWorkspace('results');
                      setResultsTab('summary');
                    }}
                  >
                    Отчёт миссии
                  </button>
                )}
                {executionTab === 'journal' && activeRun && (
                  <MissionOperationJournal row={activeRun} />
                )}
                <span className="execution-clock">
                  Симуляция ·{' '}
                  {timestamp(document, safety ? safetyDisplayTime : time)} ·{' '}
                  {document.window.timezone}
                </span>
                <span className="demo-mode-label">
                  Модельная погода ·{' '}
                  {safety?.windMps ?? document.scenario.wind.speedMps} м/с
                </span>
              </div>
            )}
            {workspace === 'execution' && operations.rows.length > 1 && (
              <MissionExecutionQueue
                compact
                rows={operations.rows}
                selectedId={activeRunId}
                busy={
                  operationActionBusy || operations.busy || operations.loading
                }
                startBlocked={operations.rejected.some(
                  (row) => row.blocksExecution,
                )}
                onOpen={(row) => {
                  if (row.id === activeRunId) setFit((value) => value + 1);
                  else void openOperation(row);
                }}
                onStart={(row) => void openOperation(row, true)}
                onJournal={openRunJournal}
                onOpenAll={() => setModal('operations')}
                onOpenExample={(id) => {
                  if (
                    ![
                      'demo-01-survey',
                      'demo-02-obstacles',
                      'demo-02-expert-obstacles',
                    ].includes(id)
                  )
                    return;
                  void fetch(`/planner/scenarios/${id}.mission.json`)
                    .then(async (response) => {
                      if (!response.ok)
                        throw new Error('Не удалось загрузить пример миссии.');
                      const example = parseMissionDocument(
                        await response.json(),
                      );
                      openPreview(example, 'Готовый пример · требуется расчёт');
                    })
                    .catch((error) => setError(errorMessage(error)));
                }}
              />
            )}
            {workspace === 'execution' && !isApproved && (
              <div className="mw-execution-pending">
                <span>Подготовьте план к запуску</span>
                <button
                  className="mw-button small"
                  onClick={() => {
                    setWorkspace('planning');
                    if (candidate) setPlanningStep('confirm');
                    else void calculate();
                  }}
                >
                  {candidate
                    ? 'Проверить и подтвердить план'
                    : 'Рассчитать план'}
                </button>
              </div>
            )}
            <section
              className="mw-playback"
              aria-label="Модельная симуляция"
              hidden={!!safety || !isApproved}
            >
              <div className="mw-flight-status" data-running={playing}>
                <span className="mw-flight-status-indicator" />
                <div>
                  <strong>
                    {safety
                      ? safety.stage === 'pending'
                        ? 'Ожидается решение'
                        : safety.stage === 'returning'
                          ? 'Защитный возврат'
                          : safety.stage === 'landed'
                            ? 'Группа вернулась'
                            : safety.stage === 'crashed'
                              ? 'Полёт невозможен'
                              : 'Нужен оператор'
                      : playing
                        ? 'Идёт симуляция'
                        : activeRun?.status === 'completed'
                          ? 'Миссия завершена'
                          : activeRun?.status === 'cancelled'
                            ? 'Выполнение отменено'
                            : isApproved
                              ? activeRun
                                ? 'Пауза / просмотр плана'
                                : 'Готово к запуску'
                              : 'План не подтверждён'}
                  </strong>
                  <InfoHint label="Выполнение симуляции">
                    На карте — движение по рассчитанным маршрутам, не бортовая
                    телеметрия. Аппараты не подключены. Время миссии:{' '}
                    {timestamp(document, time)}. Ползунок — просмотр плана;
                    продолжение — с сохранённой паузы. Для запуска нужен
                    подтверждённый выполнимый план. Скорость воспроизведения
                    задаётся в «Ускорение».
                  </InfoHint>
                </div>
              </div>
              <div className="mw-playback-controls" hidden={!!safety}>
                <button
                  className="mw-button primary"
                  disabled={
                    !isApproved ||
                    !duration ||
                    operationActionBusy ||
                    operations.loading
                  }
                  onClick={() => {
                    if (playing && activeRun) void pauseOperation(activeRun);
                    else void scheduleOperation(true);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                  {playing
                    ? 'Пауза'
                    : activeRun?.status === 'paused'
                      ? 'Продолжить выполнение'
                      : 'Выполнить миссию'}
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
                  disabled={!isApproved || playing}
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
                <label className="mw-caption playback-rate">
                  Ускорение{' '}
                  <select
                    value={rate}
                    aria-label="Скорость симуляции"
                    onChange={(e) => setRate(Number(e.target.value))}
                  >
                    {[1, 10, 40, 100, 300].map((n) => (
                      <option key={n} value={n}>
                        ×{n}
                        {n === 1 ? ' · реальное время' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <div className="mw-panel-head execution-vehicle-heading">
              <Layers size={16} />
              <h2>
                {workspace === 'execution' ? 'Аппараты миссии' : 'Миссия'}
              </h2>
              {workspace === 'execution' && (
                <button
                  className="mw-button small quiet"
                  onClick={() =>
                    activeRun
                      ? openRunJournal(activeRun)
                      : setModal('telemetry')
                  }
                >
                  Журнал
                </button>
              )}
              <small>2D</small>
            </div>
            {workspace === 'execution' && activeRun && (
              <section
                className="mw-safety-console"
                aria-label="Защитный контур"
              >
                {!safety ? (
                  <details>
                    <summary>
                      Проверить нештатную ситуацию{' '}
                      <InfoHint label="Отказные сценарии">
                        События вводятся в тренажёр вручную. Реальные БВС и
                        сенсоры не подключены. Проверяются возврат всей летящей
                        группы, ветер, энергия и загруженные препятствия. Это не
                        инструкция пилоту.
                      </InfoHint>
                    </summary>
                    <div className="mw-safety-controls">
                      <label>
                        Событие
                        <select
                          value={incidentKind}
                          onChange={(e) =>
                            setIncidentKind(e.target.value as IncidentKind)
                          }
                        >
                          {Object.entries(incidentLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      {incidentKind === 'wind' && (
                        <label>
                          Новый ветер, м/с
                          <input
                            aria-label="Ветер события"
                            type="number"
                            min={0}
                            max={30}
                            value={incidentWind}
                            onChange={(e) =>
                              setIncidentWind(Number(e.target.value))
                            }
                          />
                        </label>
                      )}
                      {incidentKind === 'battery' && (
                        <label>
                          Заряд, %
                          <input
                            aria-label="Заряд события"
                            type="number"
                            min={0}
                            max={100}
                            value={incidentBattery}
                            onChange={(e) =>
                              setIncidentBattery(Number(e.target.value))
                            }
                          />
                        </label>
                      )}
                      <button
                        className="mw-button"
                        title={
                          operationActionBusy
                            ? 'Предыдущее действие ещё выполняется'
                            : !['running', 'paused'].includes(activeRun.status)
                              ? 'Сначала запустите миссию и выберите летящий аппарат'
                              : 'Внести испытательное событие для выбранного аппарата'
                        }
                        disabled={
                          operationActionBusy ||
                          !['running', 'paused'].includes(activeRun.status)
                        }
                        onClick={() => void triggerIncident()}
                      >
                        {operationActionBusy
                          ? 'Рассчитываем реакцию…'
                          : 'Внести событие'}
                      </button>
                      {!['running', 'paused'].includes(activeRun.status) && (
                        <p className="mw-caption">
                          Событие доступно после запуска миссии.
                        </p>
                      )}
                    </div>
                  </details>
                ) : (
                  <>
                    <div className="mw-safety-heading" role="alert">
                      <TriangleAlert size={21} />
                      <strong>{incidentLabels[safety.kind]}</strong>
                      <span>
                        {safety.stage === 'pending'
                          ? `Решение: ${operatorSeconds} с`
                          : safety.stage === 'returning'
                            ? 'Возврат группы'
                            : safety.stage === 'landed'
                              ? 'Возврат завершён'
                              : safety.stage === 'crashed'
                                ? 'Аппарат выведен из выполнения'
                                : 'Безопасный возврат не найден'}
                      </span>
                    </div>
                    {safety.stage === 'pending' && (
                      <p>
                        Основная симуляция на паузе. Без ответа — проверенный
                        возврат через 60 секунд; минута ожидания учтена в запасе
                        энергии.
                      </p>
                    )}
                    {['blocked', 'crashed'].includes(safety.stage) && (
                      <p>
                        Тренажёр остановлен.{' '}
                        {safety.kind === 'crash'
                          ? 'Возврат этому аппарату недоступен. Сохраните координаты и организуйте осмотр.'
                          : recoveryChoices
                              .flatMap((o) => o.reasons)
                              .filter((v, i, a) => a.indexOf(v) === i)
                              .slice(0, 2)
                              .join(' ')}
                      </p>
                    )}
                    <div className="mw-actions">
                      {safety.stage === 'pending' &&
                        recoveryChoices.map((choice) => (
                          <button
                            key={choice.policy}
                            className="mw-button"
                            disabled={!choice.valid || operationActionBusy}
                            title={choice.reasons.join(' ')}
                            onClick={() => void chooseRecovery(choice.policy)}
                          >
                            {choice.label}
                            {choice.valid
                              ? ` · остаток ≥ ${Math.floor(choice.minimumPct)}%`
                              : ' · недоступно'}
                          </button>
                        ))}
                      {safety.stage === 'returning' && (
                        <label className="mw-caption">
                          Скорость возврата{' '}
                          <select
                            aria-label="Скорость возврата"
                            value={rate}
                            onChange={(e) => setRate(Number(e.target.value))}
                          >
                            {[1, 10, 40, 100, 300].map((n) => (
                              <option key={n} value={n}>
                                ×{n}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {safety.stage === 'returning' && (
                        <button
                          className="mw-button primary"
                          disabled={operationActionBusy}
                          onClick={async () => {
                            setOperationActionBusy(true);
                            try {
                              if (recovering) {
                                await recoveryRunner.current?.pause(
                                  activeRun.id,
                                );
                                setRecovering(false);
                              } else {
                                recoveryRunner.current?.resume(activeRun.id);
                                setRecoveryTime(
                                  operationsRef.current.get(activeRun.id)
                                    ?.safety?.progressSec ?? safety.progressSec,
                                );
                                setRecovering(true);
                              }
                            } catch (e) {
                              setError(errorMessage(e));
                            } finally {
                              setOperationActionBusy(false);
                            }
                          }}
                        >
                          {recovering ? 'Пауза возврата' : 'Продолжить возврат'}
                        </button>
                      )}
                      {['landed', 'blocked', 'crashed'].includes(
                        safety.stage,
                      ) &&
                        activeRun.status !== 'cancelled' && (
                          <button
                            className="mw-button"
                            onClick={() => void cancelOperation(activeRun)}
                          >
                            Закрыть выполнение
                          </button>
                        )}
                      <button
                        className="mw-button"
                        disabled={exportBusy}
                        onClick={async () => {
                          setExportBusy(true);
                          try {
                            const archive = await buildIncidentArchive(
                              activeRun,
                              operations.rows,
                              {
                                userAgent: navigator.userAgent,
                                timezone:
                                  Intl.DateTimeFormat().resolvedOptions()
                                    .timeZone,
                                viewport: `${window.innerWidth}x${window.innerHeight}`,
                              },
                            );
                            const url = URL.createObjectURL(
                              new Blob([archive.bytes], {
                                type: 'application/zip',
                              }),
                            );
                            const link = window.document.createElement('a');
                            link.href = url;
                            link.download = `${activeRun.id}.incident.zip`;
                            link.click();
                            setTimeout(() => URL.revokeObjectURL(url), 30000);
                            setNotice('Диагностика события сохранена в ZIP.');
                          } catch (e) {
                            setError(errorMessage(e));
                          } finally {
                            setExportBusy(false);
                          }
                        }}
                      >
                        {exportBusy
                          ? 'Собираем диагностику…'
                          : 'Диагностика ZIP'}
                      </button>
                    </div>
                    <details>
                      <summary>Проверки и действия</summary>
                      {recoveryChoices.map((o) => (
                        <p key={o.policy}>
                          <b>{o.label}:</b> {o.reasons.join(' ')}
                        </p>
                      ))}
                      <ol>
                        {safety.events.map((e, i) => (
                          <li key={i}>
                            {new Date(e.at).toLocaleTimeString('ru-RU')} ·{' '}
                            {e.text}
                          </li>
                        ))}
                      </ol>
                      <p>
                        Фото объекта: реальный снимок не получен. Обнаружение,
                        положение и заряд — модельные данные. Автоматическое
                        продолжение съёмки с текущей полосы не реализовано.
                      </p>
                    </details>
                  </>
                )}
              </section>
            )}
            {workspace === 'execution' && (
              <div className="mw-sidebar-schedule">
                {candidate && (
                  <details className="mw-flight-schedule">
                    <summary>Расписание вылетов</summary>
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
                              {vehicleCallsign(
                                document.scenario.vehicles.findIndex(
                                  (item) => item.id === v.id,
                                ),
                              )}
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
                                      background:
                                        flightColors[i % flightColors.length],
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
                  </details>
                )}
              </div>
            )}
            {wizard && workspace === 'planning' ? (
              <>
                {mode && (
                  <output className="mw-drawing-toolbar">
                    <span>
                      {mode === 'area'
                        ? 'Контур участка'
                        : mode === 'exclusion'
                          ? 'Контур ограничения'
                          : 'Отметьте на карте'}
                      {draft.length ? ` · ${draft.length} точек` : ''}
                    </span>
                    <InfoHint label="Как завершить рисование">
                      По точкам: замкните фигуру на первой вершине или нажмите
                      «Применить контур». От руки, круг, овал: протяните мышью.
                      Esc или крестик отменяют рисование.
                    </InfoHint>
                    {!['base', 'start', 'landing', 'reserve'].includes(
                      mode,
                    ) && (
                      <>
                        <button
                          className="mw-button primary small"
                          disabled={draft.length < 3}
                          onClick={() => finishDrawing()}
                        >
                          Применить контур
                        </button>
                        <button
                          className="mw-button small"
                          disabled={!draft.length}
                          onClick={() =>
                            setDraft((points) => points.slice(0, -1))
                          }
                        >
                          Убрать точку
                        </button>
                      </>
                    )}
                    <button
                      className="mw-button small"
                      aria-label="Отменить рисование"
                      onClick={() => {
                        setMode(null);
                        setDraft([]);
                      }}
                    >
                      <X size={16} />
                    </button>
                  </output>
                )}
                <MissionEditor
                  activeTab={editorTab}
                  onTabChange={setEditorTab}
                  onFleet={() => setWorkspace('fleet')}
                  hasGlobalFleet={!!fleetRegistry}
                  fleetStates={operations.fleet}
                  status={dirty ? 'Редактируется · не сохранено' : 'Сохранена'}
                  onUseGlobalFleet={() => void applyGlobalFleet()}
                  onNotice={setNotice}
                  key={editorSession}
                  document={document}
                  onChange={edit}
                  selectedJob={jobIndex}
                  onSelectJob={(n) => {
                    setJobIndex(n);
                    setMode(null);
                    setDraft([]);
                    setFit((x) => x + 1);
                  }}
                  onDraw={startDrawing}
                  onTerritoryEditing={setTerritoryEditing}
                  territoryIncomplete={!!clearedAreaId}
                  territoryEditor={
                    <MissionTerritoryEditor
                      document={document}
                      selected={jobIndex}
                      workType={currentJob.job.type}
                      clearedId={clearedAreaId}
                      onSelect={(n) => {
                        setJobIndex(n);
                        setTerritoryEditing(true);
                        setMode(null);
                        setDraft([]);
                        setFit((x) => x + 1);
                      }}
                      onChange={edit}
                      canSave={!validation && !mode && !busy}
                      onSave={() =>
                        void save().then((saved) => {
                          if (saved) setTerritoryEditing(false);
                        })
                      }
                      onRestore={
                        areaRestore?.id === currentJob.id
                          ? () => {
                              edit({
                                ...document,
                                jobs: document.jobs.map((j) =>
                                  j.id === currentJob.id
                                    ? {
                                        ...j,
                                        area: structuredClone(areaRestore.area),
                                      }
                                    : j,
                                ),
                              });
                              setClearedAreaId(null);
                              setAreaRestore(null);
                              setError('');
                              setFit((x) => x + 1);
                            }
                          : undefined
                      }
                      onDelete={() => {
                        if (
                          !window.confirm(
                            `Удалить участок «${currentJob.name}»${document.jobs.length > 1 ? ' и связанную с ним работу' : ''}?`,
                          )
                        )
                          return;
                        setMode(null);
                        setDraft([]);
                        if (document.jobs.length > 1) {
                          if (currentJob.id === clearedAreaId)
                            setClearedAreaId(null);
                          edit({
                            ...document,
                            jobs: document.jobs.filter(
                              (j) => j.id !== currentJob.id,
                            ),
                          });
                          setJobIndex(0);
                        } else {
                          setAreaRestore({
                            id: currentJob.id,
                            area: structuredClone(currentJob.area),
                          });
                          edit({
                            ...document,
                            jobs: document.jobs.map((j) => ({
                              ...j,
                              area: { type: 'Polygon', coordinates: [] },
                            })),
                          });
                          setClearedAreaId(currentJob.id);
                        }
                        setNotice('Участок удалён.');
                      }}
                      onAdd={() => {
                        const id = `job-${crypto.randomUUID()}`;
                        edit(appendEmptyArea(document, currentJob.id, id));
                        setAreaRestore(null);
                        setJobIndex(document.jobs.length);
                        setClearedAreaId(id);
                        startDrawing('area');
                      }}
                      onDraw={(tool) => {
                        startDrawing('area');
                        setMode('area');
                        setDrawTool(tool);
                      }}
                      onImport={() => importObjects('area')}
                    />
                  }
                  onImportGeometry={() => importObjects('exclusion')}
                  onExample={(n) =>
                    openPreview(demoMission(n), `Контрольный сценарий ${n} км²`)
                  }
                  onDone={() => {
                    if (!validation) void calculate();
                    else setError(validation);
                  }}
                  onSave={() => void save()}
                />
                <MissionDataPanel
                  key={`mission-data-${editorSession}`}
                  document={document}
                  selectedJob={jobIndex}
                  onNotice={setNotice}
                  onObstacles={() => setModal('layers')}
                  onDownloadMission={() => exportTask('json')}
                  objects={
                    <MissionMapObjects
                      key={document.id}
                      document={document}
                      busy={busy || operationActionBusy}
                      selectedBase={selectedBase}
                      action={baseAction}
                      onSelectBase={setSelectedBase}
                      picked={pickedMapPoint}
                      onPick={pickBase}
                      onCancelPick={() => {
                        setMode(null);
                        setDraft([]);
                        setMovingBaseId(null);
                        setBasePreview(null);
                        setPickedMapPoint(null);
                      }}
                      onDraw={startDrawing}
                      onEditBoundary={(editing) => {
                        setBoundaryEditing(editing);
                        setTerritoryEditing(editing);
                        setMode(null);
                        setDraft([]);
                        if (editing) {
                          setFit((value) => value + 1);
                          setNotice(
                            'Перетащите вершины зелёной границы. Изменения потребуют нового расчёта.',
                          );
                        }
                      }}
                      onImport={importObjects}
                      onChange={edit}
                      onBaseChange={applyBaseChanges}
                      onLayers={showLayers}
                    />
                  }
                  onChange={(next) => {
                    edit(next);
                    setFit((x) => x + 1);
                    setMode(null);
                    setDraft([]);
                  }}
                />
              </>
            ) : (
              <div className="mw-flight-panel">
                <div className="mw-flight-list">
                  {document.scenario.vehicles.map((v, i) => {
                    const assigned = candidate?.sorties.some(
                      (s) => s.vehicleId === v.id,
                    );
                    if (!assigned) return null;
                    const segment = candidate?.sorties
                      .find(
                        (s) =>
                          s.vehicleId === v.id &&
                          time >= s.startSec &&
                          time < s.endSec,
                      )
                      ?.segments.find(
                        (s) => time >= s.startSec && time < s.endSec,
                      );
                    const state = vehicleStates.find(
                      (s) => s.vehicleId === v.id,
                    );
                    const recoverySegments = safety
                      ? (displayedPlan?.missions.find(
                          (m) => m.vehicleId === v.id,
                        )?.segments ?? [])
                      : [];
                    const recoverySeg =
                      recoverySegments.find(
                        (s) =>
                          safetyDisplayTime >= s.startSec &&
                          safetyDisplayTime < s.endSec,
                      ) ??
                      [...recoverySegments]
                        .reverse()
                        .find((s) => s.endSec <= safetyDisplayTime);
                    const recoveryPos = recoverySeg
                      ? positionAt(recoverySeg, safetyDisplayTime)
                      : null;
                    const phase = safety
                      ? safety.stage === 'crashed' && safety.vehicleId === v.id
                        ? 'Полёт невозможен'
                        : safety.stage === 'landed'
                          ? 'На площадке'
                          : safety.stage === 'pending'
                            ? 'Ожидается решение'
                            : recoverySeg
                              ? phaseNames[recoverySeg.phase]
                              : 'Остановлен'
                      : !isApproved
                        ? 'Предпросмотр плана'
                        : segment
                          ? phaseNames[segment.phase]
                          : state?.status === 'servicing'
                            ? 'Обслуживание'
                            : state?.status === 'ready'
                              ? 'Завершил работу'
                              : 'Подготовка / ожидание';
                    return (
                      <button
                        key={v.id}
                        className={`mw-flight-card ${displaySelected === v.id ? 'selected' : ''}`}
                        aria-pressed={displaySelected === v.id}
                        aria-label={`Выбрать ${vehicleCallsign(i)}`}
                        title={vehicleDisplayName(v)}
                        onClick={() => {
                          setSelected(v.id);
                          setFlightDetails(true);
                        }}
                      >
                        <span
                          className="mw-flight-color"
                          style={{
                            background: flightColors[i % flightColors.length],
                          }}
                        />
                        <span>
                          <strong>{vehicleCallsign(i)}</strong>
                          <small>{phase}</small>
                        </span>
                        <span className="mw-flight-charge">
                          {safety
                            ? recoveryPos
                              ? `${Math.round(recoveryPos.batteryPct)}%`
                              : '—'
                            : state?.batteryPct != null
                              ? `${Math.round(state.batteryPct)}%`
                              : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!candidate && (
                  <p className="mw-caption">
                    Аппараты появятся после расчёта плана.
                  </p>
                )}
                {candidate && flightDetails && (
                  <section
                    className="mw-flight-detail"
                    aria-label="Состояние выбранного БВС"
                  >
                    <div className="mw-flight-focus-title">
                      <h3>
                        Показатели{' '}
                        {vehicleCallsign(
                          document.scenario.vehicles.findIndex(
                            (v) => v.id === activeVehicle.id,
                          ),
                        )}
                      </h3>
                      <button
                        className="mw-button square quiet"
                        aria-label="Скрыть показатели БВС"
                        onClick={() => setFlightDetails(false)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="mw-flight-instruments">
                      <div>
                        <strong>
                          {isApproved && activeSegment
                            ? `${fmt(activeSegment.altitudeFromM + (activeSegment.altitudeToM - activeSegment.altitudeFromM) * progress, 0)}`
                            : '—'}
                        </strong>
                        <span>
                          Высота, м{' '}
                          <InfoHint label="Высота на экране">
                            Высота в принятом локальном уровне модели, не
                            измерение над реальным рельефом.
                          </InfoHint>
                        </span>
                      </div>
                      <div>
                        <strong>
                          {isApproved &&
                          ((safety
                            ? battery
                            : activeVehicleState?.batteryPct) ?? battery) !=
                            null
                            ? Math.round(
                                ((safety
                                  ? battery
                                  : activeVehicleState?.batteryPct) ??
                                  battery)!,
                              )
                            : '—'}
                        </strong>
                        <span>
                          Заряд, %{' '}
                          <InfoHint label="Расчётный заряд батареи">
                            Оценка по плану, не показания реальной батареи.
                            После посадки должно остаться не меньше резерва{' '}
                            {document.scenario.reservePct}%.
                          </InfoHint>
                        </span>
                      </div>
                      <div>
                        <strong>
                          {isApproved && activeSegment
                            ? fmt(activeSegment.groundSpeedMps, 1)
                            : '—'}
                        </strong>
                        <span>Скорость, м/с</span>
                      </div>
                    </div>
                    {isApproved && nextSortie && !activeSegment && (
                      <p className="mw-caption">
                        Следующий взлёт в{' '}
                        {timestamp(document, nextSortie.startSec)} по времени
                        миссии.
                      </p>
                    )}
                    <button
                      className="mw-button"
                      onClick={() => setFit((n) => n + 1)}
                    >
                      <Crosshair size={16} />
                      Вписать маршрут
                    </button>
                    <details className="mw-details">
                      <summary>Какой это аппарат?</summary>
                      <p>{vehicleDisplayName(activeVehicle)}</p>
                      <p className="mw-caption">ID: {activeVehicle.id}</p>
                    </details>
                  </section>
                )}
              </div>
            )}
          </aside>
          <section
            className="mw-map-wrap"
            aria-label="Карта миссии и рассчитанных маршрутов"
          >
            <MissionMap
              bases={mapBases}
              selectedBase={selectedBase}
              baseEditable={
                workspace === 'planning' && !busy && !operationActionBusy
              }
              basePreview={workspace === 'planning' ? basePreview : null}
              onMoveBase={workspace === 'planning' ? moveBase : undefined}
              onBaseAction={
                workspace === 'planning'
                  ? (id, action) => {
                      setSelectedBase(id);
                      showMapObjects();
                      if (action === 'move') pickBase('base', id);
                      else {
                        setFocusMode(false);
                        setBaseAction({ id, action, key: Date.now() });
                      }
                    }
                  : undefined
              }
              onSelectBase={
                workspace === 'planning'
                  ? (id) => {
                      setSelectedBase(id);
                      showMapObjects();
                    }
                  : undefined
              }
              editPolygon={
                boundaryEditing ? document.scenario.airspace : undefined
              }
              scenario={displayedScenario}
              plan={clearedAreaId ? null : displayedPlan}
              selected={displaySelected}
              time={safety ? safetyDisplayTime : time}
              mode={mode}
              draft={draft}
              onPoint={mapPoint}
              fit={fit}
              showTiles={showTiles}
              showTransit={showTransit}
              workAreas={visibleWorkAreas}
              playbackRate={rate}
              activeJobId={currentJob.id}
              editable={
                workspace === 'planning' &&
                planningStep === 'task' &&
                territoryEditing
              }
              drawTool={drawTool}
              onSelectArea={(id) => {
                setBoundaryEditing(false);
                setJobIndex(document.jobs.findIndex((j) => j.id === id));
                setTerritoryEditing(true);
              }}
              onVertex={(ring, vertex, point) => {
                try {
                  const area = moveAreaVertex(
                    boundaryEditing
                      ? document.scenario.airspace
                      : currentJob.area,
                    ring,
                    vertex,
                    point,
                  );
                  if (boundaryEditing)
                    edit({
                      ...document,
                      scenario: { ...document.scenario, airspace: area },
                    });
                  else
                    edit({
                      ...document,
                      jobs: document.jobs.map((j) =>
                        j.id === currentJob.id ? { ...j, area } : j,
                      ),
                    });
                  setError('');
                  setNotice('Граница участка изменена.');
                  return true;
                } catch (e) {
                  setError(errorMessage(e));
                  return false;
                }
              }}
              onStroke={(points) => {
                try {
                  const shape =
                    drawTool === 'freehand'
                      ? simplifyDrawing(firstDrawingLoop(points) ?? points)
                      : ellipseDrawing(
                          points[0],
                          points.at(-1)!,
                          drawTool === 'circle',
                        );
                  setDraft(shape);
                  finishDrawing(shape);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
              restrictions={sceneRestrictions}
              obstacleLayer={safetySceneDocument.obstacleLayer}
              showObstacles={showObstacles}
              obstacleFocus={obstacleFocus}
              missionStartAt={document.window.start}
              execution={workspace === 'execution'}
              playing={playing || recovering}
              onSelectVehicle={(id) => {
                setSelected(id);
                setFlightDetails(true);
                if (workspace === 'execution') setExecutionTab('vehicles');
              }}
            />
            <div className="mw-map-tools">
              {(focusMode || mode === 'base' || mode === 'reserve') && mode && (
                <output className="expert-drawing-actions">
                  <span>
                    {mode === 'base'
                      ? 'Выберите точку базы на карте'
                      : mode === 'reserve'
                        ? 'Выберите запасную посадку на карте'
                        : 'Редактирование контура'}
                  </span>
                  {!['base', 'reserve', 'start', 'landing'].includes(mode) && (
                    <button
                      className="mw-button primary small"
                      disabled={draft.length < 3}
                      onClick={() => finishDrawing()}
                    >
                      Применить контур
                    </button>
                  )}
                  <button
                    className="mw-button small"
                    onClick={() => {
                      setMode(null);
                      setDraft([]);
                      setMovingBaseId(null);
                      setBasePreview(null);
                    }}
                  >
                    Отмена
                  </button>
                </output>
              )}
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
                title="Объекты карты"
                aria-label="Объекты карты"
                onClick={showMapObjects}
              >
                <ShieldCheck size={17} />
              </button>
              <span className="spacer" />
              {workspace === 'planning' && (
                <button
                  className="mw-button square"
                  aria-label={focusMode ? 'Вернуть панели' : 'Развернуть карту'}
                  title={focusMode ? 'Вернуть панели' : 'Развернуть карту'}
                  aria-pressed={focusMode}
                  onClick={() => {
                    setFocusMode((value) => !value);
                    setFit((value) => value + 1);
                  }}
                >
                  {focusMode ? (
                    <Minimize2 size={17} />
                  ) : (
                    <Maximize2 size={17} />
                  )}
                </button>
              )}
              <details className="mw-map-display">
                <summary>Вид карты</summary>
                <div>
                  <button
                    className={`mw-button small ${showWind ? 'active' : ''}`}
                    aria-pressed={showWind}
                    onClick={() => setShowWind((s) => !s)}
                  >
                    <Wind size={14} />
                    Ветер
                  </button>
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
              </details>
            </div>
            {workspace === 'planning' &&
              baseFeedback?.missionId === document.id && (
                <div
                  className={`base-map-feedback ${baseFeedback.error ? 'is-error' : ''}`}
                  role={baseFeedback.error ? 'alert' : 'status'}
                >
                  <span>{baseFeedback.text}</span>
                  {baseUndo?.after.id === document.id &&
                    !baseFeedback.error && (
                      <button
                        className="mw-button small"
                        disabled={operationActionBusy}
                        onClick={() => void undoBaseChange()}
                      >
                        Отменить изменение базы
                      </button>
                    )}
                  <button
                    className="mw-button small"
                    aria-label="Закрыть сообщение базы"
                    onClick={() => setBaseFeedback(null)}
                  >
                    ×
                  </button>
                </div>
              )}
            {showWind && (
              <div className="mw-wind-overlay">
                <MissionWind
                  forecast={!!document.weather}
                  speedMps={document.scenario.wind.speedMps}
                  fromDeg={document.scenario.wind.fromDeg}
                  compact
                />
              </div>
            )}
            <details className="mw-map-legend">
              <summary>Обозначения карты</summary>
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
                  style={{ borderColor: '#92721e' }}
                />
                Активные запреты (проекция)
              </div>
            </details>
          </section>
          <aside className="mw-inspector">
            <div className="mw-panel-head">
              <FileCheck2 size={16} />
              <h2>
                {planningStep === 'confirm'
                  ? 'Проверка перед запуском'
                  : 'Выберите подходящий план'}
              </h2>
              <InfoHint label="Выбор и подтверждение плана">
                Сравните время и расход ресурса. Одинаковые маршруты объединены.
                Запустить симуляцию можно только после проверки плана.
              </InfoHint>
            </div>
            <div className="mw-panel-content" aria-busy={busy}>
              {busy ? (
                <output className="mw-calculation-state">
                  <LoaderCircle size={20} className="mw-spinner" />
                  Рассчитываем маршруты и проверяем безопасность…
                </output>
              ) : !candidate ? (
                <output className="mw-calculation-state">
                  {error
                    ? `Расчёт не завершён: ${error}`
                    : 'Нет рассчитанных планов. Нажмите «Рассчитать варианты».'}
                </output>
              ) : (
                <>
                  <div className="mw-section-label">Планы</div>
                  {(() => {
                    const reason = alternativeLimitExplanation(
                      document,
                      currentCandidates,
                      expertCandidateGroups(
                        currentCandidates,
                        candidate.id,
                        current?.recommendation?.explanation,
                      ).length,
                    );
                    return reason ? (
                      <output className="mw-alternative-reason">
                        {reason}
                      </output>
                    ) : null;
                  })()}
                  <button
                    className="mw-button"
                    style={{ width: '100%', marginBottom: 12 }}
                    onClick={() => {
                      setPlaying(false);
                      setError('');
                      setModal('comparison');
                    }}
                  >
                    Подробное сравнение
                  </button>
                  {expertCandidateGroups(
                    currentCandidates,
                    candidate.id,
                    current?.recommendation?.explanation,
                  )
                    .map((group) => group.representative)
                    .filter(
                      (c) =>
                        planningStep !== 'confirm' || c.id === candidate.id,
                    )
                    .map((c) => {
                      const same = expertCandidateGroups(
                        currentCandidates,
                        c.id,
                        current?.recommendation?.explanation,
                      ).find((group) => group.candidateIds.includes(c.id));
                      const duplicate = same?.candidateIds.find(
                        (id) => id !== c.id,
                      );
                      const other = currentCandidates.find(
                        (item) => item.id === duplicate,
                      );
                      return (
                        <div
                          key={c.id}
                          data-candidate-id={c.id}
                          className={`mw-card mw-vehicle mw-plan-card ${candidate.id === c.id ? 'selected' : ''}`}
                        >
                          <button
                            className="mw-plan-select"
                            aria-pressed={candidate.id === c.id}
                            onClick={() => chooseCandidate(c.id)}
                          >
                            <h3>{candidateTitle(c)}</h3>
                            <span>
                              {candidate.id === c.id
                                ? 'Выбран'
                                : 'Выбрать вариант'}
                            </span>
                          </button>
                          <p className="mw-caption">
                            {c.status !== 'feasible_model'
                              ? candidateNames[c.status]
                              : c.id === 'balanced'
                                ? 'Компромисс между сроком и общим временем в воздухе'
                                : c.objective === 'makespan'
                                  ? 'Один БВС или группа — кто завершит работу раньше'
                                  : 'Меньше общего времени всех БВС в воздухе'}
                          </p>
                          {other && (
                            <span className="mw-alternative-same">
                              Один план для:{' '}
                              {same?.candidateIds
                                .map((id) =>
                                  candidateTitle(
                                    currentCandidates.find((x) => x.id === id)!,
                                  ),
                                )
                                .join(' · ')}
                            </span>
                          )}
                          <div className="mw-plan-headline">
                            <div>
                              <strong>
                                {c.sorties.length
                                  ? `${fmt(c.metrics.makespanSec / 60)} мин`
                                  : '—'}
                              </strong>
                              <small>
                                {c.status === 'feasible_model'
                                  ? 'До завершения'
                                  : 'Только рассчитанная часть'}
                              </small>
                            </div>
                            <div>
                              <strong>
                                {fmt(c.metrics.flightTimeSec / 60)} мин
                              </strong>
                              <small>
                                Общий налёт{' '}
                                <InfoHint
                                  label={`Что такое налёт: ${candidateTitle(c)}`}
                                >
                                  Складываем время всех БВС в воздухе. Два
                                  аппарата по 10 минут — это 20 минут налёта,
                                  даже если миссия завершилась за 10 минут.
                                </InfoHint>
                              </small>
                            </div>
                          </div>
                          <div className="mw-alternative-fleet">
                            <span>{missionFleetLabel(document, c)}</span>
                            {c.sorties.length > 0 && (
                              <span>
                                {concurrentVehicleCount(c) > 1
                                  ? `${concurrentVehicleCount(c)} одновременно`
                                  : c.metrics.vehicleCount > 1
                                    ? 'По очереди'
                                    : 'Один аппарат'}
                              </span>
                            )}
                          </div>
                          {c.trace.some(
                            (x) =>
                              x.event === 'DIRECT_AREA_TRANSFER' ||
                              x.event === 'AREA_TRANSFER_BLOCKED',
                          ) && (
                            <details className="mw-details">
                              <summary>Переходы между участками</summary>
                              {c.trace
                                .filter(
                                  (x) =>
                                    x.event === 'DIRECT_AREA_TRANSFER' ||
                                    x.event === 'AREA_TRANSFER_BLOCKED',
                                )
                                .map((x, i) => (
                                  <p key={i}>{x.detail}</p>
                                ))}
                            </details>
                          )}
                          <details className="mw-details">
                            <summary>Покрытие, вылеты и батарея</summary>
                            <dl className="mw-definition">
                              <dt>
                                {c.status === 'feasible_model'
                                  ? 'Завершение'
                                  : 'Конец рассчитанной части'}
                              </dt>
                              <dd>
                                {c.sorties.length
                                  ? timestamp(document, c.metrics.makespanSec)
                                  : '—'}
                              </dd>
                              <dt>
                                Суммарный налёт{' '}
                                <InfoHint label={`Налёт: ${candidateTitle(c)}`}>
                                  Сумма времени всех вылетов всех БВС. При
                                  параллельных полётах она больше времени до
                                  окончания миссии. Это показатель использования
                                  ресурса, не прогноз физического износа.
                                </InfoHint>
                              </dt>
                              <dd>{fmt(c.metrics.flightTimeSec / 60)} мин</dd>
                              <dt>БВС / вылеты</dt>
                              <dd>
                                {c.metrics.vehicleCount} /{' '}
                                {c.metrics.sortieCount}
                              </dd>
                              <dt>Покрытие целевой площади</dt>
                              <dd>{fmt(c.metrics.coveragePct)}%</dd>
                              <dt>
                                Минимальный остаток АКБ{' '}
                                <InfoHint
                                  label={`Остаток АКБ: ${candidateTitle(c)}`}
                                >
                                  Самый маленький расчётный заряд после посадки
                                  среди всех вылетов. Должен быть не ниже
                                  заданного резерва. Это не текущий заряд всего
                                  флота.
                                </InfoHint>
                              </dt>
                              <dd>
                                {c.sorties.length
                                  ? `${fmt(c.metrics.minimumRemainingPct)}%`
                                  : '—'}
                              </dd>
                            </dl>
                          </details>
                        </div>
                      );
                    })}
                  {planningStep !== 'confirm' && !current?.recommendation && (
                    <div
                      className="mw-card mw-plan-card"
                      data-candidate-id="balanced"
                      aria-disabled="true"
                    >
                      <h3>Уложиться в срок</h3>
                      <p className="mw-caption">
                        Нужен хотя бы один план, прошедший проверки.
                      </p>
                    </div>
                  )}
                  {!!current?.document.resourceReservations?.length && (
                    <details className="mw-details">
                      <summary>БВС, занятые другими миссиями</summary>
                      <ul>
                        {current.document.resourceReservations.map((r) => (
                          <li key={`${r.operationId}:${r.vehicleId}`}>
                            {r.vehicleId} · {r.missionName} — не участвует в
                            этом расчёте.
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <MissionSafetySummary
                    candidate={candidate}
                    compact
                    onOpenChecks={revealChecks}
                  />
                  <button
                    className="mw-button primary"
                    title={
                      candidate.status !== 'feasible_model' ||
                      checkCounts.fail > 0
                        ? 'Есть нарушения или не найден полный выполнимый план'
                        : isApproved
                          ? 'План уже подтверждён — перейдите к выполнению'
                          : 'Проверить ограничения перед симуляцией'
                    }
                    style={{ width: '100%', marginTop: 10 }}
                    disabled={
                      candidate.status !== 'feasible_model' ||
                      checkCounts.fail > 0 ||
                      isApproved
                    }
                    onClick={() => {
                      setPlanningStep('confirm');
                      setAcknowledged(false);
                      setModal('approval');
                    }}
                  >
                    <ShieldCheck size={15} />
                    {isApproved
                      ? 'План подтверждён'
                      : 'Проверить и подтвердить'}
                  </button>
                  {isApproved && (
                    <div className="mw-actions" style={{ marginTop: 12 }}>
                      <button
                        className="mw-button primary"
                        onClick={() => {
                          setWorkspace('execution');
                          setFit((x) => x + 1);
                        }}
                      >
                        К выполнению
                      </button>
                      <button
                        className="mw-button"
                        disabled={operationActionBusy}
                        onClick={() => void scheduleOperation(false)}
                      >
                        Поставить в план
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
        {workspace === 'results' && (
          <>
            <div className="expert-report-navigation">
              <button
                className="mw-button mw-report-back"
                onClick={() => setWorkspace('missions')}
              >
                ← К списку миссий
              </button>
              <Tabs
                className="mw-result-tabs"
                value={resultsTab}
                onValueChange={(value) =>
                  setResultsTab(value as typeof resultsTab)
                }
              >
                <TabsList aria-label="Разделы результатов" variant="line">
                  {(
                    [
                      ['summary', 'Все миссии'],
                      ['analysis', 'Проверки миссии'],
                    ] as const
                  ).map(([id, title]) => (
                    <TabsTrigger
                      id={`result-${id}`}
                      key={id}
                      value={id}
                      aria-controls={`result-panel-${id}`}
                    >
                      {title}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            {reviewCandidate && resultsTab !== 'summary' && (
              <output
                className="mw-result-state"
                data-status={reviewCandidate.status}
              >
                <strong>{reviewDocument?.name}</strong> ·{' '}
                {candidateNames[reviewCandidate.status]}
              </output>
            )}
            {reviewCandidate && reviewDocument && resultsTab !== 'summary' && (
              <button
                className="mw-button primary"
                onClick={() =>
                  void downloadDemoArtifact(reviewDocument.id, 'evidence')
                }
                disabled={exportBusy}
              >
                <Download size={16} /> Скачать доказательства ZIP
              </button>
            )}
            <section
              className="mw-result-summary"
              id="result-panel-summary"
              role="tabpanel"
              aria-labelledby="result-summary"
              hidden={resultsTab !== 'summary'}
            >
              <DemoReportTable
                documents={demoDocuments}
                results={demoResults}
                rows={operations.rows}
                busy={exportBusy}
                recordings={recordings.info}
                selections={demoSelection}
                onDownload={(id, kind) => void downloadDemoArtifact(id, kind)}
                onOpenChecks={openReportChecks}
              />
              <div className="expert-legacy-summary" hidden>
                <div className="mw-result-heading">
                  <div>
                    <h2>
                      {candidate ? 'Итог расчёта' : 'Результатов пока нет'}
                    </h2>
                    <p>
                      План и расчётные проверки, не отчёт о фактически
                      полученной съёмке.
                    </p>
                  </div>
                  <button
                    className="mw-button primary"
                    disabled={!candidate}
                    onClick={() => void exportPlan('evidence')}
                  >
                    <Download size={16} />
                    Расчёт JSON
                  </button>
                </div>
                {candidate ? (
                  <>
                    {activeRun && (
                      <div className="mw-actions" style={{ marginBottom: 16 }}>
                        <button
                          className="mw-button primary"
                          onClick={() => void exportRun()}
                        >
                          Отчёт о запуске JSON
                        </button>
                        <button
                          className="mw-button"
                          onClick={() => void exportRun(true)}
                        >
                          Отчёт HTML
                        </button>
                        <button
                          className="mw-button"
                          onClick={() => openRunJournal(activeRun)}
                        >
                          Журнал запуска
                        </button>
                        <span className="mb-status">
                          {activeRun.status === 'completed'
                            ? 'Завершена в модели'
                            : activeRun.status === 'cancelled'
                              ? 'Остановлена'
                              : 'Не завершена'}
                        </span>
                      </div>
                    )}
                    <div
                      className="mw-result-metrics"
                      aria-label="Показатели плана"
                    >
                      <article>
                        <strong>
                          {fmt(candidate.metrics.grossCoveragePct)}%
                        </strong>
                        <span>Покрытие исходной площади</span>
                      </article>
                      <article>
                        <strong>
                          {fmt(candidate.metrics.makespanSec / 60)} мин
                        </strong>
                        <span>До последней посадки</span>
                      </article>
                      <article>
                        <strong>
                          {fmt(candidate.metrics.flightTimeSec / 60)} мин
                        </strong>
                        <span>Общий налёт</span>
                      </article>
                      <article>
                        <strong>{candidate.metrics.vehicleCount}</strong>
                        <span>БВС в плане</span>
                      </article>
                    </div>
                    <MissionSafetySummary
                      candidate={candidate}
                      onOpenChecks={revealChecks}
                    />
                    {current && (
                      <MissionDataSummary
                        document={current.document}
                        candidate={candidate}
                        completed={
                          activeRun?.status === 'completed' &&
                          activeRun.inputHash === current.inputHash &&
                          canonicalStringify(activeRun.candidate) ===
                            canonicalStringify(candidate)
                        }
                      />
                    )}
                    <div className="mw-result-next">
                      <button
                        className="mw-button"
                        onClick={() => {
                          setWorkspace('planning');
                          setPlanningStep('variants');
                          setFocusMode(false);
                          setFit((x) => x + 1);
                        }}
                      >
                        Сравнить планы
                      </button>
                      <button
                        className="mw-button"
                        onClick={() => setResultsTab('analysis')}
                      >
                        Почему этот план
                      </button>
                      <button
                        className="mw-button"
                        onClick={() => setResultsTab('files')}
                      >
                        Форматы и файлы
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="mw-button"
                    onClick={() => {
                      setWorkspace('planning');
                      setPlanningStep('task');
                    }}
                  >
                    Подготовить миссию
                  </button>
                )}
              </div>
            </section>
            <section
              className="mw-results-checks"
              id="result-panel-analysis"
              role="tabpanel"
              aria-labelledby="result-analysis"
              hidden={resultsTab !== 'analysis'}
            >
              <h2>Проверки плана</h2>
              {resultsTab === 'analysis' &&
                reviewDocument &&
                reviewCandidate && (
                  <MissionFailedChecks
                    document={reviewDocument}
                    candidate={reviewCandidate}
                    onFleet={() => setWorkspace('fleet')}
                    onAssignment={(jobId) => {
                      const draft =
                        demoDocuments.find((d) => d.id === reviewDocument.id) ??
                        reviewDocument;
                      previewJobId.current = jobId;
                      openPreview(draft, 'Назначение БВС');
                      setJobIndex(
                        Math.max(
                          0,
                          draft.jobs.findIndex((j) => j.id === jobId),
                        ),
                      );
                      setEditorTab('vehicles');
                    }}
                  />
                )}
              {resultsTab === 'analysis' && reviewCandidate && (
                <details
                  className="mw-details"
                  key={`${reviewResult?.inputHash}:${reviewCandidate.id}:checks`}
                >
                  <summary>Все проверки</summary>
                  <MissionCheckGroups checks={reviewCandidate.checks} />
                </details>
              )}
              {resultsTab === 'analysis' &&
                reviewDocument &&
                reviewCandidate && (
                  <MissionAnalysisPanel
                    key={`${reviewResult?.inputHash}:${reviewCandidate.id}:insights`}
                    document={reviewDocument}
                    candidate={reviewCandidate}
                    compact
                    onOpenTrial={(next, label) => {
                      openPreview({ ...next, id: reviewDocument.id }, label);
                      previewTrialOrigin.current = reviewDocument;
                    }}
                    operation={reviewOperation}
                    getFleet={() => operations.listFleet()}
                  />
                )}
            </section>
          </>
        )}
        <div className="mw-bottom">
          {modal === 'telemetry' && (
            <Modal
              title="Подробности полёта и журнал событий"
              onClose={onModalClose}
              wide
            >
              <div className="mw-telemetry">
                <h2>
                  БВС: {vehicleDisplayName(activeVehicle)}{' '}
                  <span className="mw-badge">
                    {isApproved ? stateLabel : 'НЕ ЗАПУЩЕН'}
                  </span>
                </h2>
                <dl className="mw-definition">
                  <dt>Связь с бортом</dt>
                  <dd>Нет подключения · симуляция</dd>
                  <dt>Координаты WGS84 · модель</dt>
                  <dd>
                    {isApproved && activeSegment
                      ? `${(activeSegment.from[1] + (activeSegment.to[1] - activeSegment.from[1]) * progress).toFixed(6)}, ${(activeSegment.from[0] + (activeSegment.to[0] - activeSegment.from[0]) * progress).toFixed(6)}`
                      : '—'}
                  </dd>
                  <dt>Батарея / модельный заряд</dt>
                  <dd>
                    {activeSortie?.batteryId ?? lastSortie?.batteryId ?? '—'} ·{' '}
                    {isApproved && battery !== undefined
                      ? `${fmt(battery)}%`
                      : '—'}
                  </dd>
                  <dt>Высота в локальном уровне</dt>
                  <dd>
                    {isApproved && activeSegment
                      ? `${fmt(activeSegment.altitudeFromM + (activeSegment.altitudeToM - activeSegment.altitudeFromM) * progress)} м`
                      : '—'}
                  </dd>
                  <dt>
                    Готовность ресурса по модели{' '}
                    <InfoHint label="Когда БВС будет доступен?">
                      Расчёт учитывает подготовку, вылеты и оставшийся заряд.
                      Проверка перед повторным вылетом не заменяет батарею.
                      Время будущей замены неизвестно.
                    </InfoHint>
                  </dt>
                  <dd>
                    {!activeVehicleState
                      ? 'Нужен запущенный модельный план'
                      : [
                            'cancelled',
                            'disabled',
                            'not_assigned',
                            'unavailable',
                          ].includes(activeVehicleState.status) ||
                          activeVehicleState.readyAtSec === null
                        ? 'Готовность не подтверждена'
                        : `Не ранее ${timestamp(document, activeVehicleState.readyAtSec)}`}
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
                    onClick={() => setWorkspace('fleet')}
                  >
                    Открыть парк БВС
                  </button>
                </div>
                <h2 style={{ marginTop: 20 }}>
                  Журнал модельных событий{' '}
                  <InfoHint label="События выполнения">
                    События относятся к подтверждённому плану на карте, не к
                    бортовой телеметрии.
                  </InfoHint>
                </h2>
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
                            <strong>
                              {phaseNames[event.type] ?? event.type}
                            </strong>{' '}
                            · {event.vehicleId}
                            <br />
                            {event.detail}
                          </p>
                        </div>
                      ))
                  ) : (
                    <p className="mw-caption">Пока нет событий.</p>
                  )}
                </div>
              </div>
            </Modal>
          )}
          <section
            className="mw-delivery"
            id="result-panel-files"
            role="tabpanel"
            aria-labelledby="result-files"
            hidden={workspace !== 'results' || resultsTab !== 'files'}
          >
            <h2>
              Миссия и комплект воспроизведения{' '}
              <InfoHint label="Форматы экспорта">
                YAML и JSON можно загрузить обратно. MD — читаемое описание, не
                обратный импорт. Экспорт сохраняет и неудачные проверки.
                KML/GeoJSON предназначены для анализа, не проверены как команды
                автопилота.
              </InfoHint>
            </h2>
            <div className="mw-actions">
              <button className="mw-button" onClick={() => exportTask('yaml')}>
                <Download size={14} />
                Миссия YAML
              </button>
              <button className="mw-button" onClick={() => exportTask('json')}>
                JSON
              </button>
              <button className="mw-button" onClick={() => exportTask('md')}>
                Описание MD
              </button>
            </div>
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
                    {vehicleDisplayName(v)}
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
                disabled={!candidate || !current}
                onClick={() => {
                  if (candidate && current)
                    download(
                      `${current.document.id}.photo-coverage.geojson`,
                      JSON.stringify(
                        photoCoverageGeoJSON(
                          current.document,
                          candidate.sorties,
                        ),
                        null,
                        2,
                      ),
                      'application/geo+json',
                    );
                }}
              >
                Отпечатки кадров
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
            {current && (
              <>
                <p className="mw-code" style={{ marginTop: 10 }}>
                  Вход SHA-256: {current.inputHash}
                </p>
                <p className="mw-caption">
                  Ядро {current.engineVersion} ·{' '}
                  {restoredSnapshot
                    ? 'сохранённый снимок, без нового расчёта'
                    : `расчёт ${fmt(current.computationMs, 0)} мс`}
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
      </div>
      <input
        ref={file}
        aria-label="Файл миссии"
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
      {modal === 'report-preview' && (
        <Modal
          title="Отчёт миссии"
          wide
          onClose={onModalClose}
          footer={
            <button className="mw-button small" onClick={onModalClose}>
              ← Назад к отчётам
            </button>
          }
        >
          <iframe
            title="Отчёт выполнения"
            sandbox=""
            srcDoc={reportPreview}
            style={{
              width: '100%',
              height: '70vh',
              border: 0,
              background: 'white',
            }}
          />
        </Modal>
      )}
      {modal === 'upload' && (
        <Modal
          title="Загрузить данные"
          onClose={onModalClose}
          help="ТЗ не задаёт единый формат входной миссии: используется контракт стенда. Файлы другого планировщика не считаются совместимыми автоматически. Перед применением откроется проверка данных."
        >
          <div className="mw-import-choices">
            <section>
              <h3>
                Миссия целиком{' '}
                <InfoHint label="Файл миссии">
                  JSON / YAML нашего формата: работы, парк, сроки и ограничения.
                </InfoHint>
              </h3>
              <button
                className="mw-button primary"
                onClick={() => {
                  setModal(null);
                  file.current?.click();
                }}
              >
                Выбрать файл миссии
              </button>
              <a
                href="/planner/scenarios/automatic-tradeoff.mission.json"
                download
              >
                Скачать пример JSON
              </a>
            </section>
            <section>
              <h3>
                Область и площадки{' '}
                <InfoHint label="Файл геометрии">
                  GeoJSON / KML · координаты WGS84. Назначение геометрии
                  выбирается перед добавлением.
                </InfoHint>
              </h3>
              <button
                className="mw-button"
                onClick={() => {
                  setModal(null);
                  geoFile.current?.click();
                }}
              >
                Выбрать файл геометрии
              </button>
              <a
                href="/planner/scenarios/automatic-tradeoff.area.geojson"
                download
              >
                Скачать пример GeoJSON
              </a>
            </section>
            <section>
              <h3>
                Препятствия и запреты{' '}
                <InfoHint label="Слой ограничений">
                  JSON слоя: контуры, высоты и время действия. Растровый рельеф
                  DEM пока не поддерживается.
                </InfoHint>
              </h3>
              <button
                className="mw-button"
                onClick={() => {
                  setModal(null);
                  layerFile.current?.click();
                }}
              >
                Выбрать слой ограничений
              </button>
              <a
                href="/planner/scenarios/timed-airspace.restrictions.json"
                download
              >
                Скачать пример слоя
              </a>
            </section>
          </div>
        </Modal>
      )}
      {modal === 'catalog' && (
        <Modal title="Демонстрационные сценарии" wide onClose={onModalClose}>
          <MissionGallery onOpen={openPreview} />
        </Modal>
      )}
      {modal === 'operations' && (
        <Modal
          title="Мои миссии — очередь и история"
          wide
          error={error}
          onClose={onModalClose}
        >
          <MissionOperationsBoard
            rows={operations.rows}
            selectedId={activeRunId}
            onJournal={openRunJournal}
            busy={operationActionBusy || operations.busy || operations.loading}
            onOpen={(row) => void openOperation(row)}
            onStart={(row) => void openOperation(row, true)}
            onPause={(row) => void pauseOperation(row)}
            onCancel={(row) => void cancelOperation(row)}
            onRefresh={() => {
              void operations.refresh().catch((e) => setError(errorMessage(e)));
            }}
          />
          {operations.rejected.length > 0 && (
            <button
              className="mw-button"
              onClick={() => setModal('journal-review')}
            >
              Старые снимки · {operations.rejected.length}
            </button>
          )}
        </Modal>
      )}
      <Modal
        title="Настройки и справка"
        open={modal === 'settings'}
        onClose={onModalClose}
      >
        <section className="mw-settings-section">
          <h3>Оформление</h3>
          <MissionThemeSelector />
        </section>
        <section className="mw-settings-section">
          <h3>Помощь</h3>
          <button
            className="mw-button primary"
            onClick={() => setModal('guide')}
          >
            <CircleHelp size={17} />
            Справка по программе
          </button>
        </section>
        <section className="mw-settings-section">
          <h3>Новая демонстрация</h3>
          <button
            className="mw-button demo-delete"
            onClick={() => {
              if (
                window.confirm(
                  'Начать стенд с нуля? Будут остановлены симуляции и удалены изменения миссий, расчёты, журналы и видео текущей сессии. Три примера и активный парк восстановятся. Скачанные файлы сохранятся.',
                )
              ) {
                request.current?.abort();
                window.dispatchEvent(new Event('prime:reset-demo'));
              }
            }}
          >
            Начать с нуля
          </button>
        </section>
        <details className="mw-details">
          <summary>О стенде и диагностике</summary>
          <p>
            Геоскан · ЛЦТ 2026 · задача №5. CPU-расчёт, модельная симуляция.
            Реальные аппараты не подключены.
          </p>
          <Link
            href="/planner/legacy"
            target="_blank"
            rel="noopener noreferrer"
            className="mw-button"
          >
            Диагностика v1
          </Link>
        </details>
      </Modal>
      {modal === 'mission-actions' && (
        <Modal title="Действия с миссией" onClose={onModalClose}>
          <div className="mw-mission-action-list">
            <button className="mw-button" onClick={() => setModal('upload')}>
              <Upload size={16} />
              Загрузить миссию или слой
            </button>
            <button className="mw-button" onClick={() => exportTask('json')}>
              <Download size={16} />
              Скачать миссию JSON
            </button>
            {activeRun && (
              <button
                className="mw-button demo-delete"
                onClick={() => {
                  setModal(null);
                  void deleteDemoRun(activeRun.document.id);
                }}
              >
                <Trash2 size={16} />
                Удалить из выполнения
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === 'guide' && (
        <Modal title="Справка по программе" wide onClose={onModalClose}>
          <MissionProgramHelp />
        </Modal>
      )}
      {modal === 'comparison' && current && (
        <Modal title="Сравнение вариантов миссии" wide onClose={onModalClose}>
          <MissionComparisonView
            result={current}
            selectedId={candidateId}
            onSelect={chooseCandidate}
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
                  setWorkspace('planning');
                  setPlanningStep('task');
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
          <div className="mw-heading-with-hint">
            <h3>Копия миссии</h3>
            <InfoHint label="Сохранение копии">
              Все работы, назначения, геометрия и параметры сохраняются как
              новую миссию. Исходная запись не перезаписывается; подтверждение
              плана не переносится. ID: латинские буквы, цифры, дефис и
              подчёркивание; до 60 символов. Например: mission-27.
            </InfoHint>
          </div>
          <label className="mw-field">
            Новый номер / ID миссии
            <input
              value={copyId}
              maxLength={60}
              onChange={(e) => setCopyId(e.target.value)}
              placeholder="mission-27"
            />
          </label>
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
          help="GeoJSON/KML: координаты WGS84, назначение выбирается перед добавлением. JSON объёмов сохраняет высоты, источник и время действия объектов. Высоты заданы в общем локальном уровне миссии: AMSL, AGL и WGS84 не преобразуются автоматически. Возвышенность можно задать объёмным препятствием, но это не цифровая модель рельефа. TIFF/DEM и распознавание препятствий из картинки не поддержаны. При конфликте ID импорт отменяется целиком; изменение слоя отменяет подтверждение плана."
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
          <ObstacleLayerPanel
            source={document.obstacleLayer}
            visible={showObstacles}
            onVisible={setShowObstacles}
            onError={setError}
            onFocus={(bounds) => {
              setShowObstacles(true);
              setObstacleFocus([...bounds]);
              setModal(null);
            }}
            onChange={(source) => {
              const next = { ...document };
              if (source) next.obstacleLayer = source;
              else delete next.obstacleLayer;
              edit(next);
              setWizard(true);
              setNotice(
                source
                  ? 'Слой подключён. Пересчитайте миссию.'
                  : 'Слой отключён от новой версии миссии.',
              );
            }}
          />
          <div className="ms-file-actions">
            <button
              className="mw-button"
              onClick={() => importObjects('obstacle')}
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
            <p className="mw-caption">Ручных объёмных ограничений нет.</p>
          )}
        </Modal>
      )}
      {modal === 'backup' && backupPreview && (
        <Modal
          title="Восстановление резервной копии"
          help="Перед добавлением все записи проверяются. Если хотя бы один ID уже занят или данные неверны, импорт целиком отменяется. Текущее миссия и существующая библиотека не перезаписываются."
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
                    setLibraryRows(await library.current!.list(true));
                    setModal('library');
                    setNotice(
                      `Добавлено миссий: ${count}. Существующие записи не перезаписаны.`,
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
        </Modal>
      )}
      {modal === 'preview' && preview && (
        <Modal
          title="Проверка перед загрузкой"
          className="mission-import-modal"
          help="Источник загружается только после подтверждения. Сохранённая библиотека не изменяется. Старые миссии открываются рабочими копиями с актуальными правилами батареи и безопасности; перед запуском нужен новый расчёт."
          error={error}
          onClose={onModalClose}
          footer={
            <>
              <details className="mission-download-menu">
                <summary className="mw-button">Скачать миссию</summary>
                <div>
                  <button
                    className="mw-button"
                    onClick={() =>
                      download(
                        `${preview.id}.mission.json`,
                        serializeMissionJson(preview),
                      )
                    }
                  >
                    JSON · для загрузки
                  </button>
                  <button
                    className="mw-button"
                    onClick={() =>
                      download(
                        `${preview.id}.mission.html`,
                        missionPassportHtml(preview),
                        'text/html',
                      )
                    }
                  >
                    HTML · все параметры
                  </button>
                </div>
              </details>
              <button className="mw-button" onClick={onModalClose}>
                Отмена
              </button>
              <button
                className="mw-button primary"
                disabled={
                  operationActionBusy ||
                  (previewDuplicate && !importCopyChoice) ||
                  (!!previewConflicts.length && !importFleetChoice)
                }
                onClick={() => void acceptPreview()}
              >
                Открыть в редакторе
              </button>
            </>
          }
        >
          <p className="mw-caption">Источник: {previewName}.</p>
          {previewDuplicate && (
            <div className="mw-alert">
              <strong>Миссия с таким ID уже есть.</strong>
              <label className="mw-checkbox">
                <input
                  type="checkbox"
                  checked={importCopyChoice}
                  onChange={(e) => setImportCopyChoice(e.target.checked)}
                />
                Создать отдельную копию с новым ID
              </label>
              <button
                className="mw-button small"
                onClick={() =>
                  openPreview(
                    demoDocuments.find((d) => d.id === preview.id)!,
                    'Существующая миссия',
                  )
                }
              >
                Открыть существующую
              </button>
            </div>
          )}
          {!!previewConflicts.length && (
            <div className="mw-alert">
              <strong>
                Эти ID БВС уже есть в парке с другими параметрами:
              </strong>
              <ul>
                {previewConflicts.map((c) => (
                  <li key={c.id}>
                    <strong>{c.name}</strong>: {c.differences.join('; ')}.
                  </li>
                ))}
              </ul>
              <label className="mw-checkbox">
                <input
                  type="checkbox"
                  checked={importFleetChoice}
                  onChange={(e) => setImportFleetChoice(e.target.checked)}
                />
                Использовать текущие характеристики, базы и заряд общего парка
              </label>
              <small>
                Для других физических аппаратов отмените импорт и задайте им
                уникальные ID в файле.
              </small>
            </div>
          )}
          <MissionImportCard document={preview} />
          {(!preview.planning.batteryPolicy ||
            !preview.planning.safetyPolicy) && (
            <p className="mw-caption">Архивный формат · требуется пересчёт.</p>
          )}
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
            {geometry.name}{' '}
            <InfoHint label="Применение геометрии">
              Выберите назначение слоя. Подтверждение плана будет отменено. Это
              координатный слой, не подложка и не DEM.
            </InfoHint>
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
              <option value="exclusion">Постоянные запреты — добавить</option>
              <option value="airspace">
                Граница полётов — заменить одним контуром
              </option>
              <option value="reserve">
                Запасные площадки — добавить точки
              </option>
              <option value="obstacle">
                Препятствия / возвышенности — добавить объёмы
              </option>
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
              <div className="mw-heading-with-hint">
                <span>Высоты слоя</span>
                <InfoHint label="Высота препятствий">
                  От 0 до указанной высоты в общем локальном уровне миссии.
                  Пустое значение закрывает весь столб. Это не высота рельефа
                  над уровнем моря. Каждый объект можно уточнить в «Редактор →
                  Условия».
                </InfoHint>
              </div>
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
            <h3>{candidateTitle(candidate)}</h3>
            <p>
              {candidate.metrics.vehicleCount} БВС ·{' '}
              {candidate.metrics.sortieCount} вылетов
            </p>
            <p>
              Окончание: {timestamp(document, candidate.metrics.makespanSec)} ·
              покрытие {fmt(candidate.metrics.coveragePct)}%
            </p>
          </div>
          <MissionSafetySummary
            candidate={candidate}
            compact
            onOpenChecks={() => {
              onModalClose();
              revealChecks();
            }}
          />
          <label className="mw-checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              Подтверждаю запуск симуляции с условиями модели. Это не разрешение
              на реальный полёт.
            </span>
          </label>
          <details className="mw-details">
            <summary>Идентификатор расчёта</summary>
            <p className="mw-code">SHA-256: {current?.inputHash}</p>
          </details>
        </Modal>
      )}
      {modal === 'library' && (
        <Modal
          title="Сохранённые миссии"
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
          <InfoHint label="Как хранится миссия">
            Это исходники для редактирования, не очередь и не история
            выполнения. Хранятся только в этом браузере. «Открыть копию» создаёт
            новый ID. Выгружайте резервную копию перед очисткой браузера.
          </InfoHint>
          {!libraryRows.length && (
            <div className="mw-empty">
              <FolderOpen size={30} />
              <h3>Пока нет сохранённых миссий</h3>
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
                      structuredClone(entry.document),
                      `Сохранённая миссия, версия ${entry.revision}`,
                      entry.revision,
                    )
                  }
                >
                  Открыть миссию
                </button>
                <button
                  className="mw-button small"
                  onClick={() =>
                    openPreview(
                      {
                        ...structuredClone(entry.document),
                        id: `mission-${crypto.randomUUID()}`,
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
                          setLibraryRows(await library.current!.list(true));
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
