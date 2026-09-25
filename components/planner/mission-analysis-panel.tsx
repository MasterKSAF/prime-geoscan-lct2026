'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FlaskConical, LoaderCircle } from 'lucide-react';
import type {
  MissionDocument,
  MissionCandidate,
  MissionResult,
} from '@/lib/planner/mission-schema';
import { sha256 } from '@/lib/planner/mission-schema';
import {
  explainMissionPlan,
  missionImprovementTrials,
  compareMissionTrial,
} from '@/lib/planner/mission-insights';
import type { MissionTrial } from '@/lib/planner/mission-insights';
import {
  missionCoverageViews,
  coverageGeoJSON,
} from '@/lib/planner/mission-coverage-view';
import type { CoverageView } from '@/lib/planner/mission-coverage-view';
import type { Multi } from '@/lib/planner/geometry';
import type { MissionRobustnessReport } from '@/lib/planner/mission-robustness';
import { missionEvidence } from '@/lib/planner/mission-export';
import { prepareRemainingMission } from '@/lib/planner/mission-remaining-work';
import type { RemainingMissionDraft } from '@/lib/planner/mission-remaining-work';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import type { FleetState } from '@/lib/planner/mission-fleet-state';
import { InfoHint } from './mission-help';
import { MissionCheckDetails } from './mission-check-details';
import { shortMissionVerdict } from '@/lib/planner/mission-check-copy';

const number = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const signedMinutes = (v: number | null) =>
  v === null ? '—' : `${v > 0 ? '+' : ''}${number(v / 60)} мин`;
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CoverageTile({ view }: { view: CoverageView }) {
  const points = view.requested.flat(2),
    minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1])),
    maxY = Math.max(...points.map((p) => p[1])),
    scale = Math.min(
      280 / Math.max(1, maxX - minX),
      160 / Math.max(1, maxY - minY),
    );
  const path = (multi: Multi) =>
    multi
      .flatMap((polygon) =>
        polygon.map(
          (ring) =>
            ring
              .map(
                ([x, y], i) =>
                  `${i ? 'L' : 'M'}${(20 + (x - minX) * scale).toFixed(2)},${(20 + (maxY - y) * scale).toFixed(2)}`,
              )
              .join(' ') + ' Z',
        ),
      )
      .join(' ');
  return (
    <article className="mi-coverage-card">
      <strong>{view.name}</strong>
      {view.status === 'calculated' ? (
        <>
          <svg
            viewBox="0 0 320 200"
            aria-label={`Расчётное покрытие: ${view.name}`}
          >
            <title>{`Расчётное покрытие: ${view.name}`}</title>
            <path
              d={path(view.requested)}
              fill="var(--mw-surface-soft)"
              stroke="var(--mw-muted)"
              fillRule="evenodd"
            />
            <path
              d={path(view.covered)}
              fill="var(--mw-accent)"
              fillOpacity="0.55"
              fillRule="evenodd"
            />
            <path
              d={path(view.missing)}
              fill="var(--mw-warning)"
              fillOpacity="0.5"
              fillRule="evenodd"
            />
          </svg>
          <span>
            Покрыто {number(view.coveredM2 / 10000)} га · пропуски{' '}
            {number(view.missingM2 / 10000)} га
          </span>
        </>
      ) : (
        <p>Геометрия не проверена</p>
      )}
      <small>
        {view.qualityStatus === 'fail'
          ? 'Параметры качества нарушены'
          : view.qualityStatus === 'unknown'
            ? 'Качество оценено с допущениями'
            : 'Качество проверено в модели'}
      </small>
      {view.details.length > 0 && (
        <details>
          <summary>Допущения и ограничения</summary>
          <ul>
            {view.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

export default function MissionAnalysisPanel({
  document,
  candidate,
  onOpenTrial,
  operation,
  getFleet,
  compact = false,
}: {
  document: MissionDocument;
  candidate: MissionCandidate;
  onOpenTrial: (document: MissionDocument, label: string) => void;
  operation: MissionOperation | null;
  getFleet: () => Promise<FleetState[]>;
  compact?: boolean;
}) {
  const explanations = useMemo(
    () => explainMissionPlan(document, candidate),
    [document, candidate],
  );
  const trials = useMemo(
    () => missionImprovementTrials(document, candidate),
    [document, candidate],
  );
  const [coverage, setCoverage] = useState<CoverageView[] | null>(null);
  const [report, setReport] = useState<MissionRobustnessReport | null>(null);
  const [received, setReceived] = useState(false);
  const [remaining, setRemaining] = useState<RemainingMissionDraft | null>(
    null,
  );
  const [trialResults, setTrialResults] = useState<
    Record<string, { result: MissionResult; candidate: MissionCandidate }>
  >({});
  const [acknowledgedTrials, setAcknowledgedTrials] = useState<
    Record<string, boolean>
  >({});
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function runAnalysis() {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy('robustness');
    setError('');
    try {
      const response = await fetch('/api/planner/missions/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(document.obstacleLayer || document.catalogLayers
            ? { 'x-prime-obstacles': '1' }
            : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({ document, candidate }),
      });
      const data = (await response.json()) as MissionRobustnessReport & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || 'Не удалось проверить устойчивость.');
      if (
        data.type !== 'prime-mission-robustness' ||
        !Array.isArray(data.cases) ||
        !data.baseline ||
        data.inputHash !== (await sha256(document)) ||
        data.planHash !== (await sha256(candidate))
      )
        throw new Error('Отчёт относится к другому входу или плану.');
      if (!controller.signal.aborted) setReport(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Ошибка анализа.');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }
  async function runTrial(trial: MissionTrial) {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(trial.id);
    setError('');
    try {
      const response = await fetch(
        trial.document.obstacleLayer || trial.document.catalogLayers
          ? '/api/planner/missions/solve-with-obstacles'
          : '/api/planner/missions/solve',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(trial.document),
        },
      );
      const data = (await response.json()) as MissionResult & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || 'Проверочный расчёт не выполнен.');
      if (data.inputHash !== (await sha256(trial.document)))
        throw new Error('Ответ относится к другому миссии.');
      const selected =
        (candidate.id === 'balanced'
          ? data.recommendation?.candidate
          : undefined) ??
        data.candidates.find((c) => c.objective === candidate.objective);
      if (!selected)
        throw new Error('В ответе нет варианта с исходной целью оптимизации.');
      if (!controller.signal.aborted)
        setTrialResults((old) => ({
          ...old,
          [trial.id]: { result: data, candidate: selected },
        }));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Ошибка расчёта.');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  async function prepareRemaining() {
    if (!operation || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy('remaining');
    setError('');
    setRemaining(null);
    try {
      if (
        operation.inputHash !== (await sha256(document)) ||
        operation.planHash !== (await sha256(candidate))
      )
        throw new Error(
          'Выбранный план не соответствует завершённому выполнению. Откройте его снимок из истории.',
        );
      const next = await prepareRemainingMission(
        operation,
        { acknowledgedData: received },
        await getFleet(),
      );
      if (!controller.signal.aborted) setRemaining(next);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'Не удалось выделить остаток.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  return (
    <section
      className="mi-panel"
      aria-label="Анализ решения"
      data-compact={compact}
    >
      <header hidden={compact}>
        <FlaskConical size={19} />
        <h2>Подробности плана</h2>
        <InfoHint label="Что проверяет анализ решения">
          Проверки ниже не изменяют миссию. Откройте нужный раздел.
        </InfoHint>
      </header>
      <details className="mi-section">
        <summary>Какие БВС выбраны и почему</summary>
        <div className="mi-cards">
          {explanations.map((v) => (
            <article key={v.vehicleId}>
              <h3>{v.name}</h3>
              <span className="mi-status">
                {v.assigned ? 'Назначен' : 'Не задействован'}
              </span>
              <p>
                Заряд {number(v.batteryPct)}%
                {v.assigned
                  ? ` · ${v.sortieCount} вылетов · ${number(v.flightTimeSec / 60)} мин налёта`
                  : ''}
              </p>
              {v.minimumRemainingPct !== null && (
                <p>
                  Наименьший заряд при посадке: {number(v.minimumRemainingPct)}%
                </p>
              )}
              <ul>
                {v.jobs.map((j) => (
                  <li key={j.jobId}>
                    <strong>{j.name}.</strong> {j.message}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </details>
      <details className="mi-section">
        <summary>
          <span>Если изменятся ветер, время или заряд</span>
          <InfoHint label="Как проверяется устойчивость">
            Тот же маршрут: ветер +2 м/с, направление +45°, старт позже на 5
            минут, заряд ниже на 10 п.п. Проверки раздельные, не прогноз
            вероятности успеха.
          </InfoHint>
        </summary>
        <div className="mw-actions">
          <button
            className="mw-button"
            disabled={!!busy}
            onClick={() => void runAnalysis()}
          >
            {busy === 'robustness' && (
              <LoaderCircle size={14} className="animate-spin" />
            )}
            Проверить устойчивость
          </button>
          {report && (
            <button
              className="mw-button"
              onClick={() =>
                download(`${document.id}.robustness.json`, {
                  type: 'prime-mission-robustness-bundle',
                  schemaVersion: '1.0',
                  document,
                  candidate,
                  report,
                })
              }
            >
              <Download size={14} />
              Отчёт устойчивости
            </button>
          )}
        </div>
        {report && (
          <div className="mi-stress-results" aria-live="polite">
            <p>
              Исходный план:{' '}
              {report.baseline.status === 'verified'
                ? 'перепроверен'
                : report.baseline.status === 'rejected'
                  ? 'не прошёл проверку'
                  : 'не проверен'}
            </p>
            {report.cases.map((c) => (
              <article key={c.id} className={`mi-case ${c.status}`}>
                <strong>{c.label}</strong>
                <span className="mi-status">
                  {c.status === 'safe'
                    ? 'Пройдено в модели'
                    : c.status === 'unsafe_in_model'
                      ? 'Ограничения нарушены'
                      : 'Не проверено'}
                </span>
                {c.detail && (
                  <details>
                    <summary>Подробности расчёта</summary>
                    <p>{c.detail}</p>
                  </details>
                )}
                {c.metrics && (
                  <p>
                    До завершения {number(c.metrics.makespanSec / 60)} мин ·
                    мин. остаток {number(c.metrics.minRemainingPct)}%
                  </p>
                )}
                {c.failedChecks.length > 0 && (
                  <details>
                    <summary>Что мешает: {c.failedChecks.length}</summary>
                    {c.failedChecks.map((check, i) => (
                      <MissionCheckDetails
                        key={`${check.id}-${i}`}
                        check={check}
                      />
                    ))}
                  </details>
                )}
                {c.unknownChecks.length > 0 && (
                  <details>
                    <summary>Условия модели: {c.unknownChecks.length}</summary>
                    {c.unknownChecks.map((check, i) => (
                      <MissionCheckDetails
                        key={`${check.id}-${i}`}
                        check={check}
                      />
                    ))}
                  </details>
                )}
              </article>
            ))}
            <details>
              <summary>Границы проверки</summary>
              <ul>
                {report.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </details>
      {trials.length > 0 &&
        (!compact || candidate.status !== 'feasible_model') && (
          <details
            className="mi-section mi-repairs"
            open={compact || undefined}
          >
            <summary>
              <span>
                {trials[0].kind === 'repair'
                  ? 'Что изменить, чтобы выполнить миссию'
                  : 'Можно ли обойтись меньшим числом БВС'}
              </span>
              <InfoHint label="Как проверяются варианты изменений">
                Каждый вариант рассчитывается отдельно. Изменения можно открыть
                в редакторе после проверки — автоматически они не применяются.
              </InfoHint>
            </summary>
            <div className="mi-cards">
              {(compact ? trials.slice(0, 3) : trials).map((trial) => {
                const outcome = trialResults[trial.id],
                  comparison =
                    outcome &&
                    compareMissionTrial(candidate, outcome.candidate);
                return (
                  <article key={trial.id}>
                    <h3>{trial.title}</h3>
                    <details open={compact || undefined}>
                      <summary>Что изменится</summary>
                      <p>{trial.change}</p>
                    </details>
                    {trial.confirmation && (
                      <details>
                        <summary>Условия применения</summary>
                        <ul>
                          {trial.confirmation.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <button
                      className="mw-button"
                      disabled={!!busy}
                      onClick={() => void runTrial(trial)}
                    >
                      {busy === trial.id && (
                        <LoaderCircle size={14} className="animate-spin" />
                      )}
                      Проверить вариант
                    </button>
                    {outcome && comparison && (
                      <div aria-live="polite">
                        <p>
                          {comparison.feasible
                            ? 'С этими изменениями миссию можно выполнить в модели.'
                            : shortMissionVerdict(outcome.candidate).reason}
                        </p>
                        {comparison.comparable && (
                          <p>
                            Разница: завершение{' '}
                            {signedMinutes(comparison.makespanDeltaSec)} · налёт{' '}
                            {signedMinutes(comparison.flightTimeDeltaSec)}.
                          </p>
                        )}
                        {!comparison.feasible && (
                          <details>
                            <summary>Все проверки варианта</summary>
                            {outcome.candidate.checks.map((c, i) => (
                              <MissionCheckDetails
                                key={`${c.id}:${i}`}
                                check={c}
                              />
                            ))}
                          </details>
                        )}
                        <div className="mw-actions">
                          <button
                            className="mw-button small"
                            onClick={() =>
                              void Promise.all([
                                sha256(document),
                                sha256(candidate),
                                sha256(outcome.candidate),
                              ])
                                .then(
                                  ([
                                    inputHash,
                                    planHash,
                                    alternativePlanHash,
                                  ]) =>
                                    download(
                                      `${document.id}.${trial.id}.json`,
                                      {
                                        type: 'prime-mission-counterfactual',
                                        schemaVersion: '1.0',
                                        change: trial.change,
                                        hypothetical: true,
                                        confirmationRequired:
                                          trial.confirmation ?? [],
                                        comparison,
                                        original: {
                                          document,
                                          candidate,
                                          inputHash,
                                          planHash,
                                        },
                                        alternative: outcome.result,
                                        alternativePlanHash,
                                        warning:
                                          'Сравнение при явном изменении условий; не статистика эффективности алгоритма и не глобальный оптимум.',
                                      },
                                    ),
                                )
                                .catch((e) => setError(String(e)))
                            }
                          >
                            Скачать сравнение
                          </button>
                          <button
                            className="mw-button small"
                            onClick={() =>
                              void missionEvidence(
                                outcome.result,
                                outcome.candidate,
                              )
                                .then((evidence) =>
                                  download(
                                    `${document.id}.${trial.id}.evidence.json`,
                                    evidence,
                                  ),
                                )
                                .catch((e) => setError(String(e)))
                            }
                          >
                            Доказательства варианта
                          </button>
                          {comparison.feasible && trial.confirmation && (
                            <label className="mi-confirm">
                              <input
                                type="checkbox"
                                checked={!!acknowledgedTrials[trial.id]}
                                onChange={(e) =>
                                  setAcknowledgedTrials((old) => ({
                                    ...old,
                                    [trial.id]: e.target.checked,
                                  }))
                                }
                              />
                              Проверю условия перед применением изменений.
                            </label>
                          )}
                          {comparison.feasible && (
                            <button
                              className="mw-button small"
                              disabled={
                                !!trial.confirmation &&
                                !acknowledgedTrials[trial.id]
                              }
                              onClick={() =>
                                onOpenTrial(
                                  {
                                    ...structuredClone(trial.document),
                                    id: `mission-${crypto.randomUUID()}`,
                                  },
                                  `Копия: ${trial.title}`,
                                )
                              }
                            >
                              Открыть исправленную миссию
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </details>
        )}
      <details className="mi-section">
        <summary>
          <span>Какая территория будет отснята</span>
          <InfoHint label="Как читать расчётное покрытие">
            Синий — планируемая съёмка; янтарный — пропуски. Это расчёт, а не
            реальные снимки.
          </InfoHint>
        </summary>
        <div className="mw-actions">
          <button
            className="mw-button"
            onClick={() =>
              setCoverage(missionCoverageViews(document, candidate))
            }
          >
            Показать покрытие
          </button>
          {coverage && (
            <button
              className="mw-button"
              onClick={() =>
                void Promise.all([sha256(document), sha256(candidate)]).then(
                  ([inputHash, planHash]) => {
                    const data = coverageGeoJSON(document, coverage);
                    download(`${document.id}.coverage.geojson`, {
                      ...data,
                      properties: { ...data.properties, inputHash, planHash },
                    });
                  },
                )
              }
            >
              Скачать слой GeoJSON
            </button>
          )}
        </div>
        {coverage && (
          <div className="mi-cards">
            {coverage.map((view) => (
              <CoverageTile key={view.jobId} view={view} />
            ))}
          </div>
        )}
      </details>
      {operation?.status === 'cancelled' &&
        operation.safety?.stage === 'landed' && (
          <details className="mi-section">
            <summary>
              <span>Как завершить прерванную миссию</span>
              <InfoHint label="Как составляется остаток миссии">
                Создаётся новая миссия. Вычитаются только полностью законченные
                проходы до события. Дата — по модельным часам исходной миссии;
                срок не продлевается. Пригодность полученных данных подтверждает
                оператор.
              </InfoHint>
            </summary>
            <label className="mi-confirm">
              <input
                type="checkbox"
                checked={received}
                onChange={(e) => {
                  setReceived(e.target.checked);
                  setRemaining(null);
                }}
              />
              Данные выполненной части получены и пригодны для использования.
            </label>
            <div className="mw-actions">
              <button
                className="mw-button"
                disabled={!!busy || !received}
                onClick={() => void prepareRemaining()}
              >
                Подготовить оставшиеся участки
              </button>
            </div>
            {remaining && (
              <div aria-live="polite">
                <p>
                  Новая миссия: {remaining.document.jobs.length} участков ·{' '}
                  {number(
                    remaining.coverage.reduce((n, v) => n + v.missingM2, 0) /
                      10000,
                  )}{' '}
                  га осталось.
                </p>
                <details>
                  <summary>Что перенесено и что проверить</summary>
                  <ul>
                    {remaining.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </details>
                <div className="mw-actions">
                  <button
                    className="mw-button"
                    onClick={() =>
                      onOpenTrial(
                        remaining.document,
                        'Оставшиеся участки — новый черновик',
                      )
                    }
                  >
                    Открыть остаток в редакторе
                  </button>
                  <button
                    className="mw-button"
                    onClick={() =>
                      download(`${document.id}.remaining-work.json`, remaining)
                    }
                  >
                    Скачать обоснование остатка
                  </button>
                </div>
              </div>
            )}
          </details>
        )}
      {error && (
        <p role="alert" className="mi-error">
          {error}
        </p>
      )}
    </section>
  );
}
