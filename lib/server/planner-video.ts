import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const LIMIT = 96 * 1024 * 1024;
let busy = false;
/** Local-only bounded transcoder: no supplied paths, URLs, shell or external protocols. */
export async function handlePlannerVideo(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const fail = (code: number, error: string) => {
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ error }));
    }
    req.resume();
  };
  if (req.method !== 'POST') {
    fail(405, 'Нужен POST с видео WebM.');
    return;
  }
  try {
    if (
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    ) {
      fail(403, 'Разрешён только запрос со стенда.');
      return;
    }
  } catch {
    fail(403, 'Некорректный Origin.');
    return;
  }
  if (!/^video\/webm(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
    fail(415, 'Принимается запись WebM.');
    return;
  }
  if (Number(req.headers['content-length']) > LIMIT) {
    fail(413, 'Видео больше 96 МиБ.');
    return;
  }
  if (busy) {
    fail(
      429,
      'Уже готовится другое видео. Повторите скачивание после завершения.',
    );
    return;
  }
  busy = true;
  let dir: string | undefined;
  const uploadTimeout = () => req.destroy();
  let uploading = true;
  const finishUpload = () => {
    if (!uploading) return;
    uploading = false;
    req.setTimeout(0);
    req.off('timeout', uploadTimeout);
  };
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    req.setTimeout(30000, uploadTimeout);
    for await (const part of req) {
      size += part.length;
      if (size > LIMIT) {
        fail(413, 'Видео больше 96 МиБ.');
        return;
      }
      chunks.push(part);
    }
    // IncomingMessage.setTimeout configures the shared socket, not just body
    // consumption. Once uploaded, conversion has its own 90-second deadline.
    finishUpload();
    const input = Buffer.concat(chunks);
    if (input.length < 4 || input.readUInt32BE(0) !== 0x1a45dfa3) {
      fail(400, 'Это не запись WebM.');
      return;
    }
    dir = await mkdtemp(join(tmpdir(), 'planner-video-'));
    const source = join(dir, 'recording.webm'),
      target = join(dir, 'recording.mp4');
    await writeFile(source, input);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          source,
          '-map',
          '0:v:0',
          '-an',
          '-t',
          '1800',
          '-vf',
          // MediaRecorder WebM may advertise a 1/1000 time base. Resample by
          // timestamps before scaling; never encode 1000 duplicate fps.
          'fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '25',
          '-pix_fmt',
          'yuv420p',
          '-threads',
          '2',
          '-fs',
          String(LIMIT),
          '-movflags',
          '+faststart',
          target,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
      );
      let error = '';
      child.stderr.on('data', (b) => {
        error = (error + b.toString()).slice(-1000);
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('Подготовка видео превысила 90 секунд.'));
      }, 90000);
      const close = () => {
        if (!res.writableEnded) child.kill();
      };
      res.once('close', close);
      child.on('error', () => {
        clearTimeout(timer);
        res.off('close', close);
        reject(Error('FFmpeg недоступен. Запустите обновлённый Docker-стенд.'));
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        res.off('close', close);
        if (code === 0) resolve();
        else
          reject(Error('Не удалось прочитать видео: ' + error.slice(0, 180)));
      });
    });
    const bytes = await readFile(target);
    if (bytes.subarray(4, 8).toString() !== 'ftyp')
      throw Error('Неверный формат результата.');
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(bytes);
  } catch (e) {
    fail(422, e instanceof Error ? e.message : 'Ошибка преобразования видео.');
  } finally {
    finishUpload();
    busy = false;
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
