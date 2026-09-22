import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_LIFETIME_MS,
  NOTIFICATION_SEEN_LIMIT,
  dismissNotification,
  emptyNotificationState,
  mergeNotifications,
  notificationFingerprint,
  notificationIsFading,
  readNotificationHistory,
  visibleNotifications,
} from '../lib/planner/mission-notifications.ts';
import type { MissionNotificationMessage } from '../lib/planner/mission-notifications.ts';

const message = (
  text = 'Снимок не прошёл повторную модельную проверку.',
): MissionNotificationMessage => ({
  id: 'journal',
  title: 'Журнал миссий',
  text,
  tone: 'warning',
});

void test('duplicate notification sources and rerenders retain one card with its original deadline', () => {
  const first = mergeNotifications(
    emptyNotificationState(),
    [message(), { ...message(), id: 'error', title: 'Проверка' }],
    1000,
  );
  assert.equal(first.history.length, 1);
  assert.equal(mergeNotifications(first, [message()], 8000), first);
  assert.equal(first.history[0].expiresAt, 1000 + NOTIFICATION_LIFETIME_MS);
  assert.equal(
    mergeNotifications(
      first,
      [{ ...message(), text: `  ${message().text}\n` }],
      12000,
    ),
    first,
  );
});

void test('one card expires at 15 seconds, fades during its last two seconds, remains unread in history', () => {
  const state = mergeNotifications(emptyNotificationState(), [message()], 1000);
  assert.equal(visibleNotifications(state, 15999).length, 1);
  assert.equal(notificationIsFading(state.history[0], 13999), false);
  assert.equal(notificationIsFading(state.history[0], 14000), true);
  assert.equal(visibleNotifications(state, 16000).length, 0);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].read, false);
  assert.equal(mergeNotifications(state, [message()], 50000), state);
});

void test('manual close marks one item read, keeps history, does not resurrect on a tab change', () => {
  const state = mergeNotifications(emptyNotificationState(), [message()], 0);
  const closed = dismissNotification(state, state.history[0].fingerprint);
  assert.equal(visibleNotifications(closed, 2000).length, 0);
  assert.equal(closed.history[0].read, true);
  assert.equal(closed.history.length, 1);
  assert.equal(
    dismissNotification(closed, state.history[0].fingerprint),
    closed,
  );
  assert.equal(mergeNotifications(closed, [], 2000), closed);
  assert.equal(mergeNotifications(closed, [message()], 2500), closed);
});

void test('changed content creates a new notification, empty and whitespace-only messages do not', () => {
  const state = mergeNotifications(
    emptyNotificationState(),
    [message(), message(''), message(' \n ')],
    0,
  );
  const changed = mergeNotifications(
    state,
    [message('Файл задания не прошёл проверку.')],
    1000,
  );
  assert.equal(changed.history.length, 2);
  assert.equal(changed.history[0].createdAt, 1000);
  assert.equal(notificationFingerprint('А\n  Б'), 'А Б');
});

void test('no more than three cards and 30 history items; seen content is bounded separately', () => {
  const entries = Array.from({ length: 300 }, (_, i) =>
    message(`Событие ${i}`),
  );
  const state = mergeNotifications(emptyNotificationState(), entries, 0);
  assert.equal(visibleNotifications(state, 1000).length, 3);
  assert.equal(state.history.length, NOTIFICATION_HISTORY_LIMIT);
  assert.equal(state.seen.length, NOTIFICATION_SEEN_LIMIT);
  assert.equal(state.history[0].text, 'Событие 299');
  assert.equal(
    mergeNotifications(state, [message('Событие 200')], 20000),
    state,
  );
});

void test('reading the center acknowledges cards without deleting evidence or allowing a replay', () => {
  const state = mergeNotifications(
    emptyNotificationState(),
    [message('A'), message('B')],
    0,
  );
  const read = readNotificationHistory(state);
  assert.equal(read.history.length, 2);
  assert.ok(read.history.every((entry) => entry.read && entry.dismissed));
  assert.equal(visibleNotifications(read, 100).length, 0);
  assert.equal(readNotificationHistory(read), read);
  assert.equal(
    mergeNotifications(read, [message('A'), message('B')], 2000),
    read,
  );
});

void test('duplicate warning can upgrade an info notification without resetting its lifetime', () => {
  const state = mergeNotifications(
    emptyNotificationState(),
    [{ ...message(), tone: 'info' }],
    0,
  );
  const upgraded = mergeNotifications(
    state,
    [{ ...message(), actionLabel: 'Проверить' }],
    2000,
  );
  assert.equal(upgraded.history.length, 1);
  assert.equal(upgraded.history[0].tone, 'warning');
  assert.equal(upgraded.history[0].actionLabel, 'Проверить');
  assert.equal(upgraded.history[0].expiresAt, 15000);
});
