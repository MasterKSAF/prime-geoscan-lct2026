'use client';
import { useState } from 'react';
import type {
  MissionDocument,
  MissionCandidate,
} from '@/lib/planner/mission-schema';
import type { MissionContingencyCertificate } from '@/lib/planner/mission-contingency';
import { InfoHint } from './mission-help';

export default function MissionContingencyPanel({
  document,
  candidate,
}: {
  document: MissionDocument;
  candidate: MissionCandidate;
}) {
  const [report, setReport] = useState<MissionContingencyCertificate | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function check() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/planner/missions/contingency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(document.obstacleLayer || document.catalogLayers ? { 'x-prime-obstacles': '1' } : {}),
        },
        body: JSON.stringify({ document, candidate }),
      });
      const result =
        (await response.json()) as MissionContingencyCertificate & {
          error?: string;
        };
      if (!response.ok) throw Error(result.error ?? 'Проверка не выполнена');
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Проверка не выполнена');
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              type: 'prime-mission-contingency',
              schemaVersion: '1.0',
              document,
              candidate,
              certificate: report,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.id}.contingency.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="mw-details" aria-label="Предполётная проверка ухода">
      <summary>
        <span>Возврат из любой части маршрута</span>
        {report
          ? ` · ${report.status === 'certified_model' ? 'проверен в модели' : 'есть ограничения'}`
          : ''}
        <InfoHint label="Условия проверки возврата">
          Можно ли прервать работу и вернуться, пока остальные БВС продолжают
          полёт. Проверяется исправный аппарат при заданном ветре.
        </InfoHint>
      </summary>
      <button
        className="mw-button"
        disabled={busy || candidate.status !== 'feasible_model'}
        onClick={() => void check()}
      >
        {busy ? 'Проверяем пути…' : 'Проверить возврат'}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <output>
            Возврат проверен в {report.certifiedAnchors} из {report.anchorCount}{' '}
            точек маршрута.
          </output>
          <p>
            До начала возврата: не более {report.maxResponseDelaySec.toFixed(1)}{' '}
            с. Минимальный остаток при посадке:{' '}
            {report.minimumRemainingPct?.toFixed(1) ?? '—'}%.
          </p>
          <details>
            <summary>Подробности проверки</summary>
            <p>
              Проверено: {report.checkedAnchors}. Отдельный путь:{' '}
              {report.independentAnchors}; по исходному маршруту:{' '}
              {report.plannedCorridorAnchors}.
            </p>
            {report.reasons.map((reason, i) => (
              <p key={i}>{reason}</p>
            ))}
          </details>
          <button className="mw-button" onClick={download}>
            Скачать проверку возврата
          </button>
          <details>
            <summary>Границы проверки</summary>
            <ul>
              {report.assumptions.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </details>
  );
}
