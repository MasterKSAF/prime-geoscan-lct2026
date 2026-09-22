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
        headers: { 'Content-Type': 'application/json', ...(document.obstacleLayer ? { 'x-prime-obstacles': '1' } : {}) },
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
          ? ` · ${report.status === 'certified_model' ? 'проверен в модели' : 'не подтверждён полностью'}`
          : ''}
        <InfoHint label="Условия проверки возврата">
          Проверка управляемого прекращения работы при исходном ветре и
          исправном БВС. Остальная группа продолжает свои полёты. Внезапная
          потеря тяги или изменение условий требуют отдельной реакции. Результат
          относится только к проверенным интервалам и условиям отчёта.
        </InfoHint>
      </summary>
      <button
        className="mw-button"
        disabled={busy || candidate.status !== 'feasible_model'}
        onClick={() => void check()}
      >
        {busy ? 'Проверяем пути…' : 'Проверить уход по всему маршруту'}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <output>
            Проверено интервалов: {report.checkedAnchors}/{report.anchorCount}.
            Подтверждено: {report.certifiedAnchors}. Отдельный выход:{' '}
            {report.independentAnchors}; по исходному коридору без съёмки:{' '}
            {report.plannedCorridorAnchors}.
          </output>
          <p>
            До опорной точки выхода: не более{' '}
            {report.maxResponseDelaySec.toFixed(1)} с. Минимальный остаток при
            посадке: {report.minimumRemainingPct?.toFixed(1) ?? '—'}%.
          </p>
          {report.reasons.map((reason, i) => (
            <p key={i}>{reason}</p>
          ))}
          <button className="mw-button" onClick={download}>
            Отчёт ухода JSON
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
