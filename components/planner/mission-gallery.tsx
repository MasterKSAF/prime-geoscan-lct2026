import {
  DEMONSTRATION_SCENARIOS,
  SHOWCASE_SCENARIOS,
} from '@/lib/planner/mission-showcase';
import type { ShowcaseScenario } from '@/lib/planner/mission-showcase';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import { workLabels } from '@/lib/planner/mission-editing';
import { InfoHint } from './mission-help';
import { useState } from 'react';
import { parseMissionText } from '@/lib/planner/mission-io';
export default function MissionGallery({
  onOpen,
  compact = false,
}: {
  onOpen: (document: MissionDocument, label: string) => void;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  if (compact)
    return (
      <section className="expert-demos" aria-label="Три сценария проверки">
        {[
          {
            id: 'demo-01-survey',
            title: 'Съёмка участка',
            text: 'Выбор БВС, расчёт и завершение миссии.',
            tag: '01 · Основной маршрут',
          },
          {
            id: 'demo-02-expert-obstacles',
            title: 'Обход препятствий',
            text: 'KML экспертов, два вида съёмки и разнесение БВС.',
            tag: '02 · Безопасность',
          },
          {
            id: 'demo-03-repair',
            title: 'Недостаточный заряд',
            text: 'Отказ в запуске, причины и проверка исправлений.',
            tag: '03 · Проверка отказа',
          },
        ].map((demo) => (
          <button
            key={demo.id}
            className="expert-demo"
            data-scenario-id={demo.id}
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                const response = await fetch(
                  `/planner/scenarios/${demo.id}.mission.json`,
                );
                if (!response.ok)
                  throw new Error(
                    'Не удалось загрузить пример. Повторите попытку.',
                  );
                onOpen(parseMissionText(await response.text()), demo.title);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setLoading(false);
              }
            }}
          >
            <small>{demo.tag}</small>
            <strong>{demo.title}</strong>
            <span>{demo.text}</span>
            <b>Открыть миссию →</b>
          </button>
        ))}
        {loading && <output>Загрузка миссии…</output>}
        {error && <p role="alert">{error}</p>}
      </section>
    );
  const renderScenario = (s: ShowcaseScenario, i: number, demo = false) => {
    const d = s.create();
    const automatic = d.jobs.every((j) => j.assignedVehicleIds.length === 0);
    return (
      <article className="ms-scenario" key={s.id} data-scenario-id={s.id}>
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
        <dl className="mw-scenario-facts">
          <div>
            <dt>Миссия</dt>
            <dd>{s.summary}</dd>
          </div>
          <div>
            <dt>Вид работы</dt>
            <dd>
              {[...new Set(d.jobs.map((j) => j.job.type))]
                .map((t) => `${t} (${workLabels[t]})`)
                .join(' + ')}
            </dd>
          </div>
          <div>
            <dt>Количество БВС</dt>
            <dd>
              {automatic
                ? `Назначается автоматически · в парке ${d.scenario.vehicles.length}`
                : new Set(d.jobs.flatMap((j) => j.assignedVehicleIds)).size}
            </dd>
          </div>
          <div>
            <dt>Варианты плана</dt>
            <dd>Раньше завершить · снизить общий налёт · баланс</dd>
          </div>
        </dl>
        {s.walkthrough && (
          <details>
            <summary>Показать по шагам</summary>
            <ol>
              {s.walkthrough.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        )}
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
            disabled={loading}
            onClick={async () => {
              if (s.id !== 'demo-02-expert-obstacles') {
                onOpen(s.create(), `Сценарий: ${s.title}`);
                return;
              }
              setLoading(true);
              setError('');
              try {
                const response = await fetch(
                  '/planner/scenarios/demo-02-expert-obstacles.mission.json',
                );
                if (!response.ok) throw new Error('Пример недоступен.');
                onOpen(parseMissionText(await response.text()), s.title);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setLoading(false);
              }
            }}
          >
            {demo ? `Открыть демо ${i + 1}` : `Открыть сценарий ${i + 1}`}
          </button>
          <a
            className="mw-button"
            href={`/planner/scenarios/${s.id}.mission.json`}
            download
          >
            JSON
          </a>
        </div>
        {s.id !== 'demo-02-expert-obstacles' && (
          <details>
            <summary>
              Примеры для импорта по частям{' '}
              <InfoHint label="Импорт частей сценария">
                Флот и объёмы добавляются к текущей миссии. Повторяющиеся ID
                отклоняются: измените ID в копии файла или используйте другую
                миссию.
              </InfoHint>
            </summary>
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
          </details>
        )}
      </article>
    );
  };
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {loading && <output>Загружаем миссию и исходный слой…</output>}
      <div className="mw-gallery-intro">
        Три сценария для первого показа{' '}
        <InfoHint label="Демонстрационные миссии">
          Синтетические миссии, не входы жюри и не разрешение полёта. Первые два
          должны завершиться в модели. Третий сначала отклоняется, затем
          отдельно проверяется гипотеза исправления. Фото не создаются.
        </InfoHint>
      </div>
      <div className="ms-gallery">
        {DEMONSTRATION_SCENARIOS.map((s, i) =>
          renderScenario(
            i === 1
              ? {
                  ...s,
                  id: 'demo-02-expert-obstacles',
                  title: '2. Препятствия из KML экспертов',
                  summary:
                    'Небольшой участок в Приморском крае. Два БВС снимают RGB и MS; полный исходный слой из 3 201 препятствия учитывается при обходе.',
                  walkthrough: [
                    'Откройте миссию с исходным KML экспертов.',
                    'В слоях посмотрите источник, объекты и запас обхода.',
                    'Рассчитайте варианты: перелёт и возврат проверяются вместе с работами.',
                    'Подтвердите план и выполните модельную миссию.',
                    'Откройте отчёт и скачайте ZIP доказательств.',
                  ],
                }
              : s,
            i,
            true,
          ),
        )}
      </div>
      <details>
        <summary>
          Другие проверочные примеры · {SHOWCASE_SCENARIOS.length + 1}
        </summary>
        <div className="ms-gallery">
          {SHOWCASE_SCENARIOS.map((s, i) => renderScenario(s, i))}
          {renderScenario(
            DEMONSTRATION_SCENARIOS[1],
            SHOWCASE_SCENARIOS.length,
          )}
        </div>
      </details>
    </>
  );
}
