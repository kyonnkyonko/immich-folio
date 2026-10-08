import { describe, it, expect } from 'vitest';
import { isFoldedPage, splitFoldedPages } from '../components/page-builder/pageGroups';

describe('folded daily pages', () => {
  it('recognises the daily pages by their slug', () => {
    expect(isFoldedPage('tyday-01_01')).toBe(true);
    expect(isFoldedPage('tyday-02_29')).toBe(true);
    expect(isFoldedPage('about-us')).toBe(false);
    expect(isFoldedPage('my-tyday')).toBe(false);
  });

  it('splits off-menu pages, each side in the order it came in', () => {
    const pages = [
      { slug: 'pricing' },
      { slug: 'tyday-10_08' },
      { slug: 'faq' },
      { slug: 'tyday-01_01' },
    ];
    expect(splitFoldedPages(pages)).toEqual({
      regular: [{ slug: 'pricing' }, { slug: 'faq' }],
      folded: [{ slug: 'tyday-10_08' }, { slug: 'tyday-01_01' }],
    });
  });

  it('leaves the list alone when there are no daily pages', () => {
    expect(splitFoldedPages([{ slug: 'faq' }])).toEqual({ regular: [{ slug: 'faq' }], folded: [] });
  });
});
