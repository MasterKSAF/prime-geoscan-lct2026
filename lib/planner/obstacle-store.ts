import { obstacleSourceSchema, type ObstacleSource } from './obstacle-layer.ts';
type SavedLayer = { hash: string; source: ObstacleSource; savedAt: string };
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('prime-obstacle-catalog', 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore('layers', { keyPath: 'hash' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(new Error('Каталог слоёв занят другой вкладкой.'));
  });
}
export async function listObstacleSources(): Promise<SavedLayer[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('layers').objectStore('layers').getAll();
      r.onsuccess = () => {
        try {
          resolve(
            (r.result as SavedLayer[])
              .map((row) => ({
                ...row,
                source: obstacleSourceSchema.parse(row.source),
              }))
              .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
          );
        } catch (e) {
          reject(e);
        }
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function saveObstacleSource(
  source: ObstacleSource,
): Promise<string> {
  obstacleSourceSchema.parse(source);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(source.sourceText),
      ),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('layers', 'readwrite'),
        store = tx.objectStore('layers'),
        request = store.getAllKeys();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          new Error(
            'Не удалось сохранить слой: проверьте доступное место и лимит 10 слоёв. Миссия не изменена.',
          ),
        );
      request.onsuccess = () => {
        if (request.result.length >= 10 && !request.result.includes(hash)) {
          tx.abort();
          return;
        }
        store.put({ hash, source, savedAt: new Date().toISOString() });
      };
    });
    return hash;
  } finally {
    db.close();
  }
}
