/**
 * Pages generated in bulk — the 366 daily pages `/tyday-01_01` … `/tyday-12_31`
 * of this fork — fold into a group of their own under "Not in menu", closed
 * until opened or searched, so they do not bury the hand-made pages.
 */

export const FOLDED_PAGE_PREFIX = 'tyday-';
export const FOLDED_GROUP_LABEL = '每日照片 tyday-*';

export function isFoldedPage(slug: string): boolean {
  return slug.startsWith(FOLDED_PAGE_PREFIX);
}

/** Split the off-menu pages, keeping each side in the order it came in. */
export function splitFoldedPages<T extends { slug: string }>(
  pages: T[],
): { regular: T[]; folded: T[] } {
  const regular: T[] = [];
  const folded: T[] = [];
  for (const page of pages) (isFoldedPage(page.slug) ? folded : regular).push(page);
  return { regular, folded };
}
