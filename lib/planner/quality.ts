import type { MissionJob, QualityProfile } from './mission-schema.ts';
import type { Check, Scenario, Vehicle } from './schema.ts';

/** Nominal nadir-camera/scan geometry, not a certificate of delivered survey quality. */
export function qualityForJob(
  input: MissionJob,
  vehicle?: Vehicle,
): { job: Scenario['job']; checks: Check[]; assumptions: string[] } {
  const job = { ...input.job },
    q = input.quality,
    checks: Check[] = [],
    assumptions: string[] = [];
  const check = (id: string, ok: boolean, title: string, detail: string) =>
    checks.push({
      id: `QUALITY_${input.id}_${id}`,
      status: ok ? 'pass' : 'fail',
      title,
      detail,
    });
  if (q.status === 'unknown')
    checks.push({
      id: `QUALITY_${input.id}_SOURCE`,
      status: 'fail',
      title: 'Профиль не определён',
      detail: q.source,
    });
  else
    checks.push({
      id: `QUALITY_${input.id}_SOURCE`,
      status: q.status === 'documented' ? 'pass' : 'unknown',
      title: 'Источник параметров сенсора',
      detail: q.source,
    });
  if (q.mode === 'manual') {
    checks.push({
      id: `QUALITY_${input.id}_MANUAL`,
      status: ['LiDAR', 'Geophysics'].includes(job.type) ? 'fail' : 'unknown',
      title: 'Ручная полоса покрытия',
      detail:
        'Параметры введены вручную. Это геометрическая модель без подтверждения физического качества данных.',
    });
    return {
      job,
      checks,
      assumptions: ['Ручные параметры покрытия не доказывают качество съёмки.'],
    };
  }
  const speed = vehicle?.airspeedMps;
  if (q.mode === 'camera') {
    check(
      'TYPE',
      ['RGB', 'MS', 'IR'].includes(job.type),
      'Тип сенсора',
      'Камерная модель применима к RGB/MS/ИК, не к лазерным или геофизическим измерениям.',
    );
    const complete = !!(
      q.sensorWidthMm &&
      q.sensorHeightMm &&
      q.focalLengthMm &&
      q.imageWidthPx &&
      q.imageHeightPx &&
      q.minimumIntervalSec &&
      q.maximumGsdCm &&
      q.forwardOverlap !== undefined
    );
    check(
      'FIELDS',
      complete,
      'Параметры камеры',
      'Нужны размеры сенсора, объектив, разрешение, перекрытие, период и целевой GSD.',
    );
    if (complete) {
      job.swathM = (job.altitudeM * q.sensorWidthMm!) / q.focalLengthMm!;
      const footprintLength =
        (job.altitudeM * q.sensorHeightMm!) / q.focalLengthMm!;
      job.triggerDistanceM = footprintLength * (1 - q.forwardOverlap!);
      const gsdM = Math.max(
        job.swathM / q.imageWidthPx!,
        footprintLength / q.imageHeightPx!,
      );
      check(
        'GSD',
        gsdM * 100 <= q.maximumGsdCm! + 1e-8,
        'Детализация в модели',
        `${(gsdM * 100).toFixed(3)} см/пиксель; требование ≤${q.maximumGsdCm} см.`,
      );
      check(
        'STRIP',
        job.swathM >= 5 &&
          job.swathM <= 500 &&
          job.triggerDistanceM >= 1 &&
          job.triggerDistanceM <= 200,
        'Размеры покрытия',
        'Отпечаток и шаг кадров должны быть в поддерживаемом диапазоне ядра.',
      );
      if (speed) {
        check(
          'CADENCE',
          job.triggerDistanceM / speed >= q.minimumIntervalSec!,
          'Интервал кадров',
          `${(job.triggerDistanceM / speed).toFixed(3)} с; камера требует ≥${q.minimumIntervalSec} с.`,
        );
        if (q.shutterSec !== undefined && q.maximumBlurPx !== undefined)
          check(
            'BLUR',
            (speed * q.shutterSec) / gsdM <= q.maximumBlurPx,
            'Смаз в поступательной модели',
            `${((speed * q.shutterSec) / gsdM).toFixed(3)} пикселя; предел ${q.maximumBlurPx}.`,
          );
        else
          checks.push({
            id: `QUALITY_${input.id}_BLUR`,
            status: 'unknown',
            title: 'Выдержка не подтверждена',
            detail:
              'Нет проверки смаза, экспозиции и реальной частоты сохранения данных.',
          });
      }
      assumptions.push(
        'Камера направлена вниз; прямоугольный отпечаток на локальной горизонтальной поверхности. Рельеф, наклон, дисторсия и реальные кадры требуют отдельной проверки.',
      );
    }
  } else if (q.mode === 'lidar') {
    check(
      'TYPE',
      job.type === 'LiDAR',
      'Тип сенсора',
      'Для лазерного сканирования нужна модель LiDAR.',
    );
    const complete = !!(
      q.fieldOfViewDeg &&
      q.pulseRateHz &&
      q.minimumDensityM2
    );
    check(
      'FIELDS',
      complete,
      'Параметры LiDAR',
      'Угол сканирования, выходная частота точек и минимальная средняя плотность.',
    );
    if (complete) {
      job.swathM =
        2 * job.altitudeM * Math.tan((q.fieldOfViewDeg! * Math.PI) / 360);
      check(
        'STRIP',
        job.swathM >= 5 && job.swathM <= 500,
        'Ширина лазерной полосы',
        `${job.swathM.toFixed(2)} м; поддерживаемый диапазон 5–500 м.`,
      );
      if (speed)
        check(
          'DENSITY',
          q.pulseRateHz! / (job.swathM * speed) >= q.minimumDensityM2!,
          'Средняя плотность точек',
          `${(q.pulseRateHz! / (job.swathM * speed)).toFixed(2)} точек/м²; это не гарантия локальной равномерности.`,
        );
      assumptions.push(
        'Равномерное номинальное распределение выходных точек; потери отражений, профиль сканера и точность облака не подтверждены.',
      );
    }
  } else {
    check(
      'TYPE',
      job.type === 'Geophysics',
      'Тип сенсора',
      'Геофизическая модель не является RGB-покрытием.',
    );
    const complete =
      !!(q.sampleRateHz && q.maximumSampleSpacingM) &&
      q.sensorOffsetM !== undefined;
    check(
      'FIELDS',
      complete,
      'Параметры геофизики',
      'Выходная частота, максимальный шаг измерений и расстояние подвеса.',
    );
    if (complete) {
      check(
        'HEIGHT',
        job.altitudeM - q.sensorOffsetM! > 0,
        'Высота датчика',
        `${job.altitudeM - q.sensorOffsetM!} м над принятой плоскостью.`,
      );
      if (speed)
        check(
          'SAMPLES',
          speed / q.sampleRateHz! <= q.maximumSampleSpacingM!,
          'Шаг измерений',
          `${(speed / q.sampleRateHz!).toFixed(3)} м; предел ${q.maximumSampleSpacingM} м.`,
        );
      assumptions.push(
        'Линейные проходы с заданным шагом; электромагнитные помехи, качание подвеса и контрольные линии не сертифицированы.',
      );
    }
  }
  job.qualitySource = q.source;
  return { job, checks, assumptions };
}

export function createDemoQuality(
  type: Scenario['job']['type'],
): QualityProfile {
  if (type === 'LiDAR')
    return {
      mode: 'lidar',
      status: 'assumed',
      source: 'Учебный LiDAR: совместимость с реальным БВС не подтверждена.',
      fieldOfViewDeg: 60,
      pulseRateHz: 100000,
      minimumDensityM2: 20,
    };
  if (type === 'Geophysics')
    return {
      mode: 'geophysics',
      status: 'assumed',
      source: 'Учебный геофизический датчик, не паспортный профиль Геоскана.',
      sampleRateHz: 10,
      maximumSampleSpacingM: 1,
      sensorOffsetM: 5,
    };
  if (type === 'MS')
    return {
      mode: 'camera',
      status: 'assumed',
      source:
        'Геометрия Pollux по буклету Gemini; период/перекрытия/GSD — параметры учебного задания.',
      sensorWidthMm: 4.968,
      sensorHeightMm: 3.726,
      focalLengthMm: 8,
      imageWidthPx: 1440,
      imageHeightPx: 1080,
      forwardOverlap: 0.7,
      minimumIntervalSec: 1,
      maximumGsdCm: 6,
      shutterSec: 0.001,
      maximumBlurPx: 1,
    };
  if (type === 'IR')
    return {
      mode: 'camera',
      status: 'assumed',
      source:
        'Учебная ИК-камера: геометрия/период условные, реальная метрическая съёмка 801 не подтверждена.',
      sensorWidthMm: 7.68,
      sensorHeightMm: 6.144,
      focalLengthMm: 9.1,
      imageWidthPx: 640,
      imageHeightPx: 512,
      forwardOverlap: 0.6,
      minimumIntervalSec: 1,
      maximumGsdCm: 20,
      shutterSec: 0.001,
      maximumBlurPx: 1,
    };
  return {
    mode: 'camera',
    status: 'assumed',
    source:
      'PF1B: 23,5×15,6 мм, 6000×4000, 20 мм по буклету Gemini. Перекрытия, выдержка и период — учебные параметры.',
    sensorWidthMm: 23.5,
    sensorHeightMm: 15.6,
    focalLengthMm: 20,
    imageWidthPx: 6000,
    imageHeightPx: 4000,
    forwardOverlap: 0.7,
    minimumIntervalSec: 1,
    maximumGsdCm: 3,
    shutterSec: 0.001,
    maximumBlurPx: 1,
  };
}
