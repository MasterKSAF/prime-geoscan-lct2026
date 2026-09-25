import type { MissionDocument } from './mission-schema.ts';
import { vehiclePlanningEligibility } from './fixed-wing-profile.ts';
import { resolveVehicleCamera } from './camera-profile.ts';

const fromNames = [
  'с севера',
  'с северо-востока',
  'с востока',
  'с юго-востока',
  'с юга',
  'с юго-запада',
  'с запада',
  'с северо-запада',
];
const toNames = [
  'на север',
  'на северо-восток',
  'на восток',
  'на юго-восток',
  'на юг',
  'на юго-запад',
  'на запад',
  'на северо-запад',
];
export function describeMissionWind(speedMps: number, fromDeg: number) {
  if (!Number.isFinite(speedMps) || speedMps < 0 || !Number.isFinite(fromDeg))
    return {
      text: 'Проверьте параметры ветра',
      from: '—',
      to: '—',
      toDeg: 0,
      calm: false,
    };
  const normalized = ((fromDeg % 360) + 360) % 360;
  const toDeg = (normalized + 180) % 360;
  const calm = speedMps === 0;
  const from = fromNames[Math.round(normalized / 45) % 8];
  const to = toNames[Math.round(toDeg / 45) % 8];
  return {
    text: calm
      ? 'Штиль · 0 м/с'
      : `${speedMps.toLocaleString('ru-RU')} м/с · ${from} → ${to}`,
    from,
    to,
    toDeg,
    calm,
  };
}

/** Preliminary capability hints, never a replacement for routing/energy validation. */
export function missionFleetHints(document: MissionDocument, jobId: string) {
  const job = document.jobs.find((j) => j.id === jobId);
  if (!job) return [];
  return document.scenario.vehicles.map((vehicle) => {
    const reasons: string[] = [];
    if (!vehicle.enabled) reasons.push('Исключён оператором');
    const profile = vehiclePlanningEligibility(vehicle);
    if (!profile.supported)
      reasons.push(
        profile.model === 'unsupported-fixed-wing'
          ? `Самолётная модель пока не поддержана. ${profile.reasons.join(' ')}`
          : profile.reasons.join(' '),
      );
    if (!vehicle.jobs.includes(job.job.type))
      reasons.push(`Нет профиля ${job.job.type}`);
    else if (
      job.quality.mode === 'camera' &&
      (vehicle.cameraProfiles !== undefined || vehicle.cameraIds !== undefined)
    ) {
      const camera = resolveVehicleCamera(vehicle, job.job.type);
      if (camera.reason) reasons.push(camera.reason);
    }
    if (document.scenario.wind.speedMps > vehicle.maxWindMps)
      reasons.push(`Ветер выше лимита ${vehicle.maxWindMps} м/с`);
    const batteries = document.batteries.filter(
      (b) => b.vehicleId === vehicle.id,
    );
    if (!batteries.length) reasons.push('Нет батарей');
    const earliest = batteries
      .map((b) => Date.parse(b.readyAt))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    if (earliest !== undefined && earliest >= Date.parse(document.window.end))
      reasons.push('Батареи доступны только после окна работ');
    return {
      vehicleId: vehicle.id,
      name: vehicle.name,
      reasons,
      eligible: reasons.length === 0,
      readyAt: earliest === undefined ? null : new Date(earliest).toISOString(),
    };
  });
}
