'use client';
import { useEffect, useRef, useState } from 'react';
// oxlint-disable-next-line import/default -- Vite generates this constructor for ?worker imports.
import ObstacleImportWorker from '@/lib/planner/obstacle-import.worker?worker';
import { InfoHint } from './mission-help';
import {
  MAX_OBSTACLE_BYTES,
  OBSTACLE_ADAPTER,
  expandedBounds,
  type Bounds,
  type ObstacleSource,
  type ObstacleCatalog,
} from '@/lib/planner/obstacle-layer';
import {
  listObstacleSources,
  saveObstacleSource,
} from '@/lib/planner/obstacle-store';

export default function ObstacleLayerPanel({
  source,
  onChange,
  visible,
  onVisible,
  onError,
  onFocus,
}: {
  source?: ObstacleSource;
  onChange: (source?: ObstacleSource) => void;
  visible: boolean;
  onVisible: (show: boolean) => void;
  onError: (message: string) => void;
  onFocus: (bounds: Bounds) => void;
}) {
  const [preview, setPreview] = useState<{
    source: ObstacleSource;
    catalog: ObstacleCatalog;
    hash: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [search, setSearch] = useState('');
  const [saved, setSaved] = useState<
    Awaited<ReturnType<typeof listObstacleSources>>
  >([]);
  const worker = useRef<Worker | null>(null),
    ownedWorkers = useRef(new Set<Worker>()),
    lifecycle = useRef({ active: true }),
    generation = useRef(0),
    file = useRef<HTMLInputElement>(null);
  const cancel = () => {
    generation.current++;
    worker.current?.terminate();
    if (worker.current) ownedWorkers.current.delete(worker.current);
    worker.current = null;
    setBusy(false);
  };
  function inspect(next: ObstacleSource) {
    if (!lifecycle.current.active) return;
    cancel();
    setBusy(true);
    setPreview(null);
    onError('');
    const seq = generation.current;
    let w: Worker;
    try {
      w = new ObstacleImportWorker();
    } catch {
      setBusy(false);
      onError('Не удалось запустить обработку KML. Слой не изменён.');
      return;
    }
    worker.current = w;
    ownedWorkers.current.add(w);
    const timer = setTimeout(() => {
      if (ownedWorkers.current.has(w) && worker.current === w) {
        cancel();
        onError('Импорт превысил 15 секунд. Слой миссии не изменён.');
      }
    }, 15000);
    w.onmessage = (e) => {
      clearTimeout(timer);
      if (seq !== generation.current) return;
      w.terminate();
      ownedWorkers.current.delete(w);
      worker.current = null;
      setBusy(false);
      if (e.data.error) onError(e.data.error);
      else
        setPreview({
          source: next,
          catalog: e.data.catalog,
          hash: e.data.hash,
        });
    };
    w.onerror = () => {
      clearTimeout(timer);
      cancel();
      onError('Не удалось запустить обработку KML. Слой не изменён.');
    };
    w.postMessage(next);
  }
  useEffect(() => {
    const owned = ownedWorkers.current,
      life = lifecycle.current;
    life.active = true;
    listObstacleSources()
      .then((rows) => {
        if (life.active) setSaved(rows);
      })
      .catch((e) => {
        if (life.active) onError(String(e));
      });
    return () => {
      life.active = false;
      owned.forEach((w) => w.terminate());
      owned.clear();
    };
  }, [onError]);
  const entries =
    preview?.catalog.objects.filter((o) =>
      `${o.id} ${o.sourceId} ${o.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <section className="mw-details" aria-label="Внешний слой препятствий">
      <h3>
        Препятствия из KML{' '}
        <InfoHint label="Препятствия из KML">
          Высоты сохраняются как в источнике. До согласования с рельефом
          применяется горизонтальный обход на всех высотах. Буферы — параметры
          модели, не утверждённые нормы. Скрытие слоя на карте не исключает его
          из расчёта.
        </InfoHint>
      </h3>
      <div className="ms-file-actions">
        <button
          className="mw-button primary"
          onClick={() => file.current?.click()}
          disabled={busy}
        >
          Загрузить KML препятствий
        </button>
        {busy && (
          <button className="mw-button" onClick={cancel}>
            Отменить обработку
          </button>
        )}
        {source && (
          <>
            <button className="mw-button" onClick={() => inspect(source)}>
              Отчёт слоя
            </button>
            <label>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => onVisible(e.target.checked)}
              />{' '}
              На карте
            </label>
            <button
              className="mw-button"
              onClick={() => {
                onChange(undefined);
                setPreview(null);
              }}
            >
              Отключить от миссии
            </button>
          </>
        )}
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept=".kml"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            if (f.size > MAX_OBSTACLE_BYTES)
              throw new Error('KML больше 8 МиБ.');
            const sourceText = new TextDecoder('utf-8', {
              fatal: true,
              ignoreBOM: true,
            }).decode(await f.arrayBuffer());
            inspect({
              version: OBSTACLE_ADAPTER,
              filename: f.name,
              sourceText,
              bufferM: 10,
              lineHalfWidthM: 2,
              policySource:
                'Модельные отступы оператора; точность исходника и нормативные расстояния не предоставлены.',
            });
          } catch (err) {
            onError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      {busy && <output>Проверяем геометрию и высоты…</output>}
      {source && (
        <p>
          <strong>{source.filename}</strong> · обход сбоку · запас{' '}
          {source.bufferM} м
        </p>
      )}
      {!!saved.length && (
        <details>
          <summary>Сохранённые слои ({saved.length})</summary>
          {saved.map((s) => (
            <button
              key={s.hash}
              className="mw-button"
              onClick={() => inspect(s.source)}
            >
              {s.source.filename} · {s.hash.slice(0, 8)}
            </button>
          ))}
        </details>
      )}
      {preview && (
        <>
          <p>
            <strong>{preview.catalog.total} объектов</strong> · принято{' '}
            {preview.catalog.accepted} · из них замкнуто{' '}
            {preview.catalog.repaired} · проблемных {preview.catalog.rejected}
          </p>
          {source?.sourceText === preview.source.sourceText && (
            <button
              className="mw-button"
              onClick={() => onFocus(preview.catalog.bounds)}
            >
              Показать слой целиком
            </button>
          )}
          <div className="ms-file-actions">
            <label
              className="mw-field"
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              Запас, м{' '}
              <input
                type="number"
                min={2}
                max={100}
                value={preview.source.bufferM}
                onChange={(e) =>
                  setPreview({
                    ...preview,
                    source: {
                      ...preview.source,
                      bufferM: Number(e.target.value),
                    },
                  })
                }
                style={{ width: 75 }}
              />
            </label>
            <label
              className="mw-field"
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              Полуширина линии, м{' '}
              <input
                type="number"
                min={0}
                max={100}
                value={preview.source.lineHalfWidthM}
                onChange={(e) =>
                  setPreview({
                    ...preview,
                    source: {
                      ...preview.source,
                      lineHalfWidthM: Number(e.target.value),
                    },
                  })
                }
                style={{ width: 75 }}
              />
            </label>
            <button
              className="mw-button primary"
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  await saveObstacleSource(preview.source);
                  onChange(preview.source);
                  setSaved(await listObstacleSources());
                } catch (e) {
                  onError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Применить к миссии
            </button>
          </div>
          <details>
            <summary>Объекты и происхождение</summary>
            <p>
              SHA-256:{' '}
              <code style={{ overflowWrap: 'anywhere' }}>{preview.hash}</code>
            </p>
            <label className="mw-field">
              <span className="sr-only">Поиск препятствия</span>
              <input
                placeholder="Название или ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <table className="ms-table">
                <thead>
                  <tr>
                    <th>Объект</th>
                    <th>Высоты исходника</th>
                    <th>Обработка</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 100).map((o) => (
                    <tr key={o.id}>
                      <td>
                        <button
                          className="mw-button small"
                          disabled={
                            !o.bounds ||
                            source?.sourceText !== preview.source.sourceText
                          }
                          onClick={() => {
                            if (o.bounds)
                              onFocus(expandedBounds(o.bounds, 100));
                          }}
                        >
                          {o.name}
                        </button>
                        <small>
                          {o.id} · {o.sourceId}
                        </small>
                      </td>
                      <td>
                        {o.altitudeMode} ·{' '}
                        {o.coordinates.flat().length
                          ? `${Math.min(...o.coordinates.flat().map((p) => p[2])).toFixed(1)}…${Math.max(...o.coordinates.flat().map((p) => p[2])).toFixed(1)} м`
                          : '—'}
                      </td>
                      <td>
                        {o.error ??
                          (o.repairs.length ? 'Кольцо замкнуто' : 'Принят')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small>
              Показаны первые {Math.min(100, entries.length)} из{' '}
              {entries.length}. Расчёт не ограничивается таблицей.
            </small>
          </details>
        </>
      )}
    </section>
  );
}
