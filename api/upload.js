import { handleUpload } from '@vercel/blob/client';
import { checkRateLimit, getClientIp } from './analyze.js';

// ── File-upload endpoint for Track A (accuracy backstop) ─────────────────────
// Issues short-lived client tokens so the browser uploads video directly to
// Vercel Blob, bypassing Vercel's ~4.5MB serverless request-body cap. The
// Blob API key never reaches the client -- only a scoped, time-limited token
// does. handleUpload() requires BLOB_READ_WRITE_TOKEN specifically (OIDC is
// not accepted for client-token signing); create a Blob store in the Vercel
// dashboard and connect it to this project to get that env var, then copy
// the same value into your local .env for local testing.
//
// No user accounts yet (Phase 2), so IP rate limiting is the authorization
// gate here -- same store and limits as /api/analyze, reused directly.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB -- generous for a single reel/short, bounded against abuse

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, 'upload');
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSec));
    return res.status(429).json({
      error: 'Rate limit exceeded: max 10 uploads per hour. Try again later.',
      retryAfterSec: limit.retryAfterSec,
    });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['video/*'],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ ip }),
      }),
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // No database yet (Phase 2) -- just confirms the round trip.
        // Won't fire on localhost; Vercel Blob can't reach a local callback URL.
        console.log('Upload completed:', blob.url, tokenPayload);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('Upload token error:', err);
    // Vercel Blob retries the onUploadCompleted webhook 5x on non-200, so a
    // 400 here specifically means "token request failed", not "upload failed".
    return res.status(400).json({ error: err.message });
  }
}
