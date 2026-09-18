import { parseMissionDocument } from './mission-schema.ts';
import type { MissionDocument } from './mission-schema.ts';
import {
  assertSafeTree,
  canonicalMissionJson,
  parseStructuredText,
  serializeMissionJson,
} from './mission-io.ts';

export const MAX_SAVED_MISSIONS = 50;
export const MAX_LIBRARY_BACKUP_BYTES = 10 * 1024 * 1024;
const STORE = 'missions';
const BACKUP_VERSION = 'prime-mission-library/1';
const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));

export type SavedMission = {
  id: string;
  revision: number;
  savedAt: string;
  archived: boolean;
  document: MissionDocument;
};
export type MissionLibraryOptions = {
  dbName?: string;
  indexedDB?: IDBFactory;
  now?: () => Date;
};

function friendlyError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError')
      return new Error(
        'Место в браузере закончилось. Выгрузите резервную копию; предыдущие записи сохранены.',
      );
    if (error.name === 'SecurityError' || error.name === 'InvalidStateError')
      return new Error(
        'Локальное хранилище недоступно. Проверьте режим браузера и сохраните задачу в файл.',
      );
    return error;
  }
  return new Error('Ошибка локальной библиотеки. Сохраните задачу в файл.');
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(friendlyError(req.error));
  });
}

function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        friendlyError(tx.error ?? new Error('Изменения библиотеки отменены.')),
      );
    tx.onerror = () => {
      /* onabort resolves the transaction-level failure once. */
    };
  });
}

function parseSaved(value: unknown): SavedMission {
  assertSafeTree(value);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Повреждена запись библиотеки.');
  const r = value as Record<string, unknown>;
  if (
    Object.keys(r).some(
      (k) => !['id', 'revision', 'savedAt', 'archived', 'document'].includes(k),
    ) ||
    typeof r.id !== 'string' ||
    !Number.isSafeInteger(r.revision) ||
    (r.revision as number) < 1 ||
    !validTimestamp(r.savedAt) ||
    typeof r.archived !== 'boolean'
  )
    throw new Error('Неверный формат записи библиотеки.');
  const document = parseMissionDocument(r.document);
  serializeMissionJson(document);
  if (document.id !== r.id)
    throw new Error('ID записи не совпадает с ID задачи.');
  return {
    id: r.id,
    revision: r.revision as number,
    savedAt: r.savedAt,
    archived: r.archived,
    document,
  };
}

function nextRevision(revision: number): number {
  if (revision >= Number.MAX_SAFE_INTEGER)
    throw new Error(
      'Достигнут предел ревизий. Запись не изменена; сохраните задачу как копию с новым ID.',
    );
  return revision + 1;
}

/** Browser-local only. No HTTP requests, cloud sync, hidden deletion or automatic overwrite. */
export function createMissionLibrary(options: MissionLibraryOptions = {}) {
  let openPromise: Promise<IDBDatabase> | undefined;
  let activeDb: IDBDatabase | undefined;
  let generation = 0;
  const now = options.now ?? (() => new Date());

  function open(): Promise<IDBDatabase> {
    if (openPromise) return openPromise;
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory)
      return Promise.reject(
        new Error('IndexedDB недоступен. Используйте импорт и экспорт файлов.'),
      );
    const currentGeneration = generation;
    openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(options.dbName ?? 'prime-planner-missions', 1);
      let failed = false;
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE))
          db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onblocked = () => {
        failed = true;
        reject(
          new Error(
            'Обновление библиотеки заблокировано другой вкладкой. Закройте старую вкладку и повторите.',
          ),
        );
      };
      req.onerror = () => {
        failed = true;
        reject(friendlyError(req.error));
      };
      req.onsuccess = () => {
        const db = req.result;
        if (failed) {
          db.close();
          return;
        }
        if (currentGeneration !== generation) {
          db.close();
          reject(new Error('Открытие библиотеки отменено.'));
          return;
        }
        activeDb = db;
        db.onversionchange = () => {
          db.close();
          activeDb = undefined;
          openPromise = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      openPromise = undefined;
      throw friendlyError(error);
    });
    return openPromise;
  }

  async function get(id: string): Promise<SavedMission | null> {
    const db = await open();
    const tx = db.transaction(STORE, 'readonly');
    const done = completion(tx);
    try {
      const value = await request(tx.objectStore(STORE).get(id));
      await done;
      return value === undefined ? null : parseSaved(value);
    } catch (error) {
      await done.catch(() => undefined);
      throw friendlyError(error);
    }
  }

  async function list(includeArchived = false): Promise<SavedMission[]> {
    const db = await open();
    const tx = db.transaction(STORE, 'readonly');
    const done = completion(tx);
    try {
      const values: unknown[] = await request(tx.objectStore(STORE).getAll());
      await done;
      if (values.length > MAX_SAVED_MISSIONS)
        throw new Error(
          'Библиотека превышает поддержанный лимит. Автоматическое удаление не выполняется.',
        );
      return values
        .map(parseSaved)
        .filter((r) => includeArchived || !r.archived)
        .sort(
          (a, b) =>
            b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id),
        );
    } catch (error) {
      await done.catch(() => undefined);
      throw friendlyError(error);
    }
  }

  async function save(
    document: MissionDocument,
    opts: { expectedRevision?: number } = {},
  ): Promise<SavedMission> {
    // Validate and clone before entering the atomic read-modify-write transaction.
    const clean = parseMissionDocument(
      JSON.parse(canonicalMissionJson(document)),
    );
    serializeMissionJson(clean);
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const done = completion(tx);
    const store = tx.objectStore(STORE);
    try {
      const existingValue = await request(store.get(clean.id));
      const existing =
        existingValue === undefined ? null : parseSaved(existingValue);
      if (existing && opts.expectedRevision !== existing.revision)
        throw new Error(
          'Такая задача уже сохранена или изменена в другой вкладке. Подтвердите замену актуальной версии либо сохраните копию с новым ID.',
        );
      if (!existing && opts.expectedRevision !== undefined)
        throw new Error(
          'Сохранённая версия исчезла. Повторно откройте библиотеку; перезапись не выполнена.',
        );
      if (!existing && (await request(store.count())) >= MAX_SAVED_MISSIONS)
        throw new Error(
          `Лимит библиотеки — ${MAX_SAVED_MISSIONS} записей, включая архив. Выгрузите резервную копию; ничего не удалено.`,
        );
      const saved: SavedMission = {
        id: clean.id,
        revision: nextRevision(existing?.revision ?? 0),
        savedAt: now().toISOString(),
        archived: false,
        document: clean,
      };
      await request(store.put(saved));
      await done;
      return saved;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* It may already have aborted on quota failure. */
      }
      await done.catch(() => undefined);
      throw friendlyError(error);
    }
  }

  async function archive(id: string, expectedRevision: number): Promise<void> {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const done = completion(tx);
    const store = tx.objectStore(STORE);
    try {
      const value = await request(store.get(id));
      if (value === undefined) throw new Error('Задача не найдена.');
      const existing = parseSaved(value);
      if (existing.revision !== expectedRevision)
        throw new Error(
          'Версия изменилась. Архивирование не выполнено; обновите список.',
        );
      await request(
        store.put({
          ...existing,
          revision: nextRevision(existing.revision),
          archived: true,
          savedAt: now().toISOString(),
        }),
      );
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* No commit after transaction error. */
      }
      await done.catch(() => undefined);
      throw friendlyError(error);
    }
  }

  async function exportBackup(): Promise<string> {
    const text =
      JSON.stringify(
        {
          format: BACKUP_VERSION,
          exportedAt: now().toISOString(),
          entries: await list(true),
        },
        null,
        2,
      ) + '\n';
    if (new TextEncoder().encode(text).length > MAX_LIBRARY_BACKUP_BYTES)
      throw new Error(
        'Резервная копия больше 10 МиБ. Выгрузите задачи отдельными файлами.',
      );
    return text;
  }

  async function importBackup(text: string): Promise<number> {
    const raw = parseStructuredText(text, 'json', MAX_LIBRARY_BACKUP_BYTES);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Неверная резервная копия.');
    const backup = raw as Record<string, unknown>;
    if (
      Object.keys(backup).some(
        (k) => !['format', 'exportedAt', 'entries'].includes(k),
      ) ||
      backup.format !== BACKUP_VERSION ||
      !validTimestamp(backup.exportedAt) ||
      !Array.isArray(backup.entries) ||
      backup.entries.length > MAX_SAVED_MISSIONS
    )
      throw new Error('Неподдержанная версия или размер резервной копии.');
    const entries = backup.entries.map(parseSaved);
    if (new Set(entries.map((r) => r.id)).size !== entries.length)
      throw new Error('Резервная копия содержит повторяющиеся ID.');
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const done = completion(tx);
    const store = tx.objectStore(STORE);
    try {
      const existing: unknown[] = await request(store.getAllKeys());
      if (existing.length + entries.length > MAX_SAVED_MISSIONS)
        throw new Error(
          `После импорта будет превышен лимит ${MAX_SAVED_MISSIONS} записей. Ничего не изменено.`,
        );
      if (entries.some((r) => existing.includes(r.id)))
        throw new Error(
          'Есть совпадающие ID. Копия не загружена; существующие задачи не перезаписаны.',
        );
      for (const entry of entries) await request(store.add(entry));
      await done;
      return entries.length;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Keep the whole import atomic. */
      }
      await done.catch(() => undefined);
      throw friendlyError(error);
    }
  }

  function close(): void {
    generation++;
    activeDb?.close();
    activeDb = undefined;
    openPromise = undefined;
  }

  return { get, list, save, archive, exportBackup, importBackup, close };
}

export type MissionLibrary = ReturnType<typeof createMissionLibrary>;
