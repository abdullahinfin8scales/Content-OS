import type { PointerEvent as ReactPointerEvent } from 'react';
import { timeForDrop, type DropSpot } from '../../lib/personalRepo';
import { clockLabel } from '../../lib/personalText';

/**
 * Drag a task anywhere on the day. Pointer events, so it works with a mouse, a
 * pen and a finger (the browser's own drag-and-drop does nothing on touch).
 *
 * The page marks what it has:
 * - `[data-drop-zone]` = "anytime" or "hour-<h>": a place a task can be dropped.
 * - `[data-task-row]` with `data-task-id` and `data-time`: every task row.
 *
 * While dragging, a copy of the row follows the pointer, a line shows where it
 * will land, and a small label shows the time it will get. On drop the spot
 * (hour, and the tasks just above and below) goes to `onDrop`, which decides
 * the time. The copy stays at the landing spot until the day re-renders with
 * the task there (`resetSortStyles`, from a layout effect), so there is no
 * flash of the old place.
 */

let dragging = false;
let resetTimer: ReturnType<typeof setTimeout> | undefined;
let ghost: HTMLElement | null = null;
let marker: HTMLElement | null = null;

const ROW = '[data-task-row]';
const ZONE = '[data-drop-zone]';
const MOVE_THRESHOLD = 4;
const EDGE = 64; // px from the top or bottom of the page where it starts to scroll
const SCROLL_SPEED = 16; // px per frame at the very edge

/** Removes the copy, the landing line and the faded original. Does nothing while a drag is in progress. */
export function resetSortStyles() {
  if (dragging) return;
  clearTimeout(resetTimer);
  ghost?.remove();
  marker?.remove();
  ghost = null;
  marker = null;
  for (const row of document.querySelectorAll<HTMLElement>('[data-dragging]')) delete row.dataset.dragging;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

interface Landing {
  spot: DropSpot;
  time: string | null;
  /** Where the dragged row's top will be, and the zone's left edge and width (viewport pixels). */
  top: number;
  left: number;
  width: number;
}

/** Works out where a drop at height `y` would land: the nearest zone, and between which rows. */
function findLanding(y: number, dragId: string): Landing | null {
  let zone: HTMLElement | null = null;
  let best = Infinity;
  for (const z of document.querySelectorAll<HTMLElement>(ZONE)) {
    const r = z.getBoundingClientRect();
    const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (dist < best) {
      best = dist;
      zone = z;
    }
  }
  if (!zone) return null;

  const rows = [...zone.querySelectorAll<HTMLElement>(ROW)].filter((r) => r.dataset.taskId !== dragId);
  const rects = rows.map((r) => r.getBoundingClientRect());
  const zr = zone.getBoundingClientRect();
  const j = rects.reduce((n, r) => (r.top + r.height / 2 < y ? n + 1 : n), 0);
  const top = rows.length === 0 ? zr.top + 4 : j === 0 ? rects[0].top : rects[j - 1].bottom + 1;

  const hour = zone.dataset.dropZone === 'anytime' ? null : Number(zone.dataset.dropZone!.slice('hour-'.length));
  const after = j > 0 ? rows[j - 1] : undefined;
  return {
    spot: { hour, afterId: after?.dataset.taskId ?? null, beforeId: rows[j]?.dataset.taskId ?? null },
    time: timeForDrop(hour, after?.dataset.time || null),
    top,
    left: zr.left,
    width: zr.width,
  };
}

function makeMarker(): HTMLElement {
  const el = document.createElement('div');
  el.dataset.dragMarker = '';
  Object.assign(el.style, { position: 'fixed', height: '2px', borderRadius: '1px', background: 'var(--fg)', zIndex: '55', pointerEvents: 'none' });
  const pill = document.createElement('span');
  Object.assign(pill.style, {
    position: 'absolute',
    right: '0',
    bottom: '4px',
    padding: '0 8px',
    borderRadius: '9px',
    background: 'var(--fg)',
    color: 'var(--canvas)',
    font: '500 11px/18px var(--font-sans, inherit)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  });
  el.appendChild(pill);
  document.body.appendChild(el);
  return el;
}

export function startTaskDrag(e: ReactPointerEvent<HTMLElement>, row: HTMLElement, onDrop: (spot: DropSpot) => Promise<boolean | void>) {
  const id = row.dataset.taskId;
  if (dragging || !id || (e.pointerType === 'mouse' && e.button !== 0)) return;

  e.preventDefault();
  const handle = e.currentTarget;
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    /* the pointer is already gone */
  }
  clearTimeout(resetTimer);
  resetSortStyles();

  const rect = row.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const grabY = startY - rect.top;
  const scroller = scrollParent(row);
  const bounds = scroller?.getBoundingClientRect();
  // Keep the landing line and copy inside the visible page, even when the block they point at has scrolled out of sight.
  const within = (y: number, height: number) => (bounds ? Math.max(bounds.top, Math.min(bounds.bottom - height, y)) : y);
  let pointerY = startY;
  let started = false;
  let raf = 0;
  let landing: Landing | null = null;

  dragging = true;

  const begin = () => {
    started = true;
    document.body.dataset.taskDrag = 'true'; // tooltips stay quiet while dragging
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    ghost = row.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-task-row');
    ghost.removeAttribute('data-task-id');
    ghost.removeAttribute('data-dragging');
    ghost.dataset.dragGhost = '';
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      margin: '0',
      zIndex: '60',
      pointerEvents: 'none',
      background: 'var(--canvas)',
      boxShadow: '0 0 0 1px var(--line-strong)',
    });
    document.body.appendChild(ghost);
    marker = makeMarker();
    row.dataset.dragging = 'true';
    frame();
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      const v = pointerY < r.top + EDGE ? -(r.top + EDGE - pointerY) / EDGE : pointerY > r.bottom - EDGE ? (pointerY - (r.bottom - EDGE)) / EDGE : 0;
      if (v) scroller.scrollTop += Math.max(-1, Math.min(1, v)) * SCROLL_SPEED;
    }
    landing = findLanding(pointerY, id);
    if (ghost) ghost.style.top = `${pointerY - grabY}px`;
    if (marker && landing) {
      Object.assign(marker.style, { left: `${landing.left}px`, width: `${landing.width}px`, top: `${within(landing.top - 1, 2)}px` });
      marker.firstElementChild!.textContent = landing.time ? clockLabel(landing.time) : 'Anytime';
    }
  };

  const onMove = (ev: PointerEvent) => {
    pointerY = ev.clientY;
    if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_THRESHOLD) begin();
  };

  const end = (commit: boolean) => {
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onCancel);
    handle.removeEventListener('lostpointercapture', onCancel);
    window.removeEventListener('keydown', onKey, true);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    delete document.body.dataset.taskDrag;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    dragging = false;
    if (started && commit) landing = findLanding(pointerY, id) ?? landing; // exactly where it was let go

    if (!started || !commit || !landing) {
      resetSortStyles();
      return;
    }
    // Settle the copy into the landing spot, then hand over the drop.
    if (ghost) {
      ghost.style.transition = 'top 120ms ease, left 120ms ease, width 120ms ease';
      Object.assign(ghost.style, { top: `${within(landing.top, rect.height)}px`, left: `${landing.left}px`, width: `${landing.width}px` });
    }
    // The re-render removes the copy; this is only for a drop that changes nothing or fails.
    resetTimer = setTimeout(resetSortStyles, 1500);
    onDrop(landing.spot)
      .then((changed) => {
        if (changed === false) resetSortStyles();
      })
      .catch(() => resetSortStyles());
  };

  const onUp = () => end(true);
  const onCancel = () => end(false);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    end(false);
  };

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  handle.addEventListener('lostpointercapture', onCancel);
  window.addEventListener('keydown', onKey, true);
}
