import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorHistory } from '../lib/planner/editor-history.ts';
import {
  chooseRecordingMime,
  isMp4Header,
  recordingTerminal,
  videoFilename,
} from '../lib/planner/mission-video.ts';
import { createRecoveryClock } from '../lib/planner/mission-recovery-clock.ts';
import type { MissionOperation } from '../lib/planner/mission-operations.ts';

void test('editor undo/redo coalesces typing, never mutates its snapshots', () => {
  const h = new EditorHistory<{ name: string }>(),
    a = { name: 'A' },
    b = { name: 'B' },
    c = { name: 'C' };
  h.record(a, 0);
  h.record(b, 100);
  assert.deepEqual(h.undo(c), a);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
  assert.deepEqual(h.redo(a), c);
  assert.deepEqual(a, { name: 'A' });
});
void test('new editor branch discards redo and bounds memory', () => {
  const h = new EditorHistory<number>(2);
  h.record(0, 0);
  h.record(1, 1000);
  h.record(2, 2000);
  assert.equal(h.undo(3), 2);
  h.record(2, 3000);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(4), 2);
  assert.equal(h.undo(2), 1);
  assert.equal(h.undo(1), undefined);
});
void test('video selects real supported formats, falls back to WebM, never renames a WebM as MP4', () => {
  assert.equal(
    chooseRecordingMime(() => true),
    'video/mp4;codecs=avc1.42001E',
  );
  assert.equal(
    chooseRecordingMime((t) => t === 'video/webm;codecs=vp8'),
    'video/webm;codecs=vp8',
  );
  assert.equal(
    chooseRecordingMime(() => false),
    null,
  );
  assert.equal(
    isMp4Header(
      new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]),
    ),
    true,
  );
  assert.equal(isMp4Header(new Uint8Array([26, 69, 223, 163])), false);
});
void test('video file binds document and unique execution, stopping on actual terminal states', () => {
  const r = {
    id: 'run:a',
    document: { id: 'demo-1' },
    status: 'running',
  } as MissionOperation;
  assert.equal(videoFilename(r), 'demo-1.run_a.mp4');
  assert.equal(recordingTerminal(r), false);
  for (const status of ['completed', 'cancelled'] as const)
    assert.equal(recordingTerminal({ ...r, status }), true);
  for (const stage of ['landed', 'blocked', 'crashed'] as const)
    assert.equal(
      recordingTerminal({
        ...r,
        safety: { stage } as NonNullable<MissionOperation['safety']>,
      }),
      true,
    );
});

function recoveryFixture() {
  let clock = 0,
    wall = 100000;
  const rows = ['one', 'two'].map((id) => ({
    id,
    status: 'paused',
    progressSec: 1,
    safety: {
      id,
      stage: 'returning',
      policy: 'home',
      progressSec: 1,
      detectedAt: new Date(0).toISOString(),
    },
  })) as MissionOperation[];
  const actions: { id: string; type: string; time?: number }[] = [],
    frames: { id: string; time: number }[] = [];
  const runner = createRecoveryClock({
    rows: () => rows,
    rate: () => 10,
    now: () => clock,
    wallTime: () => wall,
    end: () => 20,
    frame: (r, time) => {
      frames.push({ id: r.id, time });
    },
    error: (e) => {
      throw e;
    },
    change: async (id, a) => {
      actions.push({
        id,
        type: a.type,
        time: a.type === 'advance' ? a.progressSec : undefined,
      });
      const s = rows.find((r) => r.id === id)!.safety!;
      if (a.type === 'advance') {
        s.progressSec = a.progressSec;
        if (a.progressSec === 20) s.stage = 'landed';
      } else s.stage = 'returning';
    },
  });
  return {
    runner,
    rows,
    actions,
    frames,
    step: (ms: number) => {
      clock += ms;
      runner.tick();
    },
    wall: (ms: number) => {
      wall = ms;
    },
  };
}
void test('two recovery clocks progress independently of selected mission and save real landing', async () => {
  const f = recoveryFixture();
  f.step(0);
  f.step(1000);
  assert.equal(f.runner.time(f.rows[0]), 11);
  assert.equal(f.runner.time(f.rows[1]), 11);
  f.step(1000);
  await new Promise((r) => setImmediate(r));
  assert.ok(f.rows.every((r) => r.safety!.stage === 'landed'));
  assert.equal(f.actions.filter((a) => a.type === 'advance').length, 2);
});
void test('pausing one recovery does not pause the other; resume does not jump across elapsed pause', async () => {
  const f = recoveryFixture();
  f.step(0);
  f.step(500);
  await f.runner.pause('one');
  f.step(1000);
  assert.equal(f.runner.time(f.rows[0]), 6);
  assert.equal(f.runner.time(f.rows[1]), 16);
  f.runner.resume('one');
  f.step(100);
  assert.equal(f.runner.time(f.rows[0]), 7);
});
void test('operator timeout applies to background mission only after 60 real seconds', async () => {
  const f = recoveryFixture();
  f.rows[0].safety!.stage = 'pending';
  f.wall(59999);
  f.step(0);
  assert.equal(f.actions.length, 0);
  f.wall(60000);
  f.step(0);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.actions[0].type, 'decide');
  f.step(0);
  assert.equal(f.actions.length, 1);
});
void test('removing a run forgets its clock and cannot replay it', async () => {
  const f = recoveryFixture();
  f.step(0);
  f.step(500);
  await f.runner.pause('one');
  f.rows.shift();
  f.runner.forget('one');
  f.step(1000);
  f.step(1000);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.actions.filter((a) => a.id === 'one').length, 1);
});

void test('failed automatic decision is reported once, not retried every animation frame', async () => {
  const row = {
    id: 'run',
    status: 'paused',
    safety: {
      stage: 'pending',
      detectedAt: new Date(0).toISOString(),
      policy: 'home',
      progressSec: 1,
    },
  } as MissionOperation;
  let commands = 0,
    errors = 0;
  const runner = createRecoveryClock({
    rows: () => [row],
    rate: () => 1,
    wallTime: () => 60000,
    change: async () => {
      commands++;
      throw Error('Область занята другой миссией.');
    },
    frame: () => {},
    error: () => {
      errors++;
    },
  });
  for (let i = 0; i < 5; i++) {
    runner.tick();
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(commands, 1);
  assert.equal(errors, 1);
});
