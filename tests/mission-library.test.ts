import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { demoScenario } from '../lib/planner/demo.ts';
import { migrateScenario } from '../lib/planner/mission-schema.ts';
import {
  createMissionLibrary,
  MAX_SAVED_MISSIONS,
} from '../lib/planner/mission-library.ts';
import { missionContentHash } from '../lib/planner/mission-io.ts';

const doc = (id = 'library-test') => migrateScenario(demoScenario(), id);
const library = () =>
  createMissionLibrary({
    indexedDB: new IDBFactory(),
    now: () => new Date('2026-09-17T12:00:00Z'),
  });

void test('library saves clone, list/get persist normalized v2 and stable hash', async () => {
  const lib = library();
  try {
    const original = doc();
    const saved = await lib.save(original);
    original.name = 'Mutated after save';
    assert.equal(saved.revision, 1);
    assert.equal(saved.savedAt, '2026-09-17T12:00:00.000Z');
    assert.equal((await lib.list()).length, 1);
    const restored = await lib.get(saved.id);
    assert.ok(restored);
    assert.equal(restored.document.name, doc().name);
    assert.equal(
      await missionContentHash(restored.document),
      await missionContentHash(doc()),
    );
    assert.equal(await lib.get('missing'), null);
  } finally {
    lib.close();
  }
});

void test('library prevents silent overwrite and stale revision, permits explicit matching update', async () => {
  const lib = library();
  try {
    const initial = await lib.save(doc());
    const next = doc();
    next.name = 'New version';
    await assert.rejects(lib.save(next), /Подтвердите/);
    await assert.rejects(
      lib.save(next, { expectedRevision: 99 }),
      /Подтвердите/,
    );
    assert.equal((await lib.get(next.id))?.revision, 1);
    const updated = await lib.save(next, {
      expectedRevision: initial.revision,
    });
    assert.equal(updated.revision, 2);
    assert.equal((await lib.get(next.id))?.document.name, 'New version');
    await assert.rejects(
      lib.save(doc('new-id'), { expectedRevision: 1 }),
      /исчезла/,
    );
  } finally {
    lib.close();
  }
});

void test('concurrent updates atomically reject one stale writer', async () => {
  const lib = library();
  try {
    await lib.save(doc());
    const result = await Promise.allSettled([
      lib.save({ ...doc(), name: 'A' }, { expectedRevision: 1 }),
      lib.save({ ...doc(), name: 'B' }, { expectedRevision: 1 }),
    ]);
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(result.filter((r) => r.status === 'rejected').length, 1);
    assert.equal((await lib.get(doc().id))?.revision, 2);
  } finally {
    lib.close();
  }
});

void test('archive preserves history and explicit revision; backup includes archived entries', async () => {
  const lib = library();
  try {
    await lib.save(doc());
    await assert.rejects(lib.archive(doc().id, 5), /Версия/);
    await lib.archive(doc().id, 1);
    assert.equal((await lib.list()).length, 0);
    assert.equal((await lib.list(true)).length, 1);
    assert.equal((await lib.get(doc().id))?.archived, true);
    assert.equal((await lib.get(doc().id))?.revision, 2);
    const backup = JSON.parse(await lib.exportBackup());
    assert.equal(backup.entries[0].archived, true);
  } finally {
    lib.close();
  }
});

void test('clean-browser backup restore keeps every normalized field and revision', async () => {
  const first = library(),
    cleanBrowser = library();
  try {
    await first.save(doc('one'));
    await first.save(doc('two'));
    await first.archive('two', 1);
    assert.equal(
      await cleanBrowser.importBackup(await first.exportBackup()),
      2,
    );
    assert.deepEqual(await cleanBrowser.list(true), await first.list(true));
  } finally {
    first.close();
    cleanBrowser.close();
  }
});

void test('backup conflicts, duplicate ID and invalid entries fail atomically with no replacement', async () => {
  const source = library(),
    target = library();
  try {
    await source.save(doc('same'));
    await source.save(doc('new'));
    await target.save({ ...doc('same'), name: 'Keep this' });
    await assert.rejects(
      target.importBackup(await source.exportBackup()),
      /совпадающие/,
    );
    assert.equal((await target.list()).length, 1);
    assert.equal((await target.get('same'))?.document.name, 'Keep this');
    const backup = JSON.parse(await source.exportBackup());
    backup.entries[1].document.schemaVersion = 'unknown';
    await assert.rejects(target.importBackup(JSON.stringify(backup)));
    assert.equal(await target.get('new'), null);
    backup.entries = [backup.entries[0], backup.entries[0]];
    await assert.rejects(
      target.importBackup(JSON.stringify(backup)),
      /повторяющиеся/,
    );
  } finally {
    source.close();
    target.close();
  }
});

void test('bounded library never evicts old records at capacity', async () => {
  const lib = library();
  try {
    for (let i = 0; i < MAX_SAVED_MISSIONS; i++)
      await lib.save(doc(`mission-${i}`));
    await assert.rejects(lib.save(doc('overflow')), /Лимит/);
    assert.equal((await lib.list()).length, MAX_SAVED_MISSIONS);
    assert.ok(await lib.get('mission-0'));
  } finally {
    lib.close();
  }
});

void test('invalid mission or corrupt backup cannot enter database', async () => {
  const lib = library();
  try {
    const invalid = doc();
    invalid.window.end = invalid.window.start;
    await assert.rejects(lib.save(invalid));
    await assert.rejects(
      lib.importBackup('{"format":"unknown","entries":[]}'),
      /Неподдержанная/,
    );
    await assert.rejects(lib.importBackup('{"__proto__":{}}'), /запрещён/);
    assert.equal((await lib.list()).length, 0);
  } finally {
    lib.close();
  }
});

void test('library is durable across new instances, no browser global required for injected factory', async () => {
  const factory = new IDBFactory();
  const first = createMissionLibrary({ indexedDB: factory, dbName: 'durable' });
  await first.save(doc());
  first.close();
  const second = createMissionLibrary({
    indexedDB: factory,
    dbName: 'durable',
  });
  try {
    assert.equal((await second.list()).length, 1);
  } finally {
    second.close();
  }
});

void test('blocked storage returns a usable error rather than dropping task data', async () => {
  const denied = {
    open() {
      throw new DOMException('Denied', 'SecurityError');
    },
  } as unknown as globalThis.IDBFactory;
  const lib = createMissionLibrary({ indexedDB: denied });
  try {
    await assert.rejects(lib.save(doc()), /недоступно.*файл/);
  } finally {
    lib.close();
  }
});
