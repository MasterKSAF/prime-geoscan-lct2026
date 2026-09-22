import type {
  MissionCandidate,
  MissionResult,
} from '@/lib/planner/mission-schema';
import { InfoHint } from './mission-help';
const number = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const title = (c: MissionCandidate) =>
  c.id === 'balanced'
    ? 'Баланс'
    : c.objective === 'makespan'
      ? 'Раньше завершить'
      : 'Снизить общий налёт';
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
    ...(result.recommendation && !result.recommendation.samePlan
      ? [result.recommendation.candidate]
      : []),
  ];
  const selected = rows.find((c) => c.id === selectedId) ?? rows[0];
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
                  Все варианты рассчитываются для одной миссии. «Раньше
                  завершить» сокращает срок, «Снизить общий налёт» — суммарный
                  налёт. «Баланс» ищет компромисс 50/50 среди найденных
                  допустимых планов. Это ограниченный поиск, не доказанный
                  лучший маршрут из всех возможных. Сначала проверяются
                  выполнение всей задачи и ограничения. Безопасность и покрытие
                  не обмениваются на минуты.
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
                  Доля исходной площади всех работ, закрытая расчётными полосами
                  съёмки. Вырезанная запретами часть не считается выполненной.
                  Порог модели — 99%; это не оценка жюри и не подтверждение
                  качества реальных снимков. Для камер проверяются заданная
                  детализация, перекрытие, интервал кадров и смаз при наличии
                  параметров. Для LiDAR — средняя плотность, для геофизики — шаг
                  измерений и высота датчика. Качество — обязательное условие:
                  нарушение порога не компенсируется выигрышем времени.
                  Неизвестные параметры требуют отдельного подтверждения.
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
        <>
          <h3>
            Почему выбран баланс
            <InfoHint label="Что означает оценка баланса">
              Время завершения и налёт приводятся к шкале от 0 до 1 по найденным
              допустимым кандидатам. Затем складываются с весами 0,5 и 0,5.
              Меньшая оценка предпочтительнее в этом наборе. Одинаковые маршруты
              не выдаются за разные альтернативы; безопасность и качество в эту
              сумму не входят. {result.recommendation.explanation}
            </InfoHint>
          </h3>
          <p>
            Допустимых кандидатов: {result.recommendation.poolSize} · разных
            планов: {result.recommendation.distinctPlanCount} · оценка:{' '}
            {result.recommendation.score.toFixed(4)}
          </p>
          {result.recommendation.samePlan && (
            <p className="ms-notice">Совпадает с основным вариантом.</p>
          )}
        </>
      ) : (
        <p className="ms-notice">
          Баланс недоступен: нет полного допустимого плана.
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
    </>
  );
}
