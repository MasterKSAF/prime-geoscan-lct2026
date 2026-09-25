'use client';
import { useEffect, useRef, useState } from 'react';
import type { MissionOperation } from '../lib/planner/mission-operations.ts';
import {
  chooseRecordingMime,
  createMissionVideoPainter,
  isMp4Header,
  recordingTerminal,
  VIDEO_LIMIT_BYTES,
  VIDEO_LIMIT_MS,
  videoFilename,
} from '../lib/planner/mission-video.ts';
export type RecordingInfo = {
  status: 'recording' | 'ready' | 'converting' | 'error';
  error?: string;
  // Downloadable, finalized bytes, not unfinished MediaRecorder chunks.
  bytes: number;
};
export function finalizedRecordingBytes(
  blob?: Pick<Blob, 'size'>,
  discarded = false,
): number {
  return !discarded && blob && blob.size > 0 ? blob.size : 0;
}
export function canDownloadRecording(
  recording: RecordingInfo | undefined,
  busy = false,
): boolean {
  return (
    !busy &&
    !!recording &&
    recording.bytes > 0 &&
    !['recording', 'converting'].includes(recording.status)
  );
}
type Frame = { row: MissionOperation; time: number; rate: number };
type Recording = {
  recorder: MediaRecorder;
  canvas: HTMLCanvasElement;
  chunks: Blob[];
  bytes: number;
  started: number;
  blob?: Blob;
  ending?: number;
  failure?: string;
  discarded?: boolean;
  draw: ReturnType<typeof createMissionVideoPainter>;
  row: MissionOperation;
};
export function useMissionRecordings(getFrames: () => Frame[]) {
  const get = useRef(getFrames);
  useEffect(() => {
    get.current = getFrames;
  });
  const all = useRef(new Map<string, Recording>());
  const failed = useRef(new Set<string>());
  const [info, setInfo] = useState<Record<string, RecordingInfo>>({});
  const set = (id: string, value: RecordingInfo) =>
    setInfo((old) => ({ ...old, [id]: value }));
  useEffect(() => {
    const records = all.current;
    const timer = setInterval(() => {
      const frames = get.current(),
        present = new Set(frames.map((f) => f.row.id));
      for (const [id, r] of records)
        if (!present.has(id)) {
          r.discarded = true;
          if (r.recorder.state !== 'inactive') r.recorder.stop();
          r.recorder.stream.getTracks().forEach((t) => t.stop());
          records.delete(id);
          setInfo((old) => {
            const next = { ...old };
            delete next[id];
            return next;
          });
        }
      for (const frame of frames) {
        const { row, time, rate } = frame;
        let record = records.get(row.id);
        try {
          if (
            !record &&
            !failed.current.has(row.id) &&
            row.status === 'running' &&
            records.size < 3
          ) {
            const mime =
              typeof MediaRecorder === 'undefined'
                ? null
                : chooseRecordingMime((t) => MediaRecorder.isTypeSupported(t));
            if (!mime) {
              failed.current.add(row.id);
              set(row.id, {
                status: 'error',
                bytes: 0,
                error:
                  'Браузер не поддерживает запись. Используйте Chrome или Edge.',
              });
              continue;
            }
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const stream = canvas.captureStream(10),
              recorder = new MediaRecorder(stream, {
                mimeType: mime,
                videoBitsPerSecond: 1_400_000,
              });
            record = {
              recorder,
              canvas,
              chunks: [],
              bytes: 0,
              started: performance.now(),
              draw: createMissionVideoPainter(row),
              row,
            };
            const r = record;
            records.set(row.id, r);
            recorder.ondataavailable = (e) => {
              if (e.data.size) {
                r.chunks.push(e.data);
                r.bytes += e.data.size;
              }
            };
            recorder.onerror = () => {
              r.failure =
                'Ошибка записи видео. Выполнение миссии продолжается.';
              set(row.id, {
                status: 'error',
                bytes: finalizedRecordingBytes(r.blob, r.discarded),
                error: r.failure,
              });
            };
            recorder.onstop = () => {
              stream.getTracks().forEach((t) => t.stop());
              if (r.discarded) return;
              r.blob = new Blob(r.chunks, { type: recorder.mimeType });
              r.chunks = [];
              set(row.id, {
                status: r.failure || !r.bytes ? 'error' : 'ready',
                bytes: finalizedRecordingBytes(r.blob, r.discarded),
                error:
                  r.failure ??
                  (!r.bytes
                    ? 'Запись пуста.'
                    : r.bytes >= VIDEO_LIMIT_BYTES ||
                        performance.now() - r.started >= VIDEO_LIMIT_MS
                      ? 'Достигнут лимит записи; сохранён доступный фрагмент.'
                      : undefined),
              });
            };
            r.draw(canvas.getContext('2d')!, row, time, rate);
            recorder.start(1000);
            set(row.id, { status: 'recording', bytes: 0 });
          }
          if (!record || record.recorder.state === 'inactive') continue;
          record.row = row;
          record.draw(record.canvas.getContext('2d')!, row, time, rate);
          if (recordingTerminal(row) && !record.ending)
            record.ending = performance.now() + 900;
          if (
            record.bytes >= VIDEO_LIMIT_BYTES ||
            performance.now() - record.started > VIDEO_LIMIT_MS ||
            (record.ending && performance.now() >= record.ending)
          )
            record.recorder.stop();
        } catch (e) {
          failed.current.add(row.id);
          if (record)
            record.failure =
              e instanceof Error ? e.message : 'Не удалось записать видео.';
          if (record?.recorder.state === 'recording') record.recorder.stop();
          set(row.id, {
            status: 'error',
            bytes: finalizedRecordingBytes(record?.blob, record?.discarded),
            error:
              e instanceof Error ? e.message : 'Не удалось записать видео.',
          });
        }
      }
    }, 100);
    return () => {
      clearInterval(timer);
      records.forEach((r) => {
        r.discarded = true;
        if (r.recorder.state !== 'inactive') r.recorder.stop();
        r.recorder.stream.getTracks().forEach((t) => t.stop());
      });
      records.clear();
    };
  }, []);
  async function download(id: string) {
    const r = all.current.get(id);
    if (!r?.blob || !finalizedRecordingBytes(r.blob, r.discarded))
      throw Error('Запись ещё выполняется. Завершите или остановите миссию.');
    try {
      if (
        !isMp4Header(new Uint8Array(await r.blob.slice(0, 12).arrayBuffer()))
      ) {
        set(id, {
          status: 'converting',
          bytes: finalizedRecordingBytes(r.blob, r.discarded),
        });
        const response = await fetch('/api/planner/video/mp4', {
          method: 'POST',
          headers: { 'Content-Type': 'video/webm' },
          body: r.blob,
          signal: AbortSignal.timeout(120000),
        });
        if (!response.ok)
          throw Error(
            ((await response.json()) as { error?: string }).error ??
              'Не удалось преобразовать MP4.',
          );
        r.blob = await response.blob();
      }
      if (!isMp4Header(new Uint8Array(await r.blob.slice(0, 12).arrayBuffer())))
        throw Error('Сервис вернул файл не в формате MP4.');
      const url = URL.createObjectURL(r.blob),
        a = document.createElement('a');
      a.href = url;
      a.download = videoFilename(r.row);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      set(id, { status: 'ready', bytes: r.blob.size });
    } catch (e) {
      set(id, {
        status: 'error',
        bytes: finalizedRecordingBytes(r.blob, r.discarded),
        error: e instanceof Error ? e.message : 'Не удалось скачать MP4.',
      });
      throw e;
    }
  }
  function forget(id: string) {
    const r = all.current.get(id);
    if (r) {
      r.discarded = true;
      if (r.recorder.state !== 'inactive') r.recorder.stop();
      r.recorder.stream.getTracks().forEach((t) => t.stop());
    }
    all.current.delete(id);
    failed.current.delete(id);
    setInfo((old) => {
      const next = { ...old };
      delete next[id];
      return next;
    });
  }
  return { info, download, forget };
}
