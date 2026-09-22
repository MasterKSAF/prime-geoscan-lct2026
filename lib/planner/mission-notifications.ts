/** Session-only notification state. A repeated render is not a new event. */
export const NOTIFICATION_LIFETIME_MS = 15_000;
export const NOTIFICATION_FADE_MS = 2_000;
export const NOTIFICATION_HISTORY_LIMIT = 30;
export const NOTIFICATION_SEEN_LIMIT = 256;

export type MissionNotificationMessage = {
  id: string;
  title: string;
  text: string;
  tone: 'warning' | 'info';
  actionLabel?: string;
};

export type MissionNotificationRecord = MissionNotificationMessage & {
  fingerprint: string;
  createdAt: number;
  expiresAt: number;
  dismissed: boolean;
  read: boolean;
};

export type MissionNotificationState = {
  history: MissionNotificationRecord[];
  seen: string[];
};

export function notificationFingerprint(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function emptyNotificationState(): MissionNotificationState {
  return { history: [], seen: [] };
}

export function mergeNotifications(
  state: MissionNotificationState,
  messages: MissionNotificationMessage[],
  now: number,
): MissionNotificationState {
  let history = state.history;
  let seen = state.seen;
  for (const message of messages) {
    const fingerprint = notificationFingerprint(message.text);
    if (!fingerprint) continue;
    const current = history.find((item) => item.fingerprint === fingerprint);
    if (current) {
      // Two sources may report one failure. Keep its original lifetime and read state.
      const tone = current.tone === 'warning' ? 'warning' : message.tone;
      const actionLabel = message.actionLabel ?? current.actionLabel;
      if (tone !== current.tone || actionLabel !== current.actionLabel) {
        history = history.map((item) =>
          item === current ? { ...item, tone, actionLabel } : item,
        );
      }
      continue;
    }
    if (seen.includes(fingerprint)) continue;
    history = [
      {
        ...message,
        text: message.text.trim(),
        fingerprint,
        createdAt: now,
        expiresAt: now + NOTIFICATION_LIFETIME_MS,
        dismissed: false,
        read: false,
      },
      ...history,
    ].slice(0, NOTIFICATION_HISTORY_LIMIT);
    seen = [...seen, fingerprint].slice(-NOTIFICATION_SEEN_LIMIT);
  }
  return history === state.history && seen === state.seen
    ? state
    : { history, seen };
}

export function dismissNotification(
  state: MissionNotificationState,
  fingerprint: string,
): MissionNotificationState {
  const item = state.history.find((entry) => entry.fingerprint === fingerprint);
  if (!item || (item.dismissed && item.read)) return state;
  return {
    ...state,
    history: state.history.map((entry) =>
      entry === item ? { ...entry, dismissed: true, read: true } : entry,
    ),
  };
}

export function readNotificationHistory(
  state: MissionNotificationState,
): MissionNotificationState {
  if (state.history.every((item) => item.read && item.dismissed)) return state;
  return {
    ...state,
    history: state.history.map((item) => ({
      ...item,
      read: true,
      dismissed: true,
    })),
  };
}

export function visibleNotifications(
  state: MissionNotificationState,
  now: number,
): MissionNotificationRecord[] {
  return state.history
    .filter((item) => !item.dismissed && now < item.expiresAt)
    .slice(0, 3);
}

export function notificationIsFading(
  item: MissionNotificationRecord,
  now: number,
): boolean {
  return now >= item.expiresAt - NOTIFICATION_FADE_MS;
}
