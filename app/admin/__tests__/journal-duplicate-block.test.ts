import { describe, it, expect } from 'vitest';
import type { JournalBlock } from '@/lib/journal';
import { duplicateBlock } from '../components/journal/blockOps';

/** Fork addition: duplicate a block. */

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
