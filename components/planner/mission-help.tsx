'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** Text-only help, reachable with pointer, touch and keyboard. No external tooltip runtime. */
export function InfoHint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const hovered = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({
    visibility: 'hidden',
  });

  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const dismiss = () => {
    cancelClose();
    pinned.current = false;
    setOpen(false);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (
        !pinned.current &&
        !hovered.current &&
        document.activeElement !== button.current
      ) {
        setOpen(false);
      }
    }, 160);
  };

  useLayoutEffect(() => {
    if (!open || !button.current || !popup.current) return;
    const element = popup.current;
    // Native manual popovers enter the top layer, so help also works inside a modal/table scroller.
    if (typeof element.showPopover === 'function') element.showPopover();
    const place = () => {
      if (!button.current) return;
      const bounds = button.current.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(330, window.innerWidth - margin * 2);
      element.style.width = `${width}px`;
      const height = element.getBoundingClientRect().height;
      const below = bounds.bottom + 8;
      const top =
        below + height <= window.innerHeight - margin
          ? below
          : Math.max(margin, bounds.top - height - 8);
      const left = Math.max(
        margin,
        Math.min(bounds.left - 12, window.innerWidth - width - margin),
      );
      setPosition({ left, top, width, visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      if (
        typeof element.hidePopover === 'function' &&
        element.matches(':popover-open')
      )
        element.hidePopover();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      pinned.current = false;
      setOpen(false);
    };
    const onOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        pinned.current = false;
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
    };
  }, [open]);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <span
      ref={root}
      className="mw-info-hint"
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return;
        hovered.current = true;
        show();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        scheduleClose();
      }}
    >
      <button
        ref={button}
        type="button"
        className="mw-info-trigger"
        aria-label={`Пояснение: ${label}`}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onFocus={show}
        onBlur={() => {
          pinned.current = false;
          scheduleClose();
        }}
        onClick={(event) => {
          // A hint beside a selectable item must not also select that item.
          event.stopPropagation();
          if (pinned.current) dismiss();
          else {
            pinned.current = true;
            show();
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span
        id={id}
        ref={popup}
        role="tooltip"
        popover="manual"
        hidden={!open}
        className="mw-info-popover"
        style={position}
      >
        <strong>{label}</strong>
        <span>{children}</span>
      </span>
    </span>
  );
}
