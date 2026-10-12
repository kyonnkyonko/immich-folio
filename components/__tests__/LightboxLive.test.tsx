// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Lightbox } from '../Lightbox';
import type { PhotoItem } from '@/app/[...path]/PhotoGrid';

/** Fork: a Live Photo plays its motion clip over the still while LIVE is held or hovered. */

const photo = (id: string, extra: Partial<PhotoItem> = {}): PhotoItem => ({
  id,
  type: 'image',
  thumbUrl: `/t/${id}`,
  previewUrl: `/p/${id}`,
  exifUrl: `/e/${id}`,
  aspectRatio: 4 / 3,
  ...extra,
});

const show = (item: PhotoItem) =>
  render(
    <Lightbox
      assets={[item]}
      currentIndex={0}
      onClose={() => {}}
      onNext={() => {}}
      onPrev={() => {}}
    />,
  );

const clip = () => document.querySelector('video');

afterEach(cleanup);

describe('Lightbox Live Photo', () => {
  it('has no LIVE control on a plain photo', () => {
    show(photo('p1'));
    expect(screen.queryByRole('button', { name: 'Live Photo' })).toBeNull();
  });

  it('plays the clip while the mouse is over LIVE', () => {
    show(photo('l1', { liveUrl: '/api/live/l1' }));
    const live = screen.getByRole('button', { name: 'Live Photo' });
    expect(clip()).toBeNull();
    fireEvent.pointerEnter(live, { pointerType: 'mouse' });
    expect(clip()?.getAttribute('src')).toBe('/api/live/l1');
    expect(clip()?.muted).toBe(true);
    fireEvent.pointerLeave(live, { pointerType: 'mouse' });
    expect(clip()).toBeNull();
  });

  it('plays while a finger holds LIVE, and stops on release', () => {
    show(photo('l1', { liveUrl: '/api/live/l1' }));
    const live = screen.getByRole('button', { name: 'Live Photo' });
    fireEvent.pointerDown(live, { pointerType: 'touch' });
    expect(clip()).not.toBeNull();
    fireEvent.pointerUp(live, { pointerType: 'touch' });
    expect(clip()).toBeNull();
  });

  it('toggles from the keyboard and returns to the still when the clip ends', () => {
    show(photo('l1', { liveUrl: '/api/live/l1' }));
    const live = screen.getByRole('button', { name: 'Live Photo' });
    fireEvent.keyDown(live, { key: ' ' });
    expect(live.getAttribute('aria-pressed')).toBe('true');
    fireEvent.ended(clip()!);
    expect(clip()).toBeNull();
    expect(live.getAttribute('aria-pressed')).toBe('false');
  });
});
