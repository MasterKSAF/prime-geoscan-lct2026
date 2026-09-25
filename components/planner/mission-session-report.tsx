'use client';
import type {
  MissionDocument,
  MissionResult,
} from '@/lib/planner/mission-schema';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import {
  canDownloadRecording,
  type RecordingInfo,
} from '@/hooks/use-mission-recordings';
import { demoCompletion } from '@/lib/planner/demo-session';
import { operationLabel } from './mission-execution-queue';
import { InfoHint } from './mission-help';
export type DemoDownload =
  | 'report'
  | 'checks'
  | 'evidence'
  | 'video'
  | 'view'
  | 'kml'
  | 'geojson';
export default function MissionSessionReport(p: {
  documents: MissionDocument[];
  results: Record<string, MissionResult>;
  rows: readonly MissionOperation[];
  busy: boolean;
  onDownload: (id: string, kind: DemoDownload) => void;
  recordings?: Record<string, RecordingInfo>;
  selections?: Record<string, string>;
  onOpenChecks: (id: string) => void;
}) {
  return (
    <section className="demo-reports" aria-label="Отчёты миссий">
      <h1>
        Отчёты миссий{' '}
        <InfoHint label="Что скачивать">
          Маршруты — индивидуальные KML/GeoJSON каждого назначенного БВС.
          Доказательства ZIP — вход, маршруты, проверки и журнал выбранного
          запуска с инструкцией. Выполнение проходов и покрытие территории —
          разные показатели.
        </InfoHint>
      </h1>
      <div className="demo-table-scroll">
        <table>
          <thead>
            <tr>
              {[
                '№',
                'Миссия',
                'Результат',
                'БВС / работы',
                'Отчёт',
                'Проверки',
                'Маршруты',
                'Доказательства',
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.documents.map((d, i) => {
              const row = p.rows.find((r) => r.document.id === d.id),
                result = p.results[d.id];
              const c =
                row?.candidate ??
                (p.selections?.[d.id] === 'balanced'
                  ? result?.recommendation?.candidate
                  : result?.candidates.find(
                      (c) => c.id === p.selections?.[d.id],
                    )) ??
                result?.candidates[0];
              const fails =
                  c?.checks.filter((x) => x.status === 'fail').length ?? 0,
                unknown =
                  c?.checks.filter((x) => x.status === 'unknown').length ?? 0;
              return (
                <tr key={d.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{d.name.replace(/^Демо \d+ · /, '')}</strong>
                    {result && !row && result.document !== d && (
                      <small>Вход изменён после расчёта</small>
                    )}
                  </td>
                  <td>
                    <span className={`demo-status ${row?.status ?? ''}`}>
                      {row
                        ? operationLabel(row)
                        : c
                          ? c.status === 'feasible_model'
                            ? 'План рассчитан'
                            : 'Нужны изменения'
                          : 'Нет расчёта'}
                    </span>
                    {row && <small>Проходы: {demoCompletion(row)}%</small>}
                    {c && (
                      <small>
                        Покрытие:{' '}
                        {c.metrics.coveragePct.toLocaleString('ru-RU', {
                          maximumFractionDigits: 3,
                        })}
                        %
                      </small>
                    )}
                  </td>
                  <td>
                    {c?.metrics.vehicleCount ?? '—'} /{' '}
                    {(row?.document ?? result?.document ?? d).jobs.length}
                  </td>
                  <td>
                    <button
                      className="mw-button small"
                      disabled={p.busy || !c}
                      onClick={() => p.onDownload(d.id, 'view')}
                      aria-label={`Открыть отчёт: ${d.name}`}
                    >
                      Открыть отчёт
                    </button>
                    <details className="report-other-files">
                      <summary>Другие файлы</summary>
                      <button
                        className="mw-button small"
                        disabled={p.busy || !c}
                        onClick={() => p.onDownload(d.id, 'report')}
                      >
                        Отчёт HTML
                      </button>
                      <button
                        className="mw-button small"
                        disabled={p.busy || !c}
                        onClick={() => p.onDownload(d.id, 'checks')}
                      >
                        Проверки JSON
                      </button>
                      <button
                        className="mw-button small"
                        disabled={
                          !row ||
                          !canDownloadRecording(
                            p.recordings?.[row.id],
                            p.busy,
                          )
                        }
                        title={row ? p.recordings?.[row.id]?.error : undefined}
                        onClick={() => p.onDownload(d.id, 'video')}
                      >
                        Видео MP4
                      </button>
                    </details>
                  </td>
                  <td>
                    {c && (
                      <span
                        className={`report-check-status ${fails ? 'failed' : ''}`}
                      >
                        {fails
                          ? `Не пройдено: ${fails}`
                          : unknown
                            ? `Модель · ограничений проверки: ${unknown}`
                            : 'Модель: проверки пройдены'}
                      </span>
                    )}
                    <button
                      className="mw-button small"
                      disabled={p.busy || !c}
                      aria-label={`Все проверки: ${d.name}`}
                      onClick={() => p.onOpenChecks(d.id)}
                    >
                      Все проверки
                    </button>
                  </td>
                  <td>
                    <details className="report-route-files">
                      <summary>Скачать маршруты</summary>
                      {(['kml', 'geojson'] as const).map((kind) => (
                        <button
                          key={kind}
                          className="mw-button small"
                          disabled={p.busy || c?.status !== 'feasible_model'}
                          onClick={() => p.onDownload(d.id, kind)}
                          aria-label={`Маршруты ${kind.toUpperCase()}: ${d.name}`}
                        >
                          {kind.toUpperCase()} · по БВС
                        </button>
                      ))}
                    </details>
                  </td>
                  <td>
                    <button
                      className="mw-button small primary"
                      disabled={p.busy || !c}
                      onClick={() => p.onDownload(d.id, 'evidence')}
                      aria-label={`Скачать доказательства: ${d.name}`}
                    >
                      {c && c.status !== 'feasible_model'
                        ? 'Диагностика ZIP'
                        : 'Доказательства ZIP'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
