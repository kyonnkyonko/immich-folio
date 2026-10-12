// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import AssetPicker from '../AssetPicker';

/** Fork additions: press-and-hold enlargement, and the "date headings" box. */

const ASSETS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    originalFileName: 'a.jpg',
    fileCreatedAt: '2025-09-03T01:00:00.000Z',
    localDateTime: '2025-09-03T09:00:00.000Z',
    isFavorite: true,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    originalFileName: 'b.jpg',
    fileCreatedAt: '2025-09-04T01:00:00.000Z',
    localDateTime: '2025-09-04T09:00:00.000Z',
    isFavorite: true,
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ assets: ASSETS, nextPage: null }), { status: 200 }),
    ),
  );
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AssetPicker', () => {
  it('shows the large image while a tile is held, and the hold does not pick it', async () => {
    const onSelectMany = vi.fn();
    render(<AssetPicker onSelectMany={onSelectMany} onClose={() => {}} />);
    const tile = await screen.findByRole('button', { name: /a\.jpg/ });
    vi.useFakeTimers();
    fireEvent.pointerDown(tile, { button: 0 });
    act(() => void vi.advanceTimersByTime(450));
    const big = document.querySelector('.asset-picker-preview img');
    expect(big?.getAttribute('src')).toBe(`/api/admin/thumbnail/${ASSETS[0].id}?size=preview`);
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    expect(document.querySelector('.asset-picker-preview')).toBeNull();
    expect(tile.getAttribute('aria-pressed')).toBe('false');
    // A short tap still picks.
    fireEvent.pointerDown(tile, { button: 0 });
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
  });

  it('hands over dates and the date-headings choice', async () => {
    const onSelectMany = vi.fn();
    render(<AssetPicker onSelectMany={onSelectMany} onClose={() => {}} dateHeadingsOption />);
    fireEvent.click(await screen.findByRole('button', { name: /b\.jpg/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /依日期加小標/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add photo' }));
    const [ids, extra] = onSelectMany.mock.calls[0];
    expect(ids).toEqual([ASSETS[1].id]);
    expect(extra.dateHeadings).toBe(true);
    expect(extra.metaOf(ASSETS[1].id).localDateTime).toBe('2025-09-04T09:00:00.000Z');
  });

  it('has no date-headings box unless asked for', async () => {
    render(<AssetPicker onSelectMany={() => {}} onClose={() => {}} />);
    await screen.findByRole('button', { name: /a\.jpg/ });
    expect(screen.queryByRole('checkbox', { name: /依日期加小標/ })).toBeNull();
  });
});
