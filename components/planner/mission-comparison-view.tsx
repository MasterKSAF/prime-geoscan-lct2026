import type {
  MissionCandidate,
  MissionResult,
} from '@/lib/planner/mission-schema';
const number = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const title = (c: MissionCandidate) =>
  c.id === 'balanced'
    ? 'Баланс'
    : c.objective === 'makespan'
      ? 'Раньше закончить'
      : 'Меньше летать';
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
  const maxTime = Math.max(1, ...rows.map((c) => c.metrics.makespanSec)),
    maxFlight = Math.max(1, ...rows.map((c) => c.metrics.flightTimeSec));
  return (
    <>
      <p className="ms-notice">
        Сначала — выполнение всей задачи и соблюдение ограничений. Безопасность
        и покрытие не обмениваются на минуты. Среди допустимых вариантов
        сравниваются время до последней посадки и суммарное время в воздухе.
      </p>
      <div className="ms-table-scroll">
        <table className="ms-table">
          <thead>
            <tr>
              <th>Вариант</th>
              <th>До завершения</th>
              <th>Суммарный налёт</th>
              <th>Покрытие</th>
              <th>Вылеты / замены АКБ</th>
              <th>Мин. остаток</th>
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
                <td>
                  {c.metrics.sortieCount} / {c.metrics.batteryChanges}
                </td>
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
        <>
          <h3>Почему выбран баланс</h3>
          <p className="mw-caption">{result.recommendation.explanation}</p>
          <p>
            В пуле {result.recommendation.poolSize} допустимых кандидатов,{' '}
            {result.recommendation.distinctPlanCount} разных планов. Оценка
            выбранного: {result.recommendation.score.toFixed(4)} (меньше лучше).
          </p>
          {result.recommendation.samePlan && (
            <p className="ms-notice">
              Компромисс совпадает с одним из основных вариантов. Это одинаковый
              план, а не отдельная выдуманная альтернатива.
            </p>
          )}
        </>
      ) : (
        <p className="ms-notice">
          Полных допустимых вариантов нет — баланс не предлагается. Измените
          вход по проваленным проверкам и выполните новый расчёт.
        </p>
      )}
      {selected && (
        <>
          <h3>Распределение выбранного варианта</h3>
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
                            own.map(
                              (s) =>
                                result.document.jobs.find(
                                  (j) => j.id === s.jobId,
                                )?.name ?? s.jobId,
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
        </>
      )}
      <p className="mw-caption">
        Налёт — показатель использования ресурса, а не измеренный износ
        двигателей или аккумуляторов. Метрика завершения — последняя посадка;
        отдельная выгрузка и обработка данных после посадки не моделируются.
        Глобальный оптимум не гарантирован.
      </p>
    </>
  );
}
