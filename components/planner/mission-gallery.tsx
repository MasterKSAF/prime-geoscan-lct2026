import { SHOWCASE_SCENARIOS } from '@/lib/planner/mission-showcase';
import type { MissionDocument } from '@/lib/planner/mission-schema';
export default function MissionGallery({
  onOpen,
}: {
  onOpen: (document: MissionDocument, label: string) => void;
}) {
  return (
    <>
      <p className="mw-caption">
        {SHOWCASE_SCENARIOS.length} компактных сценариев показывают назначение
        работ, ограничения и корректный отказ. Это наш проверочный корпус по ТЗ,
        не официальные входные данные жюри. Все территории и ресурсы учебные.
      </p>
      <div className="ms-gallery">
        {SHOWCASE_SCENARIOS.map((s, i) => (
          <article className="ms-scenario" key={s.id}>
            <div className="ms-scenario-top">
              <span>{String(i + 1).padStart(2, '0')}</span>
              <small
                className={
                  s.expected === 'feasible_model' ? 'ms-ok' : 'ms-negative'
                }
              >
                {s.expected === 'feasible_model'
                  ? 'Положительный сценарий'
                  : 'Проверка отказа'}
              </small>
            </div>
            <h3>{s.title}</h3>
            <p>{s.summary}</p>
            <ul>
              {s.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <details>
              <summary>Что проверяем</summary>
              <ul>
                {s.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
            <div className="ms-scenario-actions">
              <button
                className="mw-button primary"
                onClick={() => onOpen(s.create(), `Сценарий: ${s.title}`)}
              >
                Открыть сценарий {i + 1}
              </button>
              <a
                className="mw-button"
                href={`/planner/scenarios/${s.id}.mission.json`}
                download
              >
                JSON
              </a>
            </div>
            <details>
              <summary>Примеры для импорта по частям</summary>
              <div className="ms-scenario-actions">
                <a
                  className="mw-button small"
                  href={`/planner/scenarios/${s.id}.area.geojson`}
                  download
                >
                  Участки
                </a>
                <a
                  className="mw-button small"
                  href={`/planner/scenarios/${s.id}.restrictions.json`}
                  download
                >
                  Объёмы
                </a>
                <a
                  className="mw-button small"
                  href={`/planner/scenarios/${s.id}.fleet.json`}
                  download
                >
                  Флот
                </a>
              </div>
              <p className="mw-caption">
                Флот и объёмы добавляются к текущей миссии. Повторяющиеся ID
                отклоняются: измените ID в копии файла или используйте другую
                миссию.
              </p>
            </details>
          </article>
        ))}
      </div>
    </>
  );
}
