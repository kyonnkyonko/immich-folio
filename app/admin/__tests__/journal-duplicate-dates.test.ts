import { describe, it, expect } from 'vitest';
import type { JournalBlock } from '@/lib/journal';
import { parseJournalMarkdown, serializeJournalMarkdown } from '@/lib/journal';
import {
  createPhotoBlocksByDate,
  duplicateBlock,
  photoDateLabel,
} from '../components/journal/blockOps';

/** Fork additions: duplicate a block, and "+ Photos" with `#####` date headings. */

describe('duplicateBlock', () => {
  const blocks: JournalBlock[] = [
    { type: 'heading', level: 2, text: 'A' },
    { type: 'photo-grid', assetIds: ['x', 'y', 'z'], caption: 'c' },
    { type: 'paragraph', html: 'p' },
  ];

  it('inserts the copy right after the original', () => {
    const next = duplicateBlock(blocks, 1)!;
    expect(next.map((b) => b.type)).toEqual(['heading', 'photo-grid', 'photo-grid', 'paragraph']);
    expect(next[2]).toEqual(blocks[1]);
  });

  it('copies deeply, so editing the copy leaves the original alone', () => {
    const next = duplicateBlock(blocks, 1)!;
    (next[2] as { assetIds: string[] }).assetIds[0] = 'changed';
    expect((blocks[1] as { assetIds: string[] }).assetIds[0]).toBe('x');
  });

  it('refuses an index that does not exist', () => {
    expect(duplicateBlock(blocks, -1)).toBeNull();
    expect(duplicateBlock(blocks, 3)).toBeNull();
  });
});

describe('photoDateLabel', () => {
  it('reads the local wall-clock date from localDateTime', () => {
    // Taken 2025-09-03 23:30 in Taipei: UTC is already the next day.
    expect(
      photoDateLabel({
        localDateTime: '2025-09-03T23:30:00.000Z',
        fileCreatedAt: '2025-09-03T15:30:00.000Z',
      }),
    ).toBe('09/03');
  });

  it('is null without any date', () => {
    expect(photoDateLabel(undefined)).toBeNull();
    expect(photoDateLabel({})).toBeNull();
  });
});

describe('createPhotoBlocksByDate', () => {
  const meta: Record<string, { localDateTime?: string }> = {
    b: { localDateTime: '2025-09-04T08:00:00.000Z' },
    a: { localDateTime: '2025-09-03T09:00:00.000Z' },
    c: { localDateTime: '2025-09-03T18:00:00.000Z' },
  };

  it('sorts by capture time and heads each day with a level-5 date', () => {
    const blocks = createPhotoBlocksByDate(['b', 'c', 'a', 'pasted'], (id) => meta[id]);
    expect(blocks).toEqual([
      { type: 'heading', level: 5, text: '09/03' },
      { type: 'photo', assetId: 'a', caption: '', layout: 'contained' },
      { type: 'photo', assetId: 'c', caption: '', layout: 'contained' },
      { type: 'heading', level: 5, text: '09/04' },
      { type: 'photo', assetId: 'b', caption: '', layout: 'contained' },
      { type: 'photo', assetId: 'pasted', caption: '', layout: 'contained' },
    ]);
  });

  it('writes the heading as "##### 09/03" and reads it back', () => {
    const blocks = createPhotoBlocksByDate(['a'], (id) => meta[id]);
    const md = serializeJournalMarkdown({
      frontmatter: { title: 'T' },
      blocks,
      referencedAssetIds: [],
    });
    expect(md).toContain('##### 09/03');
    expect(parseJournalMarkdown(md).blocks[0]).toEqual({
      type: 'heading',
      level: 5,
      text: '09/03',
    });
  });
});
