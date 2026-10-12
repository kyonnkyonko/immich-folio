/**
 * Live Photo route (fork) — streams the motion clip of a published Live Photo.
 * Same rules as /api/video, but the token is the *still's*: the still must be
 * published, and the clip is looked up from it (livePhotoVideoId).
 *
 * Supports HTTP Range requests (required for <video> seeking in browsers).
 *
 * Usage: GET /api/live/:token
 *        GET /api/live/:token  (with Range header for seeking)
 * The :token is an encoded asset ID (not a raw UUID).
 */

import { NextRequest, NextResponse } from 'next/server';
import { immich, ImmichUnavailableError } from '@/lib/immich';
import { isPublishedAsset } from '@/lib/publishedAssets';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { decodeAssetId } from '@/lib/tokens';
import { getConfig } from '@/lib/config';
import { checkRateLimit, getClientIp, retryAfterSeconds } from '@/lib/rate-limit';
import { siteLockResponse } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // ── Rate limiting ──────────────────────────────────
  const ip = getClientIp(request);
  const { success, remaining, resetAt } = checkRateLimit(`live:${ip}`, getConfig().rateLimitRpm);

  if (!success) {
    const retryAfter = retryAfterSeconds(resetAt);
    console.warn(`[Live API] ⚠️ Rate limit exceeded for IP: ${ip}. Retry after ${retryAfter}s`);
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' },
      },
    );
  }

  // The page-level gate does not cover route handlers — without this a locked
  // site would still serve to anyone holding the URL.
  const locked = siteLockResponse(request);
  if (locked) return locked;

  const { id: token } = await params;

  // Decode the opaque token back to an Immich asset ID
  const assetId = decodeAssetId(token);
  if (!assetId) {
    console.error(`[Live API] ❌ Invalid token: ${token.substring(0, 10)}...`);
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Only what the site currently shows (GHSA-gfh4-6275-9gqv): a token stays
  // decodable forever, so an unpublished album or a revoked proofing link
  // would otherwise keep serving. Signed-in admins pass for previews.
  if (!(await isPublishedAsset(assetId)) && !(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Forward Range header from browser (needed for <video> seeking)
  const rangeHeader = request.headers.get('range');

  let result;
  try {
    // The token names the still, which is what gets published; its motion
    // clip is a hidden VIDEO asset Immich pairs with it.
    const still = await immich.getAssetInfo(assetId);
    const motionId = still?.type === 'IMAGE' ? still.livePhotoVideoId : null;
    if (!motionId) {
      return NextResponse.json(
        { error: 'Not a Live Photo' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    result = await immich.streamVideo(motionId, rangeHeader);
  } catch (error) {
    // Same reasoning as the image route: an outage mid-playback must not be
    // cached as a permanently missing video.
    if (error instanceof ImmichUnavailableError) {
      console.error(`[Live API] Immich unavailable for ${assetId}:`, error.message);
      return NextResponse.json(
        { error: 'Immich is currently unavailable' },
        { status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' } },
      );
    }
    throw error;
  }

  if (!result) {
    console.error(`[Live API] ❌ Asset not found in Immich: ${assetId}`);
    return NextResponse.json(
      { error: 'Asset not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let contentType = result.contentType.toLowerCase();
  if (!contentType.startsWith('video/') && !contentType.startsWith('audio/')) {
    contentType = 'application/octet-stream';
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    // Videos are immutable once uploaded — cache aggressively
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    'X-RateLimit-Remaining': String(remaining),
  };

  if (result.contentLength) {
    headers['Content-Length'] = result.contentLength;
  }
  if (result.contentRange) {
    headers['Content-Range'] = result.contentRange;
  }

  return new NextResponse(result.stream, {
    status: result.status,
    headers,
  });
}
