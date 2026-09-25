'use client';
import {
  Download,
  CheckCircle2,
  TriangleAlert,
  CircleHelp,
} from 'lucide-react';
import type {
  MissionCandidate,
  MissionDocument,
} from '@/lib/planner/mission-schema';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import { groupMissionChecks } from '@/lib/planner/mission-presentation';
import { InfoHint } from './mission-help';

export default function MissionExpertReport({
  document,
  candidate,
  operation,
  busy,
  onDownload,
  onDetails,
}: {
  document: MissionDocument;
  candidate: MissionCandidate;
  operation?: MissionOperation | null;
  busy: boolean;
  onDownload: () => void;
  onDetails: () => void;
}) {
  const summary = groupMissionChecks(candidate.checks);
  const statuses = {
    pass: 'Пройдено',
    fail: 'Нарушение',
    unknown: 'Не подтверждено',
  };
  return (
    <section className="expert-report" aria-label="Отчёт для проверки">
      <header>
        <div>
          <span className="expert-eyebrow">Отчёт миссии</span>
          <h1>{document.name}</h1>
          <p>
            {operation
              ? operation.status === 'completed'
                ? 'Выполнение завершено в модели'
                : operation.status === 'cancelled'
                  ? 'Выполнение остановлено'
                  : 'Выполнение ещё не завершено'
              : 'Расчёт готов · выполнение не запускалось'}
          </p>
        </div>
        <button
          className="mw-button primary"
          disabled={busy}
          onClick={onDownload}
        >
          <Download size={17} />
          {busy ? 'Проверка и сборка…' : 'Скачать доказательства ZIP'}
        </button>
      </header>
      <div className="expert-metrics">
        <div>
          <strong>{Math.round(candidate.metrics.coveragePct)}%</strong>
          <span>Покрытие по плану</span>
        </div>
        <div>
          <strong>
            {(candidate.metrics.makespanSec / 60).toLocaleString('ru-RU', {
              maximumFractionDigits: 1,
            })}{' '}
            мин
          </strong>
          <span>Длительность плана</span>
        </div>
        <div>
          <strong>{candidate.metrics.vehicleCount}</strong>
          <span>БВС назначено</span>
        </div>
      </div>
      <div className="expert-check-heading">
        <h2>Проверки плана</h2>
        <InfoHint label="Что подтверждают проверки">
          Это модельные проверки, не разрешение на реальный полёт. Полнота
          выполнения определяется журналом выбранного запуска, а не процентом
          покрытия плана. Неизвестные параметры не считаются пройденными
          проверками. При выгрузке выполняется повторная проверка; расхождения
          блокируют архив проверенного плана.
        </InfoHint>
      </div>
      <div className="expert-check-list">
        {summary.groups.map((group) => (
          <details key={group.id} data-status={group.status}>
            <summary>
              <span>{group.title}</span>
              <span className={`expert-check-status ${group.status}`}>
                {group.status === 'pass' ? (
                  <CheckCircle2 size={16} />
                ) : group.status === 'fail' ? (
                  <TriangleAlert size={16} />
                ) : (
                  <CircleHelp size={16} />
                )}
                {statuses[group.status]}
              </span>
            </summary>
            {group.checks.length ? (
              group.checks.map((check, i) => (
                <article key={`${check.id}-${i}`}>
                  <strong>{check.title}</strong>
                  <span className={`expert-check-status ${check.status}`}>
                    {statuses[check.status]}
                  </span>
                  <p>{check.detail}</p>
                  <small>
                    Подтверждение: data/checks/validation.json · {check.id}
                  </small>
                </article>
              ))
            ) : (
              <p>Проверки этой категории отсутствуют.</p>
            )}
          </details>
        ))}
      </div>
      <footer>
        <span>
          {summary.counts.pass} пройдено · {summary.counts.fail} нарушений ·{' '}
          {summary.counts.unknown} не подтверждено
        </span>
        <button className="mw-button small" onClick={onDetails}>
          Подробный анализ
        </button>
      </footer>
      <details className="expert-archive-info">
        <summary>Что внутри архива</summary>
        <p>
          Исходная миссия, план, маршруты, условия расчёта, проверки и
          контрольные суммы. Если есть запуск — его журнал и отчёт. Реальные
          снимки и бортовая телеметрия в симуляции не создаются.
        </p>
        <code>{operation?.id ?? document.id}</code>
        <p>
          Для невыполнимого варианта выгружается диагностика, а не подтверждение
          успешного выполнения.
        </p>
      </details>
    </section>
  );
}
