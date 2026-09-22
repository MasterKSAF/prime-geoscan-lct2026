'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, X } from 'lucide-react';
import {
  dismissNotification,
  emptyNotificationState,
  mergeNotifications,
  notificationFingerprint,
  notificationIsFading,
  readNotificationHistory,
  visibleNotifications,
  NOTIFICATION_SEEN_LIMIT,
} from '@/lib/planner/mission-notifications';
import type { MissionNotificationMessage } from '@/lib/planner/mission-notifications';

export type MissionNotificationInput = Omit<
  MissionNotificationMessage,
  'actionLabel'
> & {
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
};

/** Mount once in the header; changing tabs must not reset notification history. */
export function MissionNotificationCenter({
  entries,
  modalKey,
}: {
  entries: MissionNotificationInput[];
  modalKey?: string | number | null;
}) {
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const callbacks = useRef(new Map<string, MissionNotificationInput>());
  const currentKeys = useRef(new Set<string>());
  const [state, setState] = useState(emptyNotificationState);
  const [clock, setClock] = useState(Date.now);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    currentKeys.current = new Set(
      entries.map((entry) => notificationFingerprint(entry.text)),
    );
    for (const entry of entries) {
      const key = notificationFingerprint(entry.text);
      if (!key) continue;
      const previous = callbacks.current.get(key);
      callbacks.current.set(key, {
        ...entry,
        action: entry.action ?? previous?.action,
        onDismiss: entry.onDismiss ?? previous?.onDismiss,
      });
      if (callbacks.current.size > NOTIFICATION_SEEN_LIMIT) {
        const oldest = callbacks.current.keys().next().value;
        if (oldest) callbacks.current.delete(oldest);
      }
    }
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setState((previous) => {
        const merged = mergeNotifications(
          previous,
          entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            text: entry.text,
            tone: entry.tone,
            actionLabel: entry.action?.label,
          })),
          Date.now(),
        );
        return open ? readNotificationHistory(merged) : merged;
      });
    });
    return () => {
      active = false;
    };
  }, [entries, open]);

  useEffect(() => {
    let active = true;
    const selectHost = () => {
      if (!active) return;
      const dialogs = Array.from(
        document.querySelectorAll<HTMLDialogElement>('dialog[open]'),
      );
      const next =
        dialogs.at(-1) ??
        trigger.current?.closest<HTMLElement>('.mission-workbench') ??
        document.body;
      setHost((previous) => (previous === next ? previous : next));
    };
    queueMicrotask(selectHost);
    // Dialogs enter the browser top layer. Put notifications inside that dialog so
    // their close buttons remain usable, rather than behind an inert modal.
    const observer = new MutationObserver((records) => {
      const dialogChanged = records.some((record) => {
        if (record.type === 'attributes')
          return record.target instanceof HTMLDialogElement;
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches('dialog') || node.querySelector('dialog')),
        );
      });
      if (dialogChanged) selectHost();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [modalKey]);

  useEffect(() => {
    if (
      !state.history.some(
        (item) => !item.dismissed && item.expiresAt > Date.now(),
      )
    )
      return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (
        state.history.every((item) => item.dismissed || item.expiresAt <= now)
      ) {
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [state.history]);

  const visible = open ? [] : visibleNotifications(state, clock);
  const hasLayer = open || visible.length > 0;
  useLayoutEffect(() => {
    const element = layer.current;
    if (!element || !hasLayer) return;
    if (
      typeof element.showPopover === 'function' &&
      !element.matches(':popover-open')
    )
      element.showPopover();
    if (open)
      element
        .querySelector<HTMLButtonElement>('.mw-notification-close')
        ?.focus({ preventScroll: true });
    return () => {
      if (
        typeof element.hidePopover === 'function' &&
        element.matches(':popover-open')
      )
        element.hidePopover();
    };
  }, [host, hasLayer, open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !layer.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [open]);

  const unread = state.history.filter((entry) => !entry.read).length;
  const dismiss = (key: string) => {
    setState((previous) => dismissNotification(previous, key));
    // An older card must not clear a newer message held in the same source state.
    if (currentKeys.current.has(key)) callbacks.current.get(key)?.onDismiss?.();
  };
  const closePanel = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const panel = hasLayer ? (
    <div
      ref={layer}
      popover="manual"
      className="mw-notification-layer"
      data-notification-layer
    >
      {open ? (
        <section
          id={panelId}
          className="mw-notification-history"
          aria-label="Центр уведомлений"
        >
          <header>
            <strong>Уведомления</strong>
            <button
              type="button"
              className="mw-notification-close"
              onClick={closePanel}
              aria-label="Закрыть центр уведомлений"
            >
              <X size={17} />
            </button>
          </header>
          <div className="mw-notification-history-list">
            {state.history.length ? (
              state.history.map((entry) => (
                <article
                  key={entry.fingerprint}
                  className={`mw-notification-history-item mw-notification-${entry.tone}`}
                >
                  <div className="mw-notification-history-heading">
                    <strong>{entry.title}</strong>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>
                      {new Date(entry.createdAt).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p>{entry.text}</p>
                  {entry.actionLabel && (
                    <button
                      type="button"
                      className="mw-notification-action"
                      onClick={() => {
                        callbacks.current
                          .get(entry.fingerprint)
                          ?.action?.onClick();
                        closePanel();
                      }}
                    >
                      {entry.actionLabel}
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p className="mw-notification-empty">Уведомлений пока нет.</p>
            )}
          </div>
        </section>
      ) : (
        <div className="mw-notification-stack" aria-label="Новые уведомления">
          {visible.map((entry) => (
            <section
              key={entry.fingerprint}
              className={`mw-notification-card mw-notification-${entry.tone}${notificationIsFading(entry, clock) ? ' is-fading' : ''}`}
              role={entry.tone === 'warning' ? 'alert' : 'status'}
              aria-atomic="true"
              data-notification-id={entry.id}
            >
              {entry.tone === 'warning' ? (
                <AlertTriangle size={19} aria-hidden="true" />
              ) : (
                <Info size={19} aria-hidden="true" />
              )}
              <div className="mw-notification-copy">
                <strong>{entry.title}</strong>
                <p>{entry.text}</p>
                {entry.actionLabel && (
                  <button
                    type="button"
                    className="mw-notification-action"
                    onClick={() => {
                      dismiss(entry.fingerprint);
                      callbacks.current
                        .get(entry.fingerprint)
                        ?.action?.onClick();
                    }}
                  >
                    {entry.actionLabel}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="mw-notification-close"
                onClick={() => dismiss(entry.fingerprint)}
                aria-label={`Закрыть уведомление: ${entry.title}`}
              >
                <X size={17} />
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`mw-notification-trigger${unread ? ' has-unread' : ''}`}
        aria-label={
          unread ? `Уведомления: ${unread} непрочитанных` : 'Уведомления'
        }
        title="Уведомления"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((previous) => !previous);
          setState(readNotificationHistory);
        }}
      >
        <AlertTriangle size={19} aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true">{unread}</span>}
      </button>
      {host && panel ? createPortal(panel, host) : null}
    </>
  );
}

export default MissionNotificationCenter;
