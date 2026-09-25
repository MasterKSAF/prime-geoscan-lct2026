import type { CameraProfile } from './camera-profile.ts';
import type { Vehicle } from './schema.ts';

/** Optical data only. A catalogue is not a measured camera/autopilot trigger test.
 * Missing dimensions are deliberately not inferred from inch-format or megapixels. */
export const CAMERA_CATALOG: readonly CameraProfile[] = [
  {
    id: 'pf1b',
    name: 'Geoscan PF1B · 20 мм',
    type: 'RGB',
    status: 'documented',
    supportedModels: ['Gemini'],
    sensorWidthMm: 23.5,
    sensorHeightMm: 15.6,
    imageWidthPx: 6000,
    imageHeightPx: 4000,
    focalLengthMm: 20,
    source:
      'Geoscan PF1B + Sony SEL20F28: физическое фокусное 20 мм, не эквивалент 30 мм. https://www.geoscan.ru/ru/blog/novaya-kamera-dlya-geoskana-gemini-uluchshennaya-matrica-dlya-bolee-detalnoy-semki ; https://www.sony.co.uk/electronics/camera-lenses/sel20f28/specifications',
  },
  {
    id: 'pollux',
    name: 'Geoscan Pollux · 5 каналов · 8 мм',
    type: 'MS',
    status: 'documented',
    supportedModels: ['Gemini', '201'],
    sensorWidthMm: 4.968,
    sensorHeightMm: 3.726,
    imageWidthPx: 1440,
    imageHeightPx: 1080,
    focalLengthMm: 8,
    source:
      'Geoscan Pollux: активная матрица вычислена как 1440×1080 пикселей × 3,45 мкм. Пять спектральных каналов, не тепловизор. https://www.geoscan.ru/ru/products/components/pollux ; https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf',
  },
  {
    id: '801-wide',
    name: '801 · широкоугольная · 4,35 мм',
    type: 'RGB',
    status: 'documented',
    supportedModels: ['801'],
    focalLengthMm: 4.35,
    source:
      'Геоскан 801, буклет, с. 4: 12 Мп, формат 1/2,3 дюйма, f=4,35 мм. Точные размеры активной матрицы в мм и сетка пикселей не указаны. https://download.geoscan.ru/site-files/801/Geoscan_801.pdf?v2',
  },
  {
    id: '801-tele',
    name: '801 · длиннофокусная · 16 мм',
    type: 'RGB',
    status: 'documented',
    supportedModels: ['801'],
    focalLengthMm: 16,
    source:
      'Геоскан 801, буклет, с. 4: 12 Мп, формат 1/2,3 дюйма, f=16 мм. Цифровой зум не улучшает оптический GSD. Размеры активной матрицы и сетка пикселей не указаны. https://download.geoscan.ru/site-files/801/Geoscan_801.pdf?v2',
  },
  {
    id: '801-thermal',
    name: '801 · тепловизор · 9,1 мм',
    type: 'IR',
    status: 'documented',
    supportedModels: ['801'],
    focalLengthMm: 9.1,
    imageWidthPx: 640,
    imageHeightPx: 512,
    source:
      'Геоскан 801, буклет, с. 4: 640×512, f=9,1 мм, 8–14 мкм (тепловой ИК, не Pollux/NIR). Физический размер матрицы не указан. https://download.geoscan.ru/site-files/801/Geoscan_801.pdf?v2',
  },
  {
    id: 'sony-rx1rm2',
    name: 'Sony DSC-RX1RM2 · 35 мм',
    type: 'RGB',
    status: 'documented',
    supportedModels: ['201'],
    sensorWidthMm: 35.9,
    sensorHeightMm: 24,
    imageWidthPx: 7952,
    imageHeightPx: 5304,
    focalLengthMm: 35,
    source:
      'Sony DSC-RX1RM2: 35,9×24,0 мм; 7952×5304; фиксированный объектив 35 мм. Комплектация перечислена в руководстве Геоскан 201. https://www.sony.com/za/electronics/cyber-shot-compact-cameras/dsc-rx1rm2/specifications ; https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf',
  },
  {
    id: 'sony-zv-e10',
    name: 'Sony ZV-E10 · выберите объектив',
    type: 'RGB',
    status: 'documented',
    supportedModels: ['201'],
    sensorWidthMm: 23.5,
    sensorHeightMm: 15.6,
    imageWidthPx: 6000,
    imageHeightPx: 4000,
    source:
      'Sony ZV-E10: 23,5×15,6 мм; 6000×4000. Сменный E-объектив: фокусное нужно указать по установленному объективу. https://www.sony.co.uk/electronics/support/e-mount-body-zv-e-series/zv-e10/specifications ; https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf',
  },
  ...(['r4', 'r6'] as const).map(
    (model): CameraProfile => ({
      id: `riebo-${model}`,
      name: `Riebo ${model.toUpperCase()} · 40 мм`,
      type: 'RGB',
      status: 'documented',
      supportedModels: ['201'],
      focalLengthMm: 40,
      source: `Руководство Геоскан 201: Riebo ${model.toUpperCase()}, ${model === 'r4' ? 45 : 61} Мп, f=40 мм. Точные размеры матрицы и изображения необходимо задать по паспорту установленной камеры. https://download.geoscan.ru/site-files/201/Geoscan_201_Manual.pdf`,
    }),
  ),
];

export function cameraProfilesForModel(
  model: Vehicle['model'],
): CameraProfile[] {
  return structuredClone(
    CAMERA_CATALOG.filter((c) => c.supportedModels.includes(model)),
  );
}

/** Stand operating assumptions are explicit and never promoted to passport data.
 * No unknown optical geometry is filled in here. */
export function modelCameraProfile(id: string): CameraProfile {
  const camera = CAMERA_CATALOG.find((c) => c.id === id);
  if (!camera) throw new Error('Неизвестная камера.');
  return {
    ...structuredClone(camera),
    status: 'assumed',
    minimumIntervalSec: 1,
    shutterSec: 0.001,
    source: `${camera.source} Модельный режим стенда: интервал кадров 1 с, выдержка 1/1000 с; это допущения симуляции, не испытание связки камера–автопилот.`,
  };
}

export function missingCameraFields(camera: CameraProfile): string[] {
  return (
    [
      'sensorWidthMm',
      'sensorHeightMm',
      'imageWidthPx',
      'imageHeightPx',
      'focalLengthMm',
      'minimumIntervalSec',
    ] as const
  ).filter((k) => !camera[k]);
}
