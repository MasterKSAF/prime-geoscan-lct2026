'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import type {
  MissionCandidate,
  MissionDocument,
} from '@/lib/planner/mission-schema';
import {
  buildMissionDeliveryManifest,
  describeMissionDelivery,
} from '@/lib/planner/mission-delivery-manifest';
import { InfoHint } from './mission-help';

/** Compact result disclosure; does not update the fleet or acknowledge received imagery. */
export default function MissionDataSummary({
  document,
  candidate,
  completed = false,
}: {
  document: MissionDocument;
  candidate: MissionCandidate;
  completed?: boolean;
}) {
  const summary = describeMissionDelivery(document, candidate, completed);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function downloadManifest() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const manifest = await buildMissionDeliveryManifest(
        document,
        candidate,
        completed,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(manifest, null, 2)], {
          type: 'application/json;charset=utf-8',
        }),
      );
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `${document.id}.delivery-manifest.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скачать манифест.');
    } finally {
      setBusy(false);
    }
  }
  const number = (n: number) =>
    n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return (
    <section
      className="ms-safety-summary"
      aria-label="Данные и батареи после миссии"
    >
      <div className="ms-safety-heading">
        <strong>
          {summary.modelSessionCompleted
            ? 'После симуляции'
            : 'Ожидаемый результат'}
          <InfoHint label="Что содержит результат миссии">
            Манифест описывает ожидаемые материалы и расчётные остатки батарей.
            Стенд не создаёт и не копирует реальные снимки. Число срабатываний
            камеры не подтверждает получение файлов; приёмка реальных данных
            выполняется отдельно.
          </InfoHint>
        </strong>
        <button
          type="button"
          className="mw-button"
          disabled={busy}
          onClick={() => void downloadManifest()}
        >
          <Download size={14} /> Манифест JSON
        </button>
      </div>
      <p className="mw-caption">Реальные файлы не получены.</p>
      <details>
        <summary>Работы и ожидаемые материалы · {summary.jobs.length}</summary>
        <ul>
          {summary.jobs.map((job) => (
            <li key={job.jobId}>
              <strong>{job.name}</strong>: {job.expectedMaterial}.
              {job.expectedCaptureEvents !== null && (
                <>
                  {' '}
                  План: {number(job.expectedCaptureEvents)} срабатываний камеры.
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>
          <span>Расчётные остатки батарей</span>
          <InfoHint label="Как читать остатки батарей">
            Оценка по плану, не свежая телеметрия и не подтверждение замены
            батареи. Значения относятся ко всем запланированным вылетам.
          </InfoHint>
        </summary>
        <ul>
          {summary.vehicles.map((v) => (
            <li key={v.vehicleId}>
              <strong>{v.name}</strong>: {number(v.initialChargePct)}% →{' '}
              {number(v.projectedFinalChargePct)}%
              {v.usedInPlan
                ? ' · после всех запланированных вылетов'
                : ' · не назначен'}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Как принять реальные данные</summary>
        <ol>
          {summary.handoverChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
