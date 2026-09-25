/** Visual-only interpolation between confirmed model times. Never predicts
 * beyond the latest tick and never interpolates coordinates across turns. */
export function playbackFrameTime(
  from: number,
  to: number,
  elapsedMs: number,
  rate: number,
  playing: boolean,
): number {
  if (!playing || to <= from || !Number.isFinite(rate) || rate <= 0) return to;
  const duration = Math.min(200, Math.max(16, ((to - from) / rate) * 1000));
  return from + (to - from) * Math.max(0, Math.min(1, elapsedMs / duration));
}
