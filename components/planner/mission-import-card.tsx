import type { MissionDocument } from '@/lib/planner/mission-schema';
import { qualityForJob } from '@/lib/planner/quality';
import { InfoHint } from './mission-help';

export default function MissionImportCard({
  document: d,
}: {
  document: MissionDocument;
}) {
  const date = (value: string) =>
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: d.window.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <article className="mission-import-card">
      <h3>{d.name}</h3>
      <dl className="mission-import-facts">
        <div>
          <dt>Период выполнения</dt>
          <dd>
            {date(d.window.start)} — {date(d.window.end)}
          </dd>
          <small>{d.window.timezone}</small>
        </div>
        <div>
          <dt>Ресурсы</dt>
          <dd>
            {d.scenario.vehicles.filter((v) => v.enabled).length} доступных БВС
          </dd>
          <small>Запас при посадке {d.scenario.reservePct}%</small>
        </div>
        <div>
          <dt>
            Разнесение БВС{' '}
            <InfoHint label="Разнесение при загрузке">
              Горизонтальный и вертикальный защитные интервалы расчётной модели;
              временной запас {d.planning.temporalBufferSec} с.
            </InfoHint>
          </dt>
          <dd>
            {d.planning.separationHorizontalM} м по горизонтали ·{' '}
            {d.planning.separationVerticalM} м по высоте
          </dd>
        </div>
        <div>
          <dt>Условия</dt>
          <dd>
            Ветер {d.scenario.wind.speedMps} м/с · потолок{' '}
            {d.flightEnvelope.maxAltitudeM} м
          </dd>
          <small>
            {d.restrictions.length + d.scenario.exclusions.length} ограничений ·{' '}
            {d.obstacleLayer
              ? 'слой препятствий загружен'
              : 'без слоя препятствий'}
          </small>
        </div>
      </dl>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Работа / участок</th>
            <th>Высота</th>
            <th>Назначение БВС</th>
          </tr>
        </thead>
        <tbody>
          {d.jobs.map((j) => (
            <tr key={j.id}>
              <td>
                <strong>{j.name}</strong>
                <small>{j.job.type}</small>
              </td>
              <td>
                {qualityForJob(j, undefined, d.flightEnvelope).job.altitudeM} м
              </td>
              <td>
                {j.assignedVehicleIds.length
                  ? j.assignedVehicleIds
                      .map(
                        (id) =>
                          d.scenario.vehicles.find((v) => v.id === id)?.name ??
                          id,
                      )
                      .join(', ')
                  : 'Автоматически'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
