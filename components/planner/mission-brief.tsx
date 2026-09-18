import type { MissionDocument } from '@/lib/planner/mission-schema';
import { jobNames } from './mission-wizard';

function date(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}
export default function MissionBrief({
  document: d,
}: {
  document: MissionDocument;
}) {
  return (
    <div className="ms-brief">
      <div className="ms-eyebrow">Паспорт миссии · {d.id}</div>
      <h3>{d.name}</h3>
      <p>
        {d.notes ||
          'Описание пока не заполнено. Его можно добавить на шаге «Проверка».'}
      </p>
      <dl className="ms-facts">
        <div>
          <dt>Доступное окно</dt>
          <dd>
            {date(d.window.start, d.window.timezone)} —{' '}
            {date(d.window.end, d.window.timezone)}
          </dd>
          <small>{d.window.timezone}</small>
        </div>
        <div>
          <dt>Ресурсы</dt>
          <dd>
            {d.scenario.vehicles.filter((v) => v.enabled).length} доступных БВС
            · {d.batteries.length} АКБ
          </dd>
          <small>Запас при посадке: {d.scenario.reservePct}%</small>
        </div>
        <div>
          <dt>Условия</dt>
          <dd>
            Ветер {d.scenario.wind.speedMps} м/с, от {d.scenario.wind.fromDeg}°
          </dd>
          <small>Постоянный вектор на всё окно; не прогноз погоды</small>
        </div>
        <div>
          <dt>Разнесение</dt>
          <dd>
            {d.planning.separationHorizontalM} м /{' '}
            {d.planning.separationVerticalM} м
          </dd>
          <small>
            Горизонталь / вертикаль · запас {d.planning.temporalBufferSec} с
          </small>
        </div>
      </dl>
      {d.environment && (
        <p className="ms-notice">
          Облачность:{' '}
          {d.environment.cloudBaseM === null
            ? 'граница неизвестна'
            : `нижняя граница ${d.environment.cloudBaseM} м, запас ${d.environment.cloudClearanceM} м`}
          . Видимость:{' '}
          {d.environment.visibilityM === null
            ? 'неизвестна'
            : `${d.environment.visibilityM} м`}
          ; минимум:{' '}
          {d.environment.minVisibilityM === null
            ? 'не задан'
            : `${d.environment.minVisibilityM} м`}
          . Источник: {d.environment.source}. Условия постоянны на всё окно.
        </p>
      )}
      <div className="ms-table-scroll">
        <table className="ms-table">
          <thead>
            <tr>
              <th>Работа</th>
              <th>Высота</th>
              <th>Геометрия</th>
              <th>Кто может выполнять</th>
            </tr>
          </thead>
          <tbody>
            {d.jobs.map((j) => (
              <tr key={j.id}>
                <td>
                  <strong>{j.name}</strong>
                  <small>
                    {jobNames[j.job.type]} · {j.id}
                  </small>
                </td>
                <td>{j.job.altitudeM} м</td>
                <td>{j.area.coordinates.length} контуров</td>
                <td>
                  {j.assignedVehicleIds.length
                    ? j.assignedVehicleIds
                        .map(
                          (id) =>
                            d.scenario.vehicles.find((v) => v.id === id)
                              ?.name ?? id,
                        )
                        .join(', ')
                    : 'Автоматический выбор совместимых БВС'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mw-caption">
        Объёмных ограничений: {d.restrictions.length}; постоянных запретов:{' '}
        {d.scenario.exclusions.length}; резервных площадок:{' '}
        {d.scenario.reserveSites.length}. Высоты используют общий локальный
        уровень миссии.{' '}
        {d.terrainModel.kind === 'flat'
          ? 'Поверхность задана плоской.'
          : 'Рельеф не установлен.'}{' '}
        Это не реальный DEM.
      </p>
    </div>
  );
}
