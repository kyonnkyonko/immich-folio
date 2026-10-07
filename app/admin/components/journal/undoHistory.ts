/**
 * Undo / redo for the journal editor, as plain functions so they can be tested
 * without rendering the editor.
 *
 * The markdown is the whole entry (blocks and frontmatter are parsed from it),
 * so a step is simply the markdown before an edit. Both directions keep at most
 * `UNDO_LIMIT` steps. Typing is grouped: edits that share a `key` (the same
 * block, the same frontmatter field, the raw markdown) and follow each other
 * within `GROUP_MS` are one step, so a sentence is not five steps of one
 * character each. Edits without a key — adding, deleting, moving a block — are
 * always a step of their own.
 */

export const UNDO_LIMIT = 5;
export const GROUP_MS = 1000;

export interface UndoHistory {
  /** Older states, oldest first; the last one is what Undo restores. */
  past: string[];
  /** States undone, the next one to redo first. */
  future: string[];
  /** Group key of the last recorded edit, while its burst may still continue. */
  lastKey: string | null;
  lastAt: number;
}

export function emptyHistory(): UndoHistory {
  return { past: [], future: [], lastKey: null, lastAt: 0 };
}

/**
 * Record an edit that replaced `before`. A new edit always clears the redo
 * steps; it only adds an undo step when it does not continue the last burst.
 */
export function recordEdit(
  history: UndoHistory,
  before: string,
  now: number,
  key?: string,
): UndoHistory {
  const continues = key !== undefined && key === history.lastKey && now - history.lastAt < GROUP_MS;
  return {
    past: continues ? history.past : [...history.past, before].slice(-UNDO_LIMIT),
    future: [],
    lastKey: key ?? null,
    lastAt: now,
  };
}

/** The state to show after Undo, or null when there is nothing to undo. */
export function undoEdit(
  history: UndoHistory,
  current: string,
): { value: string; history: UndoHistory } | null {
  if (history.past.length === 0) return null;
  return {
    value: history.past[history.past.length - 1],
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, UNDO_LIMIT),
      lastKey: null,
      lastAt: 0,
    },
  };
}

/** The state to show after Redo, or null when there is nothing to redo. */
export function redoEdit(
  history: UndoHistory,
  current: string,
): { value: string; history: UndoHistory } | null {
  if (history.future.length === 0) return null;
  const [value, ...rest] = history.future;
  return {
    value,
    history: {
      past: [...history.past, current].slice(-UNDO_LIMIT),
      future: rest,
      lastKey: null,
      lastAt: 0,
    },
  };
}

/**
 * Whether a keyboard shortcut belongs to the field it was typed in: text fields
 * keep their own native undo, so Cmd+Z there undoes the last characters rather
 * than a whole block.
 */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}
