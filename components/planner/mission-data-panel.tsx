'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
// oxlint-disable-next-line import/default -- Vite worker constructor.
import CatalogWorker from '@/lib/planner/mission-catalog.worker?worker';
import {
  catalogSourceSchema,
  zoneRuleSchema,
  type CatalogSource,
  type MissionCatalog,
} from '@/lib/planner/mission-catalog';
import {
  parseSizedMissionDocument,
  parseStructuredText,
} from '@/lib/planner/mission-io';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import { InfoHint } from './mission-help';
import MissionAirspaceLayerSummary from './mission-airspace-layer-summary';

export default function MissionDataPanel({
  document,
  selectedJob,
  onChange,
  onObstacles,
  onDownloadMission,
  onNotice,
  objects,
}: {
  document: MissionDocument;
  selectedJob: number;
  onChange: (d: MissionDocument) => void;
  onObstacles: () => void;
  onDownloadMission: () => void;
  onNotice: (message: string) => void;
  objects?: ReactNode;
}) {
  const areasInput = useRef<HTMLInputElement>(null),
    zonesInput = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null),
    generation = useRef(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [preview, setPreview] = useState<{
    source: CatalogSource;
    catalog: MissionCatalog;
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState('');
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  const load = async (file: File, role: CatalogSource['role']) => {
    const request = ++generation.current;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setPreview(null);
    setError('');
    setSelected([]);
    setSearch('');
    if (file.size > 4 * 1024 * 1024) {
      setError('Каталог должен быть не больше 4 МиБ.');
      return;
    }
    setBusy(true);
    try {
      const source = catalogSourceSchema.parse({
        version: 'geoscan-mission-catalog/1',
        role,
        filename: file.name,
        sourceText: new TextDecoder('utf-8', { fatal: true }).decode(
          await file.arrayBuffer(),
        ),
        selectedIds: [],
        rules: [],
      });
      if (request !== generation.current) return;
      const w = new CatalogWorker();
      worker.current = w;
      const timer = setTimeout(() => {
        if (worker.current === w) {
          w.terminate();
          worker.current = null;
          setBusy(false);
          setError('Обработка превысила 20 секунд. Миссия не изменена.');
        }
      }, 20000);
      w.onmessage = (e) => {
        clearTimeout(timer);
        if (worker.current !== w) return;
        w.terminate();
        worker.current = null;
        setBusy(false);
        if (e.data.error) setError(e.data.error);
        else setPreview({ source, catalog: e.data.catalog });
      };
      w.onerror = () => {
        clearTimeout(timer);
        w.terminate();
        if (worker.current === w) {
          worker.current = null;
          setBusy(false);
          setError('Не удалось прочитать каталог.');
        }
      };
      w.postMessage(source.sourceText);
    } catch (e) {
      if (request === generation.current) {
        setBusy(false);
        setError(String(e));
      }
    }
  };
  const apply = () => {
    if (!preview) return;
    try {
      const next = structuredClone(document),
        source = { ...preview.source, selectedIds: selected };
      if (source.role === 'areas') {
        if (!selected.length) throw new Error('Выберите хотя бы один участок.');
        if (next.jobs.length - 1 + selected.length > 8)
          throw new Error('В миссии допускается до 8 участков.');
        const template = next.jobs[selectedJob] ?? next.jobs[0];
        const jobs = selected.map((id, i) => {
          const item = preview.catalog.objects.find((o) => o.id === id)!;
          if (item.error || !item.geometry || !item.editable)
            throw new Error(
              'Этот контур нельзя добавить без отдельной подготовки.',
            );
          return {
            ...structuredClone(template),
            inheritsFrom: undefined,
            id: i === 0 ? template.id : `area-${crypto.randomUUID()}`,
            name: item.name,
            area: item.geometry,
          };
        });
        next.jobs.splice(selectedJob, 1, ...jobs);
      } else source.selectedIds = [];
      next.catalogLayers = [
        ...(next.catalogLayers ?? []).filter((s) => s.role !== source.role),
        source,
      ];
      onChange(parseSizedMissionDocument(next));
      setPreview(null);
      onNotice(
        source.role === 'areas'
          ? 'Участки добавлены. Проверьте расположение баз и области полёта.'
          : 'Зоны подключены. Все пересекающие область ограничения учитываются при расчёте.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const listed =
    preview?.catalog.objects.filter((o) =>
      `${o.id} ${o.name} ${o.sourceId}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <details className="mission-data-panel me-section">
      <summary>
        <span className="me-section-title">Данные миссии</span>
        <InfoHint label="Данные миссии">
          KML добавляет участки, зоны запрета или препятствия. JSON сохраняет
          все текущие параметры миссии, включая изменения в редакторе и
          подключённые слои. Его можно снова открыть в редакторе.
        </InfoHint>
      </summary>
      <div className="mission-data-body">
        {objects}
        <div className="mw-actions">
          <button className="mw-button small" onClick={onDownloadMission}>
            Скачать данные миссии JSON
          </button>
        </div>
        <details className="mission-catalog-imports">
          <summary>Каталоги экспертов и образцы</summary>
          <div className="mw-actions" aria-label="Образцы координатных слоёв">
            <a
              className="mw-button small"
              href="/planner/samples/flight-boundary.geojson"
              download
            >
              Образец границы
            </a>
            <a
              className="mw-button small"
              href="/planner/samples/no-flight-zone.geojson"
              download
            >
              Образец запрета
            </a>
            <a
              className="mw-button small"
              href="/planner/samples/reserve-site.geojson"
              download
            >
              Образец площадки
            </a>
          </div>
          <div className="mw-actions">
            <button
              className="mw-button small"
              disabled={busy}
              onClick={() => areasInput.current?.click()}
            >
              Загрузить участки KML
            </button>
            <button
              className="mw-button small"
              disabled={busy}
              onClick={() => zonesInput.current?.click()}
            >
              Загрузить зоны KML
            </button>
            <button className="mw-button small" onClick={onObstacles}>
              Загрузить препятствия KML
            </button>
          </div>
          <input
            ref={areasInput}
            aria-label="Каталог участков KML"
            hidden
            type="file"
            accept=".kml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void load(f, 'areas');
            }}
          />
          <input
            ref={zonesInput}
            aria-label="Каталог зон KML"
            hidden
            type="file"
            accept=".kml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void load(f, 'restrictions');
            }}
          />
          {busy && <output>Проверяем каталог…</output>}
          {error && <p role="alert">{error}</p>}
          {document.catalogLayers?.map((s) => (
            <div className="catalog-source" key={s.role}>
              <span>
                {s.role === 'areas' ? 'Участки' : 'Зоны'} · {s.filename}
              </span>
              <button
                className="mw-button small"
                onClick={() =>
                  onChange({
                    ...document,
                    catalogLayers: document.catalogLayers!.filter(
                      (x) => x.role !== s.role,
                    ),
                  })
                }
              >
                Отключить каталог
              </button>
            </div>
          ))}
          {document.catalogLayers?.some((s) => s.role === 'restrictions') && (
            <MissionAirspaceLayerSummary
              document={document}
              onChange={onChange}
            />
          )}
          {preview && (
            <section aria-label="Предпросмотр каталога">
              <p>
                {preview.catalog.total} объектов · принято{' '}
                {preview.catalog.accepted} · требуют исправления{' '}
                {preview.catalog.rejected}
              </p>
              {preview.source.role === 'areas' ? (
                <>
                  <input
                    aria-label="Поиск в каталоге"
                    placeholder="Название или ID участка"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="catalog-list">
                    {listed.map((o) => (
                      <label key={o.id}>
                        <input
                          type="checkbox"
                          disabled={!!o.error || !o.editable}
                          checked={selected.includes(o.id)}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked
                                ? [...s, o.id]
                                : s.filter((id) => id !== o.id),
                            )
                          }
                        />
                        <span>
                          {o.name} · {o.id}
                          {o.error
                            ? ` · ${o.error}`
                            : !o.editable
                              ? ' · сложный контур, нужна меньшая область'
                              : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Высоты читаются из KML. Зоны проверяются по месту, высоте и
                    времени. Без расписания ограничение учитывается весь период
                    миссии, но только в своём высотном слое.
                  </p>
                  <label className="mw-button small">
                    Загрузить правила высот и времени (JSON)
                    <input
                      hidden
                      aria-label="Правила зон JSON"
                      type="file"
                      accept=".json"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        try {
                          if (f.size > 200 * 1024)
                            throw new Error('Правила превышают 200 КиБ.');
                          const rules = zoneRuleSchema
                            .array()
                            .max(1000)
                            .parse(parseStructuredText(await f.text(), 'json'));
                          setPreview((current) =>
                            current?.source === preview.source
                              ? {
                                  ...current,
                                  source: { ...current.source, rules },
                                }
                              : current,
                          );
                          setError('');
                        } catch (error) {
                          setError(String(error));
                        }
                      }}
                    />
                  </label>
                  <small>Правил загружено: {preview.source.rules.length}</small>
                </>
              )}
              <div className="mw-actions">
                <button className="mw-button primary small" onClick={apply}>
                  {preview.source.role === 'areas'
                    ? `Применить участки (${selected.length})`
                    : 'Применить зоны'}
                </button>
                <button
                  className="mw-button small"
                  onClick={() => {
                    setPreview(null);
                    setError('');
                  }}
                >
                  Отмена
                </button>
              </div>
            </section>
          )}
        </details>
      </div>
    </details>
  );
}
