import type { JournalBlock } from '@/lib/journal';

/**
 * Block-list operations of the journal editor, as plain functions so they can
 * be tested without rendering the editor (#555).
 */

/**
 * Photo blocks may carry a legacy positional reference ("1", "2") instead of an
 * asset UUID. Those only ever resolved against a subpage's album; on a
 * standalone journal page there is no album, so the photo silently disappears.
 * Flag them in the editor so the author can re-pick before publishing.
 */
const ASSET_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLegacyAssetRef(assetId: string): boolean {
  return assetId.length > 0 && !ASSET_UUID.test(assetId);
}

/**
 * Slots after a multi-pick (#602): picked photos fill the empty slots first,
 * in pick order, and the rest are appended. With `capacity` (a pair holds two)
 * the list never grows past it; overflow picks are dropped.
 */
export function fillAssetSlots(slots: string[], picked: string[], capacity?: number): string[] {
  const next = [...slots];
  const queue = [...picked];
  for (let i = 0; i < next.length && queue.length > 0; i++) {
    if (!next[i]) next[i] = queue.shift()!;
  }
  next.push(...queue);
  return capacity === undefined ? next : next.slice(0, capacity);
}

/** One photo block per picked asset, for "+ Photos" (#602). */
export function createPhotoBlocks(assetIds: string[]): JournalBlock[] {
  return assetIds.map((assetId) => ({ type: 'photo', assetId, caption: '', layout: 'contained' }));
}

/** The block the "Add Block" toolbar inserts for each type. */
export function createBlock(type: JournalBlock['type']): JournalBlock {
  switch (type) {
    case 'heading':
      return { type: 'heading', level: 2, text: 'New Heading' };
    case 'paragraph':
      return { type: 'paragraph', html: 'Enter paragraph text here...' };
    case 'quote':
      return { type: 'quote', text: 'Enter quote text...', author: '' };
    case 'photo':
      return { type: 'photo', assetId: '', caption: '', layout: 'contained' };
    case 'photo-pair':
      return { type: 'photo-pair', assetIds: ['', ''], caption: '' };
    case 'photo-grid':
      return { type: 'photo-grid', assetIds: ['', '', ''], caption: '' };
    case 'facts':
      return {
        type: 'facts',
        items: [
          { label: '', value: '' },
          { label: '', value: '' },
        ],
      };
    case 'map':
      return { type: 'map', caption: '', line: true, items: [] };
    case 'album':
      return { type: 'album', albumId: '', layout: 'grid' };
  }
}

/**
 * The blocks with the one at `index` moved a step up or down, or null when it
 * is already at that end — the arrow buttons are disabled there, but a stale
 * click must not reorder anything.
 */
export function moveBlock(
  blocks: JournalBlock[],
  index: number,
  direction: 'up' | 'down',
): JournalBlock[] | null {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= blocks.length) return null;
  const next = [...blocks];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * The blocks with a copy of the one at `index` inserted right after it, or
 * null for an index that does not exist. The copy is deep, so editing it never
 * changes the original (photo lists and fact rows are arrays).
 */
export function duplicateBlock(blocks: JournalBlock[], index: number): JournalBlock[] | null {
  if (index < 0 || index >= blocks.length) return null;
  const next = [...blocks];
  next.splice(index + 1, 0, structuredClone(blocks[index]));
  return next;
}

/**
 * "MM/DD" of a capture time. Immich's `localDateTime` is the camera's wall
 * clock written as if it were UTC, so its own digits are the local date; a
 * plain `fileCreatedAt` falls back to the browser's time zone.
 */
export function photoDateLabel(
  meta: { localDateTime?: string; fileCreatedAt?: string } | undefined,
): string | null {
  if (!meta) return null;
  const local = meta.localDateTime?.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (local) return `${local[1]}/${local[2]}`;
  if (!meta.fileCreatedAt) return null;
  const d = new Date(meta.fileCreatedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * "+ Photos" with date headings: the picked photos in capture order, each
 * day introduced by a `#####` heading such as "09/03". Photos without a known
 * date keep their pick order at the end, under no heading.
 */
export function createPhotoBlocksByDate(
  assetIds: string[],
  metaOf: (id: string) => { localDateTime?: string; fileCreatedAt?: string } | undefined,
): JournalBlock[] {
  const sortKey = (id: string) => metaOf(id)?.localDateTime ?? metaOf(id)?.fileCreatedAt ?? '';
  const dated = assetIds.filter((id) => photoDateLabel(metaOf(id)));
  const undated = assetIds.filter((id) => !photoDateLabel(metaOf(id)));
  // Stable: photos taken at the same moment keep the order they were picked in.
  dated.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const blocks: JournalBlock[] = [];
  let last: string | null = null;
  for (const id of dated) {
    const label = photoDateLabel(metaOf(id));
    if (label !== last) {
      blocks.push({ type: 'heading', level: 5, text: label as string });
      last = label;
    }
    blocks.push(...createPhotoBlocks([id]));
  }
  blocks.push(...createPhotoBlocks(undated));
  return blocks;
}
