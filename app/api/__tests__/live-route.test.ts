import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/** Fork: /api/live/<still token> streams the motion clip of a published Live Photo. */

const getAssetInfo = vi.fn();
const streamVideo = vi.fn();
const isPublishedAsset = vi.fn();

vi.mock('@/lib/immich', () => ({
  immich: {
    getAssetInfo: (id: string) => getAssetInfo(id),
    streamVideo: (id: string, r: string | null) => streamVideo(id, r),
  },
  ImmichUnavailableError: class extends Error {},
}));
vi.mock('@/lib/publishedAssets', () => ({
  isPublishedAsset: (id: string) => isPublishedAsset(id),
}));
vi.mock('@/lib/admin/auth', () => ({ isAdminAuthenticated: async () => false }));
vi.mock('@/lib/tokens', () => ({
  decodeAssetId: (t: string) => (t === 'bad' ? null : `still-${t}`),
}));
vi.mock('@/lib/config', () => ({ getConfig: () => ({ rateLimitRpm: 1000 }) }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true, remaining: 99, resetAt: 0 }),
  getClientIp: () => '127.0.0.1',
  retryAfterSeconds: () => 1,
}));
vi.mock('@/lib/auth', () => ({ siteLockResponse: () => null }));

const call = async (token: string) => {
  const { GET } = await import('../live/[id]/route');
  return GET(new NextRequest(`http://x/api/live/${token}`), {
    params: Promise.resolve({ id: token }),
  });
};

beforeEach(() => {
  getAssetInfo.mockReset();
  streamVideo.mockReset();
  isPublishedAsset.mockReset();
});

describe('GET /api/live/[token]', () => {
  it('streams the paired motion clip of a published still', async () => {
    isPublishedAsset.mockResolvedValue(true);
    getAssetInfo.mockResolvedValue({ id: 'still-a', type: 'IMAGE', livePhotoVideoId: 'motion-a' });
    streamVideo.mockResolvedValue({
      stream: 'bytes',
      status: 200,
      contentType: 'video/quicktime',
      contentLength: '5',
    });
    const res = await call('a');
    expect(res.status).toBe(200);
    expect(isPublishedAsset).toHaveBeenCalledWith('still-a');
    expect(streamVideo).toHaveBeenCalledWith('motion-a', null);
    expect(res.headers.get('content-type')).toBe('video/quicktime');
  });

  it('refuses a still that is not published, without touching Immich', async () => {
    isPublishedAsset.mockResolvedValue(false);
    const res = await call('a');
    expect(res.status).toBe(404);
    expect(getAssetInfo).not.toHaveBeenCalled();
    expect(streamVideo).not.toHaveBeenCalled();
  });

  it('is a 404 for a photo that is not a Live Photo', async () => {
    isPublishedAsset.mockResolvedValue(true);
    getAssetInfo.mockResolvedValue({ id: 'still-a', type: 'IMAGE', livePhotoVideoId: null });
    expect((await call('a')).status).toBe(404);
    expect(streamVideo).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    expect((await call('bad')).status).toBe(400);
  });
});
