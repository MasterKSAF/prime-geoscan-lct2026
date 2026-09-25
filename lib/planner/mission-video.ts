import type { MissionOperation } from './mission-operations.ts';
import type { Coordinate, Segment } from './schema.ts';
import { projection } from './geometry.ts';
import { positionAt } from './mission-validation.ts';
import { obstacleFootprints } from './obstacle-layer.ts';
import { recoveryOptions } from './mission-safety.ts';
import { vehicleMapLabel } from './mission-vehicle-label.ts';

export const VIDEO_LIMIT_BYTES = 96 * 1024 * 1024;
export const VIDEO_LIMIT_MS = 30 * 60 * 1000;
export const recordingTerminal = (r: MissionOperation) =>
  ['completed', 'cancelled'].includes(r.status) ||
  (!!r.safety && ['landed', 'blocked', 'crashed'].includes(r.safety.stage));
export const videoFilename = (r: Pick<MissionOperation, 'id' | 'document'>) =>
  `${r.document.id}.${r.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
export function chooseRecordingMime(supports: (type: string) => boolean) {
  return (
    [
      'video/mp4;codecs=avc1.42001E',
      'video/mp4',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find(supports) ?? null
  );
}
export function isMp4Header(data: Uint8Array) {
  return (
    data.length >= 12 && String.fromCharCode(...data.slice(4, 8)) === 'ftyp'
  );
}
const colors = ['#176ab8', '#ba690a', '#7751bd', '#167960', '#ba4668'];
const clock = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;

/** Self-contained mission map. No desktop capture, third-party tiles or microphone. */
export function createMissionVideoPainter(initial: MissionOperation) {
  const d = initial.document,
    c = initial.candidate;
  const proj = projection(d.scenario.area.coordinates[0][0]);
  const obstacles = [
    ...d.scenario.exclusions,
    ...d.restrictions.map((r) => r.geometry),
    ...obstacleFootprints(d),
  ];
  const coords = [
    ...c.sorties.flatMap((s) => s.segments.flatMap((g) => [g.from, g.to])),
    ...d.jobs.flatMap((j) => j.area.coordinates.flat()),
  ];
  const points = coords.map(proj.forward);
  const minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1])),
    maxY = Math.max(...points.map((p) => p[1]));
  const scale = Math.min(
    800 / Math.max(100, maxX - minX),
    480 / Math.max(100, maxY - minY),
  );
  const xy = (point: Coordinate): Coordinate => {
    const p = proj.forward(point);
    return [
      450 + (p[0] - (minX + maxX) / 2) * scale,
      385 - (p[1] - (minY + maxY) / 2) * scale,
    ];
  };
  let recoveryKey = '',
    recovery: ReturnType<typeof recoveryOptions> = [];
  return (
    ctx: CanvasRenderingContext2D,
    row: MissionOperation,
    modelTime: number,
    rate: number,
  ) => {
    const safety = row.safety;
    if (safety) {
      const key = JSON.stringify([
        safety.id,
        safety.delaySec,
        safety.windMps,
        safety.batteryPct,
      ]);
      if (key !== recoveryKey) {
        recovery = recoveryOptions(d, c, safety);
        recoveryKey = key;
      }
    }
    const option = recovery.find((o) => o.policy === safety?.policy);
    const flights = safety && option?.valid ? option.sorties : c.sorties;
    const t =
      safety && !['returning', 'landed'].includes(safety.stage)
        ? safety.modelTimeSec
        : modelTime;
    ctx.fillStyle = '#eef3f8';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#142b48';
    ctx.fillRect(0, 0, 1280, 92);
    ctx.fillStyle = '#bfe5ff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('Planner · Модельная симуляция', 24, 37);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText(d.name.slice(0, 80), 24, 71);
    ctx.fillStyle = '#fff';
    ctx.fillRect(20, 112, 860, 558);
    ctx.fillRect(900, 112, 360, 558);
    ctx.save();
    ctx.beginPath();
    ctx.rect(20, 112, 860, 558);
    ctx.clip();
    const line = (
      ring: Coordinate[],
      color: string,
      width = 2,
      fill?: string,
    ) => {
      ctx.beginPath();
      ring.forEach((p, i) => {
        const [x, y] = xy(p);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      if (fill) {
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    d.jobs.forEach((j) =>
      j.area.coordinates.forEach((r) => line(r, '#659bd0', 1, '#e9f2ff')),
    );
    obstacles.forEach((o) =>
      o.coordinates.forEach((r) => line(r, '#a7792b', 2, '#ead1a0aa')),
    );
    c.sorties.forEach((s, i) =>
      s.segments.forEach((seg) =>
        line([seg.from, seg.to], colors[i % colors.length] + '55', 1),
      ),
    );
    d.scenario.vehicles.forEach((v, i) => {
      const [x, y] = xy(v.start);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.strokeStyle = '#243d58';
      ctx.strokeRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#243d58';
      ctx.font = '13px Arial';
      ctx.fillText(`База ${i + 1}`, x + 9, y + 4);
    });
    const used = [...new Set(c.sorties.map((s) => s.vehicleId))];
    const states: {
      label: string;
      battery: number;
      phase: string;
      color: string;
    }[] = [];
    used.forEach((id, i) => {
      const own = flights
        .filter((s) => s.vehicleId === id)
        .flatMap((s) => s.segments);
      const fallback = c.sorties
        .filter((s) => s.vehicleId === id)
        .flatMap((s) => s.segments);
      const segments = own.length ? own : fallback;
      const seg =
        segments.find((s) => s.startSec <= t && t < s.endSec) ??
        [...segments].reverse().find((s) => s.endSec <= t) ??
        segments[0];
      if (!seg) return;
      const pos = positionAt(seg, t);
      const v = d.scenario.vehicles.find((v) => v.id === id)!;
      const color = colors[i % colors.length];
      for (const s of segments)
        if (s.startSec < t)
          line([s.from, positionAt(s, t).coordinate], color, 3);
      const [x, y] = xy(pos.coordinate);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 13px Arial';
      ctx.fillStyle = '#163553';
      ctx.fillText(vehicleMapLabel(v, i), x + 11, y - 7);
      states.push({
        label: vehicleMapLabel(v, i),
        battery: pos.batteryPct,
        color,
        phase:
          pos.altitudeM < 0.1
            ? 'На базе'
            : (
                {
                  takeoff: 'Взлёт',
                  survey: 'Съёмка',
                  return: 'Возврат',
                  landing: 'Посадка',
                  transit: 'Переход',
                  turn: 'Манёвр',
                } as Record<Segment['phase'], string>
              )[seg.phase],
      });
    });
    ctx.restore();
    const text = (value: string, y: number, size = 18, color = '#193c60') => {
      ctx.font = `${size}px Arial`;
      ctx.fillStyle = color;
      ctx.fillText(value, 918, y);
    };
    text(`${clock(modelTime)} · ускорение ×${rate}`, 149, 22);
    const status = safety
      ? {
          pending: 'Ожидание решения',
          returning: 'Защитный возврат',
          landed: 'Возврат завершён',
          blocked: 'Автовозврат невозможен',
          crashed: 'Аварийная остановка',
        }[safety.stage]
      : {
          running: 'Миссия выполняется',
          paused: 'Пауза',
          completed: 'Миссия завершена',
          scheduled: 'В плане',
          cancelled: 'Миссия остановлена',
        }[row.status];
    text(status, 184, 19, safety ? '#825407' : '#17634c');
    text(`Ветер ${safety?.windMps ?? d.scenario.wind.speedMps} м/с`, 215, 17);
    states.forEach((s, i) => {
      text(s.label, 265 + i * 64, 19, s.color);
      text(`${s.phase} · заряд ${s.battery.toFixed(0)}%`, 290 + i * 64, 16);
    });
    if (safety) {
      text('Событие записано в журнал', 570, 16);
      text('Исходный план прерван', 594, 16);
    }
    ctx.font = '12px Arial';
    ctx.fillStyle = '#435b72';
    ctx.fillText(`Запуск: ${row.id}`, 24, 695);
    ctx.fillText(
      `План: ${row.planHash.slice(0, 16)} · 2D-схема по координатам · без реальной телеметрии`,
      545,
      695,
    );
  };
}
