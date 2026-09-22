import { ZodError } from 'zod';
import {
  analyzeMissionRobustness,
  MAX_ROBUSTNESS_REQUEST_BYTES,
} from '@/lib/planner/mission-robustness';
import { parseStructuredText } from '@/lib/planner/mission-io';

let active = false;
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    void request.body?.cancel().catch(() => {});
    return Response.json(
      { code: 'ORIGIN', error: 'Недопустимый источник запроса.' },
      { status: 403, headers },
    );
  }
  if (
    (request.headers.get('content-type') ?? '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase() !== 'application/json'
  ) {
    void request.body?.cancel().catch(() => {});
    return Response.json(
      { code: 'TYPE', error: 'API принимает только application/json.' },
      { status: 415, headers },
    );
  }
  if (active) {
    void request.body?.cancel().catch(() => {});
    return Response.json(
      { code: 'BUSY', error: 'Другая стресс-проверка ещё выполняется.' },
      { status: 429, headers: { ...headers, 'Retry-After': '3' } },
    );
  }
  active = true;
  const reader = request.body?.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completed = false;
  try {
    if (!reader) throw new SyntaxError('Пустой запрос.');
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('BODY_TIMEOUT')), 5000);
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) {
        completed = true;
        break;
      }
      size += part.value.byteLength;
      if (size > MAX_ROBUSTNESS_REQUEST_BYTES)
        return Response.json(
          { code: 'SIZE', error: 'Стресс-запрос больше 2 МиБ.' },
          { status: 413, headers },
        );
      chunks.push(part.value);
    }
    clearTimeout(timer);
    if (request.signal.aborted)
      return Response.json(
        { code: 'CANCELLED', error: 'Запрос отменён.' },
        { status: 499, headers },
      );
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let value: unknown;
    try {
      value = parseStructuredText(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        'json',
        MAX_ROBUSTNESS_REQUEST_BYTES,
      );
    } catch {
      throw new SyntaxError('Некорректный JSON.');
    }
    return Response.json(await analyzeMissionRobustness(value), { headers });
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        {
          code: 'SCHEMA',
          error: 'Некорректный или слишком сложный стресс-запрос.',
          details: error.issues
            .slice(0, 20)
            .map((x) => `${x.path.join('.')}: ${x.message}`),
        },
        { status: 400, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { code: 'JSON', error: error.message },
        { status: 400, headers },
      );
    if (error instanceof Error && error.message === 'BODY_TIMEOUT')
      return Response.json(
        { code: 'TIMEOUT', error: 'Превышено время передачи задания.' },
        { status: 408, headers },
      );
    return Response.json(
      {
        code: 'ANALYSIS',
        error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Не удалось проверить план.',
      },
      { status: 422, headers },
    );
  } finally {
    clearTimeout(timer);
    active = false;
    if (reader) {
      if (!completed) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
