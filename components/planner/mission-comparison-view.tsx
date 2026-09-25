import type {
  MissionCandidate,
  MissionResult,
} from '@/lib/planner/mission-schema';
import { InfoHint } from './mission-help';
import { sortieJobIds } from '@/lib/planner/mission-sortie-jobs';
import { flightTimeBreakdown } from '@/lib/planner/mission-resources';
const number = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const title = (c: MissionCandidate) =>
  c.id === 'balanced'
    ? 'Уложиться в срок'
    : c.objective === 'makespan'
      ? 'Быстрее закончить'
      : 'Меньше налёт';
export default function MissionComparisonView({
  result,
  selectedId,
  onSelect,
}: {
  result: MissionResult;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const rows = [
    ...result.candidates,
    ...(result.recommendation ? [result.recommendation.candidate] : []),
  ];
  const selected = rows.find((c) => c.id === selectedId) ?? rows[0];
  const breakdown = selected ? flightTimeBreakdown(selected) : null;
  const maxTime = Math.max(1, ...rows.map((c) => c.metrics.makespanSec)),
    maxFlight = Math.max(1, ...rows.map((c) => c.metrics.flightTimeSec));
  return (
    <>
      <div className="ms-table-scroll">
        <table className="ms-table">
          <thead>
            <tr>
              <th>
                Вариант
                <InfoHint label="Как сравниваются варианты">
                  Выбор между более ранним завершением и меньшим временем БВС в
                  воздухе. Сравниваются найденные планы, прошедшие проверки.
                </InfoHint>
              </th>
              <th>
                До завершения
                <InfoHint label="Время до завершения">
                  От начала заданного окна до последней посадки. Включает
                  подготовку, ожидания и обслуживание между вылетами.
                  Последующая обработка полученных данных не моделируется.
                  Меньше — раньше закончена миссия.
                </InfoHint>
              </th>
              <th>
                Суммарный налёт
                <InfoHint label="Суммарный налёт">
                  Время в воздухе всех аппаратов складывается, даже если они
                  летят одновременно. Два БВС по 10 минут дают 20 минут налёта.
                  Это показатель использования ресурса, не измеренный износ
                  батарей.
                </InfoHint>
              </th>
              <th>
                Покрытие
                <InfoHint label="Покрытие исходной миссии">
                  Какая доля всей территории будет снята по расчёту. Требуется
                  не менее 99%. Исключённые запретами части не засчитываются.
                </InfoHint>
              </th>
              <th>БВС</th>
              <th>
                Вылеты
                <InfoHint label="Вылеты и замены аккумулятора">
                  Полёты от взлёта до посадки. Повторные вылеты используют
                  оставшийся заряд; будущая замена не закладывается в план без
                  сообщения о состоянии.
                </InfoHint>
              </th>
              <th>
                Мин. остаток
                <InfoHint label="Минимальный остаток на посадке">
                  Самый небольшой расчётный остаток батареи среди всех
                  завершений вылетов. Он должен сохранять заданный резерв.
                  Расход линейный по времени полёта, без калибровки температуры
                  и деградации АКБ.
                </InfoHint>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className={selectedId === c.id ? 'ms-selected' : ''}
              >
                <td>
                  <button
                    className="mw-button small"
                    onClick={() => onSelect(c.id)}
                  >
                    {title(c)}
                  </button>
                  <small>
                    {c.status === 'feasible_model'
                      ? 'Выполним в модели'
                      : 'Не готов к подтверждению'}
                  </small>
                </td>
                <td>
                  {c.sorties.length
                    ? `${number(c.metrics.makespanSec / 60)} мин`
                    : '—'}
                  <div className="ms-metric-bar">
                    <span
                      style={{
                        width: `${(100 * c.metrics.makespanSec) / maxTime}%`,
                      }}
                    />
                  </div>
                </td>
                <td>
                  {number(c.metrics.flightTimeSec / 60)} мин
                  <div className="ms-metric-bar">
                    <span
                      style={{
                        width: `${(100 * c.metrics.flightTimeSec) / maxFlight}%`,
                      }}
                    />
                  </div>
                </td>
                <td>{number(c.metrics.grossCoveragePct)}%</td>
                <td>{c.metrics.vehicleCount}</td>
                <td>{c.metrics.sortieCount}</td>
                <td>
                  {c.sorties.length
                    ? `${number(c.metrics.minimumRemainingPct)}%`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.recommendation ? (
        <details className="mw-details">
          <summary>
            Как уложиться в срок
            <InfoHint label="Выбор под заданный срок">
              Минимальный суммарный налёт среди найденных полных безопасных
              планов, укладывающихся в срок и лимит БВС. Может совпасть с
              «Меньше налёт».
            </InfoHint>
          </summary>
          <p>
            Допустимых кандидатов: {result.recommendation.poolSize} · разных
            планов: {result.recommendation.distinctPlanCount} · запас до срока:{' '}
            {number(result.recommendation.slackSec / 60)} мин
          </p>
          {result.recommendation.samePlan && (
            <p className="ms-notice">Совпадает с основным вариантом.</p>
          )}
          <details>
            <summary>Подробности выбора</summary>
            <p>{result.recommendation.explanation}</p>
          </details>
        </details>
      ) : (
        <p className="ms-notice">
          Для сравнения нужен план, прошедший проверки.
        </p>
      )}
      {result.resourceStudy && (
        <details className="mw-details">
          <summary>Сколько БВС нужно к сроку</summary>
          <div className="ms-table-scroll">
            <table className="ms-table">
              <thead>
                <tr>
                  <th>Лимит группы</th>
                  <th>Назначено</th>
                  <th>Время завершения</th>
                </tr>
              </thead>
              <tbody>
                {result.resourceStudy.rows.map((r) => (
                  <tr key={r.maxVehicles}>
                    <td>До {r.maxVehicles} БВС</td>
                    <td>{r.vehicleCount ?? '—'}</td>
                    <td>
                      {r.status === 'found'
                        ? `${number(r.makespanSec! / 60)} мин · в срок`
                        : r.status === 'not_found'
                          ? 'Полный план пока не найден'
                          : 'Не исследован в бюджете поиска'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Сравнение в пределах текущего парка и срока. Отсутствие найденного
            плана не означает невозможность.
          </p>
        </details>
      )}
      {breakdown && (
        <details className="mw-details">
          <summary>Из чего складывается налёт</summary>
          <dl className="resource-time-breakdown">
            <dt>Съёмка</dt>
            <dd>{number(breakdown.surveySec / 60)} мин</dd>
            <dt>Переходы и возврат</dt>
            <dd>{number(breakdown.transitReturnSec / 60)} мин</dd>
            <dt>Взлёт, посадка, манёвры</dt>
            <dd>{number(breakdown.maneuversSec / 60)} мин</dd>
            <dt>Ожидание в воздухе</dt>
            <dd>{number(breakdown.airborneWaitingSec / 60)} мин</dd>
          </dl>
          <p>
            Сумма по всем БВС. Ожидание на земле не входит в налёт, но
            увеличивает время завершения.
          </p>
        </details>
      )}
      {selected && (
        <details className="mw-details">
          <summary>Какие работы выполняет каждый БВС</summary>
          <div className="ms-table-scroll">
            <table className="ms-table">
              <thead>
                <tr>
                  <th>БВС</th>
                  <th>Работы</th>
                  <th>Вылеты</th>
                  <th>Налёт</th>
                  <th>Параметры и доступность</th>
                </tr>
              </thead>
              <tbody>
                {result.document.scenario.vehicles.map((v) => {
                  const own = selected.sorties.filter(
                    (s) => s.vehicleId === v.id,
                  );
                  return (
                    <tr key={v.id}>
                      <td>{v.name}</td>
                      <td>
                        {[
                          ...new Set(
                            own
                              .flatMap(sortieJobIds)
                              .map(
                                (jobId) =>
                                  result.document.jobs.find(
                                    (j) => j.id === jobId,
                                  )?.name ?? jobId,
                              ),
                          ),
                        ].join(', ') || 'Не назначен'}
                      </td>
                      <td>{own.length}</td>
                      <td>
                        {number(
                          own.reduce((n, s) => n + s.durationSec, 0) / 60,
                        )}{' '}
                        мин
                      </td>
                      <td>
                        {v.enabled
                          ? `${v.jobs.join(' / ')}; ${v.airspeedMps} м/с; ресурс ${v.effectiveEnduranceMin} мин`
                          : 'Исключён оператором'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
