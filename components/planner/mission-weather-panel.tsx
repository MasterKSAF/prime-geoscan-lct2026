'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudSun, RefreshCw, X } from 'lucide-react';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import {
  applyMissionWeather,
  weatherEnvelope,
  weatherFootprint,
  weatherHeight,
  weatherMatches,
  weatherPoints,
  weatherSnapshotSchema,
  type WeatherSnapshot,
  type MissionWeather,
} from '@/lib/planner/mission-weather';
import { sunAltitudeDeg } from '@/lib/planner/mission-validation';
import { describeMissionWind } from '@/lib/planner/mission-guidance';
import { InfoHint } from './mission-help';

const defaults: MissionWeather['limits'] = {
  maxPrecipitationMm: 0,
  maxCloudPct: 20,
  minVisibilityM: 1000,
  source:
    'Учебная политика оператора: без осадков, облачность для ясного неба до 20%, видимость от 1 км. Не норматив и не паспорт БВС.',
};
export default function MissionWeatherPanel({
  document: d,
  onChange,
  timeSec,
  execution = false,
}: {
  document: MissionDocument;
  onChange: (d: MissionDocument) => void;
  timeSec: number;
  execution?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [pending, setPending] = useState<WeatherSnapshot | null>(null),
    [auto, setAuto] = useState(false);
  const [limits, setLimits] = useState(d.weather?.limits ?? defaults);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const latest = useRef(d);
  const key = JSON.stringify([weatherFootprint(d), d.window, weatherHeight(d)]);
  const keyRef = useRef(key);
  const [previousKey, setPreviousKey] = useState(key);
  const [previousWeather, setPreviousWeather] = useState(d.weather);
  // Reset transient input state before children render a different mission scope.
  if (previousKey !== key) {
    setPreviousKey(key);
    setBusy(false);
    setPending(null);
    setError('');
  }
  if (previousWeather !== d.weather) {
    setPreviousWeather(d.weather);
    setLimits(d.weather?.limits ?? defaults);
  }
  useEffect(() => {
    latest.current = d;
    keyRef.current = key;
  }, [d, key]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    request.current?.abort();
    sequence.current++;
  }, [key]);
  useEffect(() => () => request.current?.abort(), []);
  async function refresh() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const seq = ++sequence.current,
      originalKey = keyRef.current,
      input = latest.current;
    setBusy(true);
    setError('');
    try {
      const q = {
        points: weatherPoints(input),
        start: input.window.start,
        end: input.window.end,
        footprint: weatherFootprint(input),
        referenceHeightM: weatherHeight(input),
      };
      const response = await fetch(
        `/api/planner/weather?q=${encodeURIComponent(JSON.stringify(q))}`,
        { signal: controller.signal },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          (body as { error?: string }).error || 'Метеосервис недоступен.',
        );
      const next = weatherSnapshotSchema.parse(body);
      if (
        seq !== sequence.current ||
        originalKey !== keyRef.current ||
        controller.signal.aborted
      )
        return;
      setPending(next);
    } catch (e) {
      if (!controller.signal.aborted && seq === sequence.current)
        setError(
          e instanceof Error && !/fetch|network/i.test(e.message)
            ? e.message
            : 'Нет доступа к метеосервису или серверу стенда.',
        );
    } finally {
      if (seq === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      void refresh();
    }, 5 * 60000);
    return () => clearInterval(timer);
  }, [auto]);
  const applied = d.weather?.snapshot;
  const snapshot = pending ?? applied;
  const matches = !!applied && weatherMatches(d, applied);
  const changed =
    !!pending &&
    !!applied &&
    JSON.stringify(pending.hours) !== JSON.stringify(applied.hours);
  const at = Date.parse(d.window.start) + (execution ? timeSec : 0) * 1000;
  const hour = snapshot?.hours.find(
    (h, i, all) =>
      Date.parse(h.at) <= at && (!all[i + 1] || Date.parse(all[i + 1].at) > at),
  );
  const point = weatherPointsSafe(d);
  const sun = sunAltitudeDeg(at, point);
  const timeLabel = (date: string | number) => {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: d.window.timezone,
      }).format(new Date(date));
    } catch {
      return 'Уточните дату и часовой пояс';
    }
  };
  const state = changed
    ? 'Прогноз изменился — проверьте план'
    : applied && !matches
      ? 'Участок или время изменены — обновите прогноз'
      : applied && now - Date.parse(applied.fetchedAt) > 3600000
        ? 'Сохранённый прогноз требует обновления'
        : applied
          ? 'Расчёт по сохранённому прогнозу'
          : 'Погода задана вручную';
  function apply() {
    try {
      if (!snapshot) return;
      if (Date.now() - Date.parse(snapshot.fetchedAt) > 3600000)
        throw new Error(
          'Снимок загружен более часа назад. Обновите прогноз перед применением.',
        );
      onChange(
        applyMissionWeather(d, {
          snapshot,
          limits: {
            ...limits,
            source:
              'Пределы оператора в интерфейсе стенда; не норматив ГОСТ и не подтверждённый паспортный допуск.',
          },
        }),
      );
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось применить погоду.');
    }
  }
  return (
    <>
      <section className="mw-weather-summary" aria-label="Погода и освещение">
        <button
          className="mw-weather-open"
          aria-label="Погода и условия"
          onClick={() => setOpen(true)}
        >
          <CloudSun size={21} />
          <span>
            <strong>Погода и условия</strong>
            <small>
              {state}
              {applied ? ` · ${timeLabel(applied.fetchedAt)}` : ''}
            </small>
          </span>
        </button>
        <span>
          {sun > 0 ? 'Светлое время' : 'Тёмное время'}
          <small>
            {timeLabel(at)} · {execution ? 'время симуляции' : 'начало миссии'}
          </small>
        </span>
      </section>
      <dialog
        ref={dialog}
        className="mw-modal mw-weather-dialog"
        aria-label="Погода для территории миссии"
        onCancel={() => setOpen(false)}
      >
        <div className="mw-modal-head">
          <h2>
            Погода для территории миссии
            <InfoHint label="Источник и применение погоды">
              Прогноз запрашивается для центра и четырёх углов области,
              включающей базы и границу полётов; это не измерения на борту. На
              метеосервис передаются только координаты и даты, без названий
              миссий и характеристик БВС. Автообновление работает, пока открыт
              стенд, и не меняет подтверждённый план. В маршрут применяется один
              постоянный ветер — максимум выборки и его направление. Порывы,
              осадки, облачность и видимость проверяются отдельно. Влияние
              температуры на батарею не моделируется; солнце рассчитывается по
              координатам и дате.
            </InfoHint>
          </h2>
          <button
            className="mw-button square"
            aria-label="Закрыть погоду"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mw-modal-body">
          <p>
            Прогноз на {timeLabel(d.window.start)} — {timeLabel(d.window.end)} (
            {d.window.timezone}).
          </p>
          <div className="mw-actions" style={{ margin: '16px 0' }}>
            <button
              className="mw-button primary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} />
              {busy ? 'Получаем прогноз…' : 'Обновить прогноз'}
            </button>
            <label className="mw-checkbox">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  if (e.target.checked) void refresh();
                }}
              />
              Проверять обновления каждые 5 минут
            </label>
          </div>
          {error && (
            <p className="mw-alert error" role="alert">
              {error} Последние сохранённые данные не изменены.
            </p>
          )}
          {changed && (
            <p className="mw-alert">
              Пришёл отличающийся прогноз. Сравните условия; для нового расчёта
              остановите симуляцию и примените обновление.
            </p>
          )}
          {snapshot && (
            <>
              <div className="mw-weather-cards">
                <article>
                  <strong>
                    {
                      describeMissionWind(
                        hour?.windMps ?? weatherEnvelope(snapshot).windMps,
                        hour?.fromDeg ?? weatherEnvelope(snapshot).fromDeg,
                      ).text
                    }
                  </strong>
                  <p>
                    Опорный ветер на {snapshot.referenceHeightM} м над модельной
                    поверхностью
                  </p>
                </article>
                <article>
                  <strong>
                    {weatherEnvelope(snapshot).precipitationMm === 0
                      ? 'Без осадков в выборке'
                      : 'Возможны осадки'}
                  </strong>
                  <p>
                    Максимум за час: {weatherEnvelope(snapshot).precipitationMm}{' '}
                    мм
                  </p>
                </article>
                <article>
                  <strong>
                    {weatherEnvelope(snapshot).cloudPct > limits.maxCloudPct
                      ? 'Проверьте условия съёмки'
                      : 'Облачность в принятом пределе'}
                  </strong>
                  <p>Предел оператора для ясного неба: {limits.maxCloudPct}%</p>
                </article>
              </div>
              <details className="mw-details">
                <summary>
                  <span>Почасовой прогноз и численные данные</span>
                  <InfoHint label="Как читать почасовой прогноз">
                    Порывы на 10 м и осадки относятся к предыдущему часу. Взяты
                    худшие значения контрольных точек; крайние часы включены с
                    запасом. Близкие точки могут относиться к одной ячейке
                    модели.
                  </InfoHint>
                </summary>
                <div className="mw-weather-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Время</th>
                        <th>Ветер / порывы*</th>
                        <th>Осадки*</th>
                        <th>Облака</th>
                        <th>Видимость</th>
                        <th>Температура 2 м</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.hours.map((h) => (
                        <tr key={h.at}>
                          <td>{timeLabel(h.at)}</td>
                          <td>
                            {h.windMps} / {h.gustMps} м/с
                          </td>
                          <td>{h.precipitationMm} мм</td>
                          <td>{h.cloudPct}%</td>
                          <td>{(h.visibilityM / 1000).toFixed(1)} км</td>
                          <td>
                            {h.temperatureMinC}…{h.temperatureMaxC} °C
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <details className="mw-details">
                <summary>
                  <span>Пределы для расчёта — настройки оператора</span>
                  <InfoHint label="Как применяются пределы погоды">
                    Начальные значения учебные, не универсальный запрет на
                    полёты и не паспортный допуск. Проверяется всё окно, включая
                    часы без вылетов. Если плох один час, сузьте окно и
                    рассчитайте заново.
                  </InfoHint>
                </summary>
                <div className="mw-field-row">
                  {(
                    [
                      ['maxPrecipitationMm', 'Максимальные осадки, мм/ч', 100],
                      ['maxCloudPct', 'Облачность для ясного неба, %', 100],
                      ['minVisibilityM', 'Минимальная видимость, м', 100000],
                    ] as const
                  ).map(([k, label, max]) => (
                    <label className="mw-field" key={k}>
                      {label}
                      <input
                        type="number"
                        min="0"
                        max={max}
                        step="0.1"
                        value={limits[k]}
                        onChange={(e) =>
                          setLimits({ ...limits, [k]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
              <p className="mw-caption" style={{ marginTop: 16 }}>
                Высота облаков и ветер на борту не подтверждены.
              </p>
            </>
          )}
          <p className="mw-caption" style={{ marginTop: 16 }}>
            Источник:{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
            ,{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>
            .
            <InfoHint label="Лицензия и ограничения метеосервиса">
              Данные агрегированы по точкам и часам. Бесплатный API — для
              некоммерческого использования, без гарантии доступности. Для
              коммерческого внедрения нужен подходящий тариф. Источник и
              лицензия сохраняются рядом с прогнозом.
            </InfoHint>
          </p>
        </div>
        <div className="mw-modal-footer">
          <button
            className="mw-button"
            onClick={() => {
              const { weather: _, ...rest } = d;
              onChange(rest);
              setOpen(false);
            }}
          >
            Оставить ручной режим
          </button>
          <button
            className="mw-button primary"
            disabled={!snapshot || busy || !weatherMatches(d, snapshot)}
            onClick={apply}
          >
            Применить к заданию
          </button>
        </div>
      </dialog>
    </>
  );
}
function weatherPointsSafe(d: MissionDocument): [number, number] {
  try {
    return weatherPoints(d)[0];
  } catch {
    return d.scenario.vehicles[0].start;
  }
}
