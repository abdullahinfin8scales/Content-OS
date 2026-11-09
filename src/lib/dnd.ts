import type { DragEvent } from 'react';
import type { ID } from './types';

/**
 * Native HTML5 drag-and-drop. The dragged item is also kept in module state
 * because browsers hide dataTransfer contents during `dragover`, and drop
 * targets need to know what is coming to accept or refuse it.
 */
export type DragItem = { kind: 'doc' | 'folder'; id: ID };

export const DRAG_MIME = 'application/x-infin8-item';

let current: DragItem | null = null;

export function startDrag(e: DragEvent, item: DragItem, label: string) {
  current = item;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
  e.dataTransfer.setData('text/plain', label);
}

export function endDrag() {
  current = null;
}

export function draggedItem(): DragItem | null {
  return current;
}
