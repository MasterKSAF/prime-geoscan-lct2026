import { solveMissionDocument } from '@/lib/planner/mission-engine';
import {
  parseMissionDocument,
  MAX_MISSION_FILE_BYTES,
} from '@/lib/planner/mission-schema';
import {
  canonicalMissionJson,
  checkTextSize,
  parseStructuredText,
} from '@/lib/planner/mission-io';
import { ZodError } from 'zod';

let active = false;
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

async function discardRejectedBody(request: Request): Promise<void> {
  // In the local Wrangler proxy, replying while a small POST body is unread can
  // close the downstream keepalive connection and break the next request. Drain
  // ordinary rejected bodies without parsing or buffering them. Stop requesting
  // chunks at 200 KiB or 5 seconds, then cancel (the runtime's final chunk may
  // cross the byte boundary). Malformed,
  // oversized or stalled uploads must not delay rejection without a bound. This
  // mitigates the ordinary early-return case; cancellation can still expose the
  // local runtime's transport bug. It must never change the original HTTP error.
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  try {
    reader = request.body?.getReader();
    if (!reader) return;
    const deadlineAt = Date.now() + 5000;
    const deadline = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), 5000);
    });
    let size = 0;
    while (size < MAX_MISSION_FILE_BYTES && Date.now() < deadlineAt) {
      const part = await Promise.race([reader.read(), deadline]);
      if (!part) break;
      if (part.done) {
        ended = true;
        break;
      }
      size += part.value.byteLength;
    }
  } catch {
    // An unreadable or already locked body does not override ORIGIN/TYPE/BUSY.
  } finally {
    clearTimeout(timer);
    if (reader) {
      // A custom/network cancellation may itself never settle. Do not await it
      // beyond the deadline; attach a handler and release the stream lock.
      if (!ended) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    await discardRejectedBody(request);
    return Response.json(
      { code: 'ORIGIN', error: 'Недопустимый источник запроса.' },
      { status: 403, headers },
    );
  }
  if (active) {
    await discardRejectedBody(request);
    return Response.json(
      {
        code: 'BUSY',
        error: 'Другой расчёт ещё выполняется. Повторите позже.',
      },
      { status: 429, headers: { ...headers, 'Retry-After': '3' } },
    );
  }
  const type = request.headers.get('content-type') ?? '';
  if (type.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    await discardRejectedBody(request);
    return Response.json(
      { code: 'TYPE', error: 'API принимает только application/json.' },
      { status: 415, headers },
    );
  }
  active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reader = request.body?.getReader();
  try {
    if (!reader) throw new SyntaxError('Пустой запрос.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void reader.cancel().catch(() => {});
        reject(new Error('BODY_TIMEOUT'));
      }, 5000);
    });
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.length;
      if (size > MAX_MISSION_FILE_BYTES) {
        await reader.cancel();
        return Response.json(
          { code: 'SIZE', error: 'Задание больше 200 КиБ.' },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    clearTimeout(timer);
    timer = undefined;
    if (request.signal.aborted)
      return Response.json(
        { code: 'CANCELLED', error: 'Запрос отменён.' },
        { status: 499, headers },
      );
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let value: unknown;
    try {
      value = parseStructuredText(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        'json',
      );
    } catch {
      // Match file import's duplicate-key and unsafe-tree checks, before solving.
      throw new SyntaxError('Некорректный JSON.');
    }
    // This endpoint remains v2-only; file import's v1 migration is not implicit.
    const input = parseMissionDocument(value);
    try {
      checkTextSize(canonicalMissionJson(input));
    } catch {
      return Response.json(
        { code: 'SIZE', error: 'Нормализованное задание больше 200 КиБ.' },
        { status: 413, headers },
      );
    }
    const result = await solveMissionDocument(input);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        {
          code: 'SCHEMA',
          error: 'Некорректное задание.',
          details: error.issues
            .slice(0, 30)
            .map((x) => `${x.path.join('.')}: ${x.message}`),
        },
        { status: 400, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { code: 'JSON', error: 'Некорректный JSON.' },
        { status: 400, headers },
      );
    if (error instanceof Error && error.message === 'BODY_TIMEOUT')
      return Response.json(
        { code: 'TIMEOUT', error: 'Превышено время передачи задания.' },
        { status: 408, headers },
      );
    return Response.json(
      {
        code: 'MISSION',
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось рассчитать миссию.',
      },
      { status: 422, headers },
    );
  } finally {
    clearTimeout(timer);
    active = false;
    reader?.releaseLock();
  }
}
