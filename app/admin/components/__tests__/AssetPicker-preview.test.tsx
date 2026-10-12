// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import AssetPicker, { captureDay, dayHeading } from '../AssetPicker';

/** Fork additions: press-and-hold enlargement, and the grid split into days. */

const asset = (n: number, local: string) => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-1111-1111-111111111111`,
  originalFileName: `p${n}.jpg`,
  fileCreatedAt: '2025-01-01T00:00:00.000Z',
  localDateTime: local,
  isFavorite: true,
});
// Newest first, as the library lists them.
const ASSETS = [
  asset(1, '2025-09-03T20:00:00.000Z'),
  asset(2, '2025-09-03T09:00:00.000Z'),
  asset(3, '2025-09-02T09:00:00.000Z'),
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ assets: ASSETS, nextPage: null }), { status: 200 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('captureDay / dayHeading', () => {
  it('uses the local wall-clock day, even late at night', () => {
    // 23:30 in Taipei is already the next day in UTC.
    expect(
      captureDay({
        localDateTime: '2025-09-03T23:30:00.000Z',
        fileCreatedAt: '2025-09-03T15:30:00.000Z',
      }),
    ).toBe('2025-09-03');
  });

  it('shows MM/DD this year and the year otherwise', () => {
    expect(dayHeading('2025-09-03', 2025)).toBe('09/03');
    expect(dayHeading('2024-09-03', 2025)).toBe('2024/09/03');
    expect(dayHeading('', 2025)).toBe('日期不明');
  });
});

describe('AssetPicker', () => {
  it('puts a date heading above each day of photos', async () => {
    render(<AssetPicker onSelect={() => {}} onClose={() => {}} />);
    await screen.findByRole('button', { name: /p1\.jpg/ });
    const grid = screen.getByRole('group', { name: 'Photos' });
    const seq = [...grid.children].map((el) =>
      el.tagName === 'H4'
        ? `# ${el.textContent}`
        : (el.getAttribute('aria-label') ?? '').split(',')[0],
    );
    const year = new Date().getFullYear() === 2025 ? '' : '2025/';
    expect(seq).toEqual([`# ${year}09/03`, 'p1.jpg', 'p2.jpg', `# ${year}09/02`, 'p3.jpg']);
  });

  it('shows the large image while a tile is held, and the hold does not pick it', async () => {
    render(<AssetPicker onSelectMany={() => {}} onClose={() => {}} />);
    const tile = await screen.findByRole('button', { name: /p1\.jpg/ });
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
});
