'use client';
import type {
  MissionDocument,
  MissionResult,
} from '@/lib/planner/mission-schema';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import { demoCompletion } from '@/lib/planner/demo-session';
import type { RecordingInfo } from '@/hooks/use-mission-recordings';
import { operationLabel } from './mission-execution-queue';
export type DemoDownload = 'report' | 'checks' | 'evidence' | 'video' | 'view';
export default function DemoReportTable({
  documents,
  results,
  rows,
  busy,
  onDownload,
  recordings = {},
  selections = {},
  onOpenChecks,
}: {
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
    <section className="demo-reports" aria-label="Отчёты трёх миссий">
      <h1>Отчёты миссий</h1>
      <div className="demo-table-scroll">
        <table>
          <thead>
            <tr>
              {[
                '№',
                'Миссия',
                'Статус',
                'Выполнение',
                'БВС',
                'Работы',
                'Отчёт',
                'Проверки плана',
                'Скачать проверки',
                'Доказательства',
                'Видео',
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((d, i) => {
              const row = rows.find((r) => r.document.id === d.id),
                result = results[d.id],
                c =
                  row?.candidate ??
                  (selections[d.id] === 'balanced'
                    ? result?.recommendation?.candidate
                    : result?.candidates.find(
                        (c) => c.id === selections[d.id],
                      )) ??
                  result?.candidates[0];
              const status = row
                ? operationLabel(row)
                : c
                  ? c.status === 'feasible_model'
                    ? 'План рассчитан'
                    : 'Нужны изменения'
                  : 'Нет расчёта';
              return (
                <tr key={d.id}>
                  <td>{i + 1}</td>
                  <td>
                    {d.name.replace(/^Демо \d+ · /, '')}
                    {result && (
                      <small className="report-calculated-at">
                        Расчёт{' '}
                        {new Date(result.createdAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    )}
                    {result && !row && result.document !== d && (
                      <small className="report-calculated-at">
                        Миссия изменена после расчёта
                      </small>
                    )}
                  </td>
                  <td>
                    <span className={`demo-status ${row?.status ?? ''}`}>
                      {status}
                    </span>
                  </td>
                  <td>
                    <progress value={demoCompletion(row)} max={100} />
                    <span>{demoCompletion(row)}%</span>
                  </td>
                  <td>{c?.metrics.vehicleCount ?? '—'}</td>
                  <td>
                    {(row?.document ?? result?.document ?? d).jobs.length}
                  </td>
                  <td>
                    <button
                      className="mw-button small"
                      disabled={busy || !c}
                      aria-label={`Открыть отчёт: ${d.name}`}
                      onClick={() => onDownload(d.id, 'view')}
                    >
                      Открыть
                    </button>
                    <button
                      className="mw-button small quiet"
                      disabled={busy || !c}
                      aria-label={`Скачать отчёт: ${d.name}`}
                      onClick={() => onDownload(d.id, 'report')}
                    >
                      HTML
                    </button>
                  </td>
                  <td>
                    {c && (
                      <span
                        className={`report-check-status ${c.checks.some((x) => x.status === 'fail') ? 'failed' : 'passed'}`}
                      >
                        {c.checks.some((x) => x.status === 'fail')
                          ? `Не пройдено: ${c.checks.filter((x) => x.status === 'fail').length}`
                          : 'Ошибок нет'}
                      </span>
                    )}
                    <button
                      className="mw-button small"
                      disabled={busy || !c}
                      aria-label={`Все проверки: ${d.name}`}
                      onClick={() => onOpenChecks(d.id)}
                    >
                      Все проверки
                    </button>
                  </td>
                  {(['checks', 'evidence'] as const).map((kind, k) => (
                    <td key={kind}>
                      <button
                        className="mw-button small"
                        disabled={busy || !c}
                        onClick={() => onDownload(d.id, kind)}
                        aria-label={`${['Скачать проверки плана', 'Скачать доказательства'][k]}: ${d.name}`}
                      >
                        {['JSON', 'ZIP'][k]}
                      </button>
                    </td>
                  ))}
                  <td>
                    <button
                      className="mw-button small"
                      disabled={
                        !row ||
                        !recordings[row.id]?.bytes ||
                        ['recording', 'converting'].includes(
                          recordings[row.id].status,
                        )
                      }
                      title={
                        row
                          ? (recordings[row.id]?.error ??
                            'Видео выполнения этого запуска')
                          : 'Появится после выполнения'
                      }
                      aria-label={`Скачать видео MP4: ${d.name}`}
                      onClick={() => onDownload(d.id, 'video')}
                    >
                      {row && recordings[row.id]?.status === 'recording'
                        ? 'Запись…'
                        : row && recordings[row.id]?.status === 'converting'
                          ? 'Готовим…'
                          : 'MP4'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <small>
        HTML — отчёт · JSON — проверки · ZIP — исходники, маршруты и журнал ·
        MP4 — запись симуляции.
      </small>
    </section>
  );
}
