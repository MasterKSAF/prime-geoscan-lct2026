'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import type { MissionOperation } from '@/lib/planner/mission-operations';
import { operationJournal } from '@/lib/planner/mission-operation-journal';
import { vehicleDisplayName } from '@/lib/planner/mission-vehicle-label';
import { InfoHint } from './mission-help';
import { expertEventText } from '@/lib/planner/expert-presentation';

export default function MissionOperationJournal({
  row,
}: {
  row: MissionOperation;
}) {
  const [view, setView] = useState<'flight' | 'control'>('flight');
  const [limit, setLimit] = useState(100);
  const journal = operationJournal(row);
  const stamp = (sec: number) =>
    new Date(Date.parse(row.document.window.start) + sec * 1000).toLocaleString(
      'ru-RU',
      { timeZone: row.document.window.timezone },
    );
  const name = (id: string) => {
    const vehicle = row.document.scenario.vehicles.find(
      (vehicle) => vehicle.id === id,
    );
    return vehicle ? vehicleDisplayName(vehicle) : id;
  };
  const download = () => {
    const body = {
      ...journal,
      missionId: row.document.id,
      missionName: row.document.name,
      inputHash: row.inputHash,
      planHash: row.planHash,
      checkpointAt: row.updatedAt,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${row.id}.journal.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="moj-journal" aria-label={`Журнал выполнения ${row.id}`}>
      <div className="moj-heading">
        <div>
          <h3>{row.document.name}</h3>
          <small>ID запуска: {row.id}</small>
        </div>
        <span className={`moj-status moj-${row.status}`}>{journal.status}</span>
        <InfoHint label="Отдельный журнал миссии">
          Полёт — события рассчитанного плана до текущего времени симуляции.
          После нештатного события исходный маршрут не продолжается в журнале.
          Управление — сохранённые контрольные точки и зарегистрированные
          нештатные события. Это не полная история всех нажатий и не реальная
          телеметрия.
        </InfoHint>
      </div>
      <div className="moj-toolbar">
        <fieldset aria-label="Раздел журнала миссии">
          <button
            className="mw-button"
            aria-pressed={view === 'flight'}
            onClick={() => setView('flight')}
          >
            Полёт · {journal.modelEvents.length}
          </button>
          <button
            className="mw-button"
            aria-pressed={view === 'control'}
            onClick={() => setView('control')}
          >
            Управление · {journal.controlEvents.length}
          </button>
        </fieldset>
        <button className="mw-button" onClick={download}>
          <Download size={14} /> Журнал JSON
        </button>
      </div>
      <ol
        className="moj-timeline"
        aria-label={view === 'flight' ? 'События полёта' : 'События управления'}
      >
        {view === 'flight'
          ? journal.modelEvents.slice(-limit).map((event, index) => (
              <li key={`${event.timeSec}-${index}`}>
                <time>{stamp(event.timeSec)}</time>
                <div>
                  <strong>{name(event.vehicleId)}</strong>
                  <p>{expertEventText(event, row.document, row.candidate)}</p>
                  <details>
                    <summary>Техническая запись</summary>
                    <p>{event.detail}</p>
                  </details>
                </div>
              </li>
            ))
          : journal.controlEvents.map((event, index) => (
              <li
                className={event.kind === 'incident' ? 'moj-incident' : ''}
                key={`${event.at}-${index}`}
              >
                <time dateTime={event.at}>
                  {new Date(event.at).toLocaleString('ru-RU')}
                </time>
                <div>
                  <p>{event.text}</p>
                </div>
              </li>
            ))}
      </ol>
      {view === 'flight' && journal.modelEvents.length > limit && (
        <button
          className="mw-button"
          onClick={() => setLimit((value) => value + 100)}
        >
          Показать предыдущие события
        </button>
      )}
      {view === 'flight' && journal.modelEvents.length === 0 && (
        <p>Событий полёта пока нет.</p>
      )}
    </section>
  );
}
