// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  GROUP_MS,
  UNDO_LIMIT,
  emptyHistory,
  isTextEditingTarget,
  recordEdit,
  redoEdit,
  undoEdit,
} from '../components/journal/undoHistory';

/** Record edits a → b → c … as separate steps (no group key). */
function editsFrom(states: string[]) {
  let h = emptyHistory();
  for (let i = 1; i < states.length; i++) h = recordEdit(h, states[i - 1], i * 10_000);
  return h;
}

describe('journal undo history', () => {
  it('undoes and redoes one step at a time', () => {
    let h = editsFrom(['a', 'b', 'c']);
    let current = 'c';

    const u1 = undoEdit(h, current)!;
    expect(u1.value).toBe('b');
    [h, current] = [u1.history, u1.value];

    const u2 = undoEdit(h, current)!;
    expect(u2.value).toBe('a');
    [h, current] = [u2.history, u2.value];
    expect(undoEdit(h, current)).toBeNull();

    const r1 = redoEdit(h, current)!;
    expect(r1.value).toBe('b');
    const r2 = redoEdit(r1.history, r1.value)!;
    expect(r2.value).toBe('c');
    expect(redoEdit(r2.history, r2.value)).toBeNull();
  });

  it(`keeps at most ${UNDO_LIMIT} undo steps`, () => {
    const h = editsFrom(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
    expect(h.past).toEqual(['s2', 's3', 's4', 's5', 's6']);
  });

  it(`keeps at most ${UNDO_LIMIT} redo steps`, () => {
    let h = editsFrom(['s0', 's1', 's2', 's3', 's4', 's5']);
    let current = 's5';
    for (let i = 0; i < UNDO_LIMIT; i++) {
      const step = undoEdit(h, current)!;
      [h, current] = [step.history, step.value];
    }
    expect(current).toBe('s0');
    expect(h.future).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(undoEdit(h, current)).toBeNull();
  });

  it('drops the redo steps once something new is edited', () => {
    const h = editsFrom(['a', 'b', 'c']);
    const undone = undoEdit(h, 'c')!;
    const edited = recordEdit(undone.history, undone.value, 99_000);
    expect(edited.future).toEqual([]);
    expect(redoEdit(edited, 'x')).toBeNull();
  });

  it('groups a burst of typing with the same key into one step', () => {
    let h = emptyHistory();
    h = recordEdit(h, 'H', 1000, 'block:0');
    h = recordEdit(h, 'He', 1200, 'block:0');
    h = recordEdit(h, 'Hel', 1400, 'block:0');
    expect(h.past).toEqual(['H']);
  });

  it('starts a new step after a pause, or in another field', () => {
    let h = emptyHistory();
    h = recordEdit(h, 'a', 1000, 'block:0');
    h = recordEdit(h, 'b', 1000 + GROUP_MS + 1, 'block:0');
    h = recordEdit(h, 'c', 1000 + GROUP_MS + 2, 'block:1');
    expect(h.past).toEqual(['a', 'b', 'c']);
  });

  it('never groups edits without a key, such as adding a block', () => {
    let h = emptyHistory();
    h = recordEdit(h, 'a', 1000);
    h = recordEdit(h, 'b', 1001);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('leaves text fields their own undo', () => {
    expect(isTextEditingTarget(document.createElement('input'))).toBe(true);
    expect(isTextEditingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTextEditingTarget(document.createElement('button'))).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });
});
