// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JournalEditor } from '../journal/JournalEditor';
import { NotificationProvider } from '../Notifications';
import { ConfirmProvider } from '../ConfirmDialog';

/**
 * Undo / redo in the journal editor: five steps each way, starting from the
 * entry as loaded, with the Saved state back once the edits are all undone.
 */

const MARKDOWN = '---\ntitle: "Trip"\n---\n\nHello\n';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ entry: { slug: 'trip', rawMarkdown: MARKDOWN }, version: 'v1' }),
          { status: 200 },
        ),
    ),
  );
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderEditor() {
  render(
    <NotificationProvider>
      <ConfirmProvider>
        <JournalEditor slug="trip" onBack={() => {}} />
      </ConfirmProvider>
    </NotificationProvider>,
  );
  await screen.findByRole('button', { name: /\+ Text/ });
}

const blockCount = () => screen.queryAllByRole('button', { name: 'Delete block' }).length;
const undo = () => screen.getByRole('button', { name: 'Undo' });
const redo = () => screen.getByRole('button', { name: 'Redo' });

describe('JournalEditor undo / redo', () => {
  it('starts with nothing to undo or redo', async () => {
    await renderEditor();
    expect(undo()).toHaveProperty('disabled', true);
    expect(redo()).toHaveProperty('disabled', true);
  });

  it('undoes an added block and redoes it', async () => {
    await renderEditor();
    const start = blockCount();
    fireEvent.click(screen.getByRole('button', { name: /\+ Heading/ }));
    expect(blockCount()).toBe(start + 1);

    fireEvent.click(undo());
    expect(blockCount()).toBe(start);
    // Back to the file as loaded: nothing left to save.
    expect(screen.getByRole('button', { name: /Saved/ })).toHaveProperty('disabled', true);

    fireEvent.click(redo());
    expect(blockCount()).toBe(start + 1);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveProperty('disabled', false);
  });

  it('goes back at most five steps', async () => {
    await renderEditor();
    const start = blockCount();
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole('button', { name: /\+ Quote/ }));
    expect(blockCount()).toBe(start + 7);

    for (let i = 0; i < 5; i++) fireEvent.click(undo());
    expect(blockCount()).toBe(start + 2);
    expect(undo()).toHaveProperty('disabled', true);

    for (let i = 0; i < 5; i++) fireEvent.click(redo());
    expect(blockCount()).toBe(start + 7);
    expect(redo()).toHaveProperty('disabled', true);
  });

  it('answers Cmd+Z and Cmd+Shift+Z outside text fields', async () => {
    await renderEditor();
    const start = blockCount();
    fireEvent.click(screen.getByRole('button', { name: /\+ Text/ }));

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(blockCount()).toBe(start);
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    expect(blockCount()).toBe(start + 1);
  });

  it('leaves Cmd+Z inside a text field to the field', async () => {
    await renderEditor();
    const start = blockCount();
    fireEvent.click(screen.getByRole('button', { name: /\+ Text/ }));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Story title' }), {
      key: 'z',
      metaKey: true,
    });
    expect(blockCount()).toBe(start + 1);
  });
});
