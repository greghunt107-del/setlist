import { Readable } from 'stream';

// ── Streams a user-uploaded workout video back to the browser ────────────────
// The Blob store is private (correct -- these are personal video uploads),
// so a bare <video src="..."> can't play it: the browser can't attach the
// Authorization header a private blob read requires. This endpoint fetches
// the blob server-side (with BLOB_READ_WRITE_TOKEN) and re-streams the bytes,
// forwarding Range requests so seeking/scrubbing still works.
//
// The `url` param is restricted to our own Blob storage hostname -- without
// that check this would be an open proxy, fetchable with any URL an attacker
// wants relayed through our server.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid url' }); }
  if (!parsed.hostname.endsWith('.blob.vercel-storage.com')) {
    return res.status(400).json({ error: 'URL not allowed' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
    });
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: `Blob fetch failed: ${upstream.status}` });
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('Video proxy error:', err);
    res.status(500).json({ error: err.message });
  }
}
