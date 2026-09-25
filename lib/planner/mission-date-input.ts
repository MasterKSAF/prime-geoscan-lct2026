/** Calendar fields are wall time in the mission's zone, never the browser's zone. */
export function missionLocalDate(iso: string, zone: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => p.find((x) => x.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return '';
  }
}

export function missionDateFromLocal(local: string, zone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local))
    throw new Error('Выберите дату и время.');
  const normalized = local.length === 16 ? `${local}:00` : local;
  const nominal = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(nominal)) throw new Error('Некорректная дата.');
  const options = new Set<number>();
  // Observe offsets on both sides of a daylight-saving transition. Reject
  // ambiguous/nonexistent wall times rather than silently selecting an hour.
  for (const hours of [-24, 0, 24]) {
    const sample = nominal + hours * 3600000;
    const formatted = missionLocalDate(new Date(sample).toISOString(), zone);
    if (!formatted) throw new Error('Неизвестный часовой пояс.');
    const offset = Date.parse(`${formatted}Z`) - sample;
    const candidate = nominal - offset;
    if (
      missionLocalDate(new Date(candidate).toISOString(), zone) === normalized
    )
      options.add(candidate);
  }
  if (options.size !== 1)
    throw new Error(
      'Это время отсутствует или неоднозначно в выбранном поясе. Выберите другое время.',
    );
  return new Date([...options][0]).toISOString();
}
