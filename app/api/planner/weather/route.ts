import {
  weatherRequestSchema,
  fetchMissionForecast,
} from '@/lib/planner/weather-provider';

export async function GET(request: Request) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const url = new URL(request.url),
    origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    return Response.json(
      { error: 'Недопустимый источник запроса.' },
      { status: 403, headers },
    );
  const input = url.searchParams.get('q') ?? '';
  if (input.length > 40000)
    return Response.json(
      { error: 'Слишком большой запрос.' },
      { status: 413, headers },
    );
  let q;
  try {
    q = weatherRequestSchema.parse(JSON.parse(input));
  } catch {
    return Response.json(
      { error: 'Проверьте координаты и окно миссии.' },
      { status: 400, headers },
    );
  }
  try {
    return Response.json(await fetchMissionForecast(q), { headers });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : 'Не удалось получить прогноз.',
      },
      { status: 422, headers },
    );
  }
}
