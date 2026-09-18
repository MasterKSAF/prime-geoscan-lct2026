import { solve, PlanningError } from '@/lib/planner/engine';
import { ZodError } from 'zod';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  // Same-origin browser API. No authentication or public hosting is implied.
  const origin = request.headers.get('origin');
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Пустой запрос.');
    let size = 0;
    const chunks: Uint8Array[] = [];
    // Drain modest over-limit requests without retaining them. Returning with an unread
    // body can abort the development proxy's response stream. Public ingress needs its
    // own hard body/time limits; this endpoint is a loopback-only engineering stand.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size <= 200000) chunks.push(value);
      if (size > 1048576) {
        await reader.cancel();
        return Response.json(
          { error: 'Сценарий больше 200 КБ.', code: 'SIZE' },
          { status: 413, headers },
        );
      }
    }
    if (size > 200000)
      return Response.json(
        { error: 'Сценарий больше 200 КБ.', code: 'SIZE' },
        { status: 413, headers },
      );
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: 'Недопустимый источник запроса.', code: 'ORIGIN' },
        { status: 403, headers },
      );
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const input = JSON.parse(new TextDecoder().decode(bytes));
    const plan = solve(input);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(plan.scenario)),
    );
    const inputHash = Array.from(new Uint8Array(digest))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    return Response.json(
      { ...plan, inputHash, createdAt: new Date().toISOString() },
      { headers },
    );
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        {
          code: 'SCHEMA',
          error: 'Некорректные входные данные.',
          details: error.issues.map((x) => `${x.path.join('.')}: ${x.message}`),
        },
        { status: 400, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { code: 'JSON', error: 'Некорректный JSON.' },
        { status: 400, headers },
      );
    return Response.json(
      {
        code: error instanceof PlanningError ? error.code : 'GEOMETRY',
        error: error instanceof Error ? error.message : 'Расчёт не выполнен.',
      },
      { status: 422, headers },
    );
  }
}
