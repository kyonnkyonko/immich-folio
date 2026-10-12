'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useModalDialog } from '@/hooks/useModalDialog';
import { canSelectMore, matchesQuery, toggleSelection } from '@/lib/admin/assetSelection';
import { IconCheck, IconFolder, IconImage, IconSearch, IconStar } from './Icons';
import { useScrollLock } from './useScrollLock';

interface AssetInfo {
  id: string;
  originalFileName: string;
  fileCreatedAt: string;
  /** Capture time as the camera's wall clock (Immich), for date headings. */
  localDateTime?: string;
  isFavorite: boolean;
}

/** What a multi-select hands over besides the ids. */
export interface PickedExtra {
  /** Dates of a picked photo, when the picker listed it (a pasted UUID has none). */
  metaOf: (id: string) => Pick<AssetInfo, 'localDateTime' | 'fileCreatedAt'> | undefined;
  /** The "date headings" box was ticked. */
  dateHeadings: boolean;
}

const LONG_PRESS_MS = 400;
const DATE_HEADINGS_KEY = 'folio-picker-date-headings';

interface Props {
  /** Single-select: called with the one asset picked; the caller closes the picker. */
  onSelect?: (assetId: string) => void;
  /**
   * Multi-select (#602): tiles toggle, and a confirm button hands over every
   * picked asset in the order they were picked. Takes precedence over `onSelect`.
   */
  onSelectMany?: (assetIds: string[], extra: PickedExtra) => void;
  /** Offer the "date headings" box in multi-select (journal "+ Photos"). */
  dateHeadingsOption?: boolean;
  /** Most assets `onSelectMany` accepts; unlimited when omitted. */
  max?: number;
  onClose: () => void;
  currentAssetIds?: string[];
  albumId?: string;
  title?: string;
}

type Tab = 'album' | 'favorites' | 'all';

const SEARCH_DEBOUNCE_MS = 300;

export default function AssetPicker({
  onSelect,
  onSelectMany,
  max,
  onClose,
  currentAssetIds = [],
  albumId,
  title,
  dateHeadingsOption = false,
}: Props) {
  useScrollLock(true);
  const cardRef = useModalDialog(onClose);
  const multi = onSelectMany !== undefined;
  const [tab, setTab] = useState<Tab>(albumId ? 'album' : 'favorites');
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [uuidInput, setUuidInput] = useState('');
  const [uuidError, setUuidError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * Bumped each time the list starts over (tab, album or search changed). A
   * request is only allowed to touch the list while its generation is current:
   * without this, a slow Favorites answer landing after a switch to All Photos
   * replaced that tab's photos, and ended its spinner early.
   */
  const generation = useRef(0);
  const currentIds = useMemo(() => new Set(currentAssetIds), [currentAssetIds]);
  /** Every photo listed so far, across tabs and pages, so a pick keeps its date. */
  const seenMeta = useRef(new Map<string, AssetInfo>());
  const [preview, setPreview] = useState<AssetInfo | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  /** The press that just ended opened the preview: its click must not pick. */
  const longPressed = useRef(false);
  const [dateHeadings, setDateHeadings] = useState(() => {
    try {
      return localStorage.getItem(DATE_HEADINGS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    for (const a of assets) seenMeta.current.set(a.id, a);
  }, [assets]);

  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  function startPress(asset: AssetInfo, e: React.PointerEvent) {
    if (e.button !== 0) return;
    longPressed.current = false;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setPreview(asset);
    }, LONG_PRESS_MS);
  }

  function endPress() {
    window.clearTimeout(pressTimer.current);
    setPreview(null);
  }

  function toggleDateHeadings(on: boolean) {
    setDateHeadings(on);
    try {
      localStorage.setItem(DATE_HEADINGS_KEY, on ? '1' : '0');
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }

  // Debounce typing into the query the fetch runs on.
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [queryInput]);

  // The album tab loads the album whole and filters locally; the library tabs
  // search server-side, since they are paged.
  const serverQuery = tab === 'album' ? '' : query;

  const loadAssets = useCallback(
    async (pageNum: number, append: boolean = false) => {
      // A fresh list starts a generation; a further page belongs to the current one.
      const gen = append ? generation.current : ++generation.current;
      const current = () => gen === generation.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        // A "load more" of the previous list will not clear this itself.
        setLoadingMore(false);
      }

      try {
        let res: Response;
        if (tab === 'album' && albumId) {
          res = await fetch(`/api/admin/albums/${albumId}/assets`);
        } else {
          const params = new URLSearchParams({
            page: pageNum.toString(),
            favorites: tab === 'favorites' ? 'true' : 'false',
          });
          if (serverQuery) params.set('q', serverQuery);
          res = await fetch(`/api/admin/assets?${params}`);
        }
        if (res.ok) {
          const data = await res.json();
          if (!current()) return;
          setAssets((prev) => {
            if (!append) return data.assets;
            // Merged filename + description pages can overlap across pages.
            const seen = new Set(prev.map((a) => a.id));
            return [...prev, ...data.assets.filter((a: AssetInfo) => !seen.has(a.id))];
          });
          setHasMore(data.nextPage !== null);
          setPage(pageNum);
        }
      } catch (err) {
        if (current()) console.error('Failed to load assets:', err);
      } finally {
        if (current()) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [tab, albumId, serverQuery],
  );

  useEffect(() => {
    setAssets([]);
    setPage(1);
    setHasMore(false);
    loadAssets(1);
  }, [loadAssets]);

  const visible = tab === 'album' ? assets.filter((a) => matchesQuery(a, query)) : assets;

  // Infinite scroll
  function handleScroll() {
    if (!listRef.current || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadAssets(page + 1, true);
    }
  }

  function pick(id: string) {
    if (currentIds.has(id)) return;
    if (multi) setSelected((s) => toggleSelection(s, id, { disabled: currentIds, max }));
    else onSelect?.(id);
  }

  function confirm() {
    if (multi && selected.length > 0)
      onSelectMany(selected, {
        metaOf: (id) => seenMeta.current.get(id),
        dateHeadings: dateHeadingsOption && dateHeadings,
      });
  }

  function handleUuidSubmit(e: React.FormEvent) {
    e.preventDefault();
    const uuid = uuidInput.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      setUuidError('Invalid UUID format');
      return;
    }
    setUuidError('');
    if (multi) {
      setSelected((s) => toggleSelection(s, uuid.toLowerCase(), { disabled: currentIds, max }));
      setUuidInput('');
    } else {
      onSelect?.(uuid);
    }
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  const full = multi && !canSelectMore(selected, max);

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div
        className="asset-picker-modal"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="picker-header">
          <h3 id="asset-picker-title">{title || 'Select Hero Image'}</h3>
          <button className="admin-btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="asset-picker-tabs">
          {albumId && (
            <button
              className={`asset-picker-tab ${tab === 'album' ? 'active' : ''}`}
              aria-pressed={tab === 'album'}
              onClick={() => setTab('album')}
            >
              <IconFolder size={14} />
              This Album
            </button>
          )}
          <button
            className={`asset-picker-tab ${tab === 'favorites' ? 'active' : ''}`}
            aria-pressed={tab === 'favorites'}
            onClick={() => setTab('favorites')}
          >
            <IconStar size={14} />
            Favorites
          </button>
          <button
            className={`asset-picker-tab ${tab === 'all' ? 'active' : ''}`}
            aria-pressed={tab === 'all'}
            onClick={() => setTab('all')}
          >
            <IconImage size={14} />
            All Photos
          </button>
        </div>

        {/* Search */}
        <div className="asset-picker-search">
          <IconSearch size={14} />
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter in the field searches at once instead of submitting anything.
              if (e.key === 'Enter') {
                e.preventDefault();
                setQuery(queryInput.trim());
              }
            }}
            maxLength={100}
            placeholder={
              tab === 'album'
                ? 'Filter this album by filename…'
                : 'Search filename, description, or a date (2024-05)…'
            }
            aria-label="Search photos"
            className="asset-picker-search-input"
          />
        </div>

        {/* Asset Grid */}
        <div
          className="asset-picker-grid"
          ref={listRef}
          onScroll={handleScroll}
          role="group"
          aria-label="Photos"
        >
          {loading ? (
            <div className="asset-picker-loading">
              <div className="admin-spinner" />
            </div>
          ) : visible.length === 0 ? (
            <p className="empty-hint">
              {query
                ? `No photos match “${query}”.`
                : tab === 'favorites'
                  ? 'No favorite photos found. Star photos in Immich first, or switch to "All Photos".'
                  : 'No photos found.'}
            </p>
          ) : (
            <>
              {visible.map((asset) => {
                const isUsed = currentIds.has(asset.id);
                const order = selected.indexOf(asset.id);
                const isSelected = order !== -1;
                const blocked = isUsed || (full && !isSelected);
                const label = `${asset.originalFileName}, ${formatDate(asset.fileCreatedAt)}${
                  isUsed ? ' (already used)' : ''
                }`;
                return (
                  <button
                    type="button"
                    key={asset.id}
                    className={`asset-picker-tile ${isUsed ? 'used' : ''} ${
                      isSelected ? 'selected' : ''
                    }`}
                    onClick={() => {
                      if (longPressed.current) {
                        longPressed.current = false;
                        return;
                      }
                      pick(asset.id);
                    }}
                    onPointerDown={(e) => startPress(asset, e)}
                    onPointerUp={endPress}
                    onPointerLeave={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={blocked}
                    aria-pressed={multi ? isSelected : undefined}
                    aria-label={label}
                    title={`${asset.originalFileName}\n${formatDate(asset.fileCreatedAt)}\n長按看大圖`}
                  >
                    <img src={`/api/admin/thumbnail/${asset.id}`} alt="" loading="lazy" />
                    {isUsed && (
                      <span className="asset-picker-used-badge" aria-hidden="true">
                        <IconCheck size={11} />
                      </span>
                    )}
                    {isSelected && (
                      <span className="asset-picker-order-badge" aria-hidden="true">
                        {max === 1 ? <IconCheck size={11} /> : order + 1}
                      </span>
                    )}
                    {asset.isFavorite && !isUsed && (
                      <span className="asset-picker-fav-badge" aria-hidden="true">
                        <IconStar size={14} />
                      </span>
                    )}
                  </button>
                );
              })}
              {loadingMore && (
                <div className="asset-picker-loading-more">
                  <div className="admin-spinner" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Selection bar (multi-select) */}
        {multi && (
          <div className="asset-picker-selection">
            <span aria-live="polite">
              {selected.length === 0
                ? max && max > 1
                  ? `Pick up to ${max} photos`
                  : 'Pick photos'
                : `${selected.length}${max && max > 1 ? ` of ${max}` : ''} selected`}
            </span>
            {dateHeadingsOption && (
              <label className="asset-picker-date-headings">
                <input
                  type="checkbox"
                  checked={dateHeadings}
                  onChange={(e) => toggleDateHeadings(e.target.checked)}
                />
                依日期加小標（##### 09/03）
              </label>
            )}
            {selected.length > 0 && (
              <button
                type="button"
                className="admin-btn admin-btn-sm"
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              disabled={selected.length === 0}
              onClick={confirm}
            >
              {selected.length > 1 ? `Add ${selected.length} photos` : 'Add photo'}
            </button>
          </div>
        )}

        {preview && (
          <div className="asset-picker-preview" aria-hidden="true">
            <img src={`/api/admin/thumbnail/${preview.id}?size=preview`} alt="" />
            <span>
              {preview.originalFileName} ·{' '}
              {formatDate(preview.localDateTime ?? preview.fileCreatedAt)}
            </span>
          </div>
        )}

        {/* UUID Fallback */}
        <div className="asset-picker-uuid-section">
          <form onSubmit={handleUuidSubmit} className="asset-picker-uuid-form">
            <input
              type="text"
              value={uuidInput}
              onChange={(e) => {
                setUuidInput(e.target.value);
                setUuidError('');
              }}
              placeholder="Or paste asset UUID directly..."
              aria-label="Asset UUID"
              className="asset-picker-uuid-input"
            />
            <button type="submit" className="admin-btn admin-btn-sm" disabled={!uuidInput.trim()}>
              Add
            </button>
          </form>
          {uuidError && <span className="asset-picker-uuid-error">{uuidError}</span>}
        </div>
      </div>
    </div>
  );
}
