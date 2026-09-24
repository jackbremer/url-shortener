import { qrcode } from 'qrcode-generator';

// Add ?notrack to a short URL to follow it without adding a hit.
// It is stripped before the query params are forwarded to the destination.
const NO_TRACK_PARAM = 'notrack';

// QR images for a slug live at slug+qr.png and slug+qr.svg.
// The sheet's QR column and the stats page both use these, so every QR matches.
const QR_SUFFIX = '+qr.';
// No quiet zone, so the code runs to the edge. Scanners cope on a white background;
// on a dark or busy one, put white padding round it.
const QR_MARGIN = 0;
const QR_PNG_SIZE = 1000; // approximate width in pixels

function makeQr(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr;
}

function qrSvg(qr) {
  return qr.createSvgTag({ cellSize: 10, margin: 10 * QR_MARGIN, scalable: true });
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

// Minimal greyscale PNG encoder. PNG image data is zlib-compressed,
// which is exactly what CompressionStream('deflate') produces.
async function qrPng(qr) {
  const modules = qr.getModuleCount() + QR_MARGIN * 2;
  const scale = Math.max(1, Math.floor(QR_PNG_SIZE / modules));
  const size = modules * scale;

  // One filter byte (0 = none) at the start of each row, then one byte per pixel
  const raw = new Uint8Array((size + 1) * size).fill(255);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    const row = Math.floor(y / scale) - QR_MARGIN;
    for (let x = 0; x < size; x++) {
      const col = Math.floor(x / scale) - QR_MARGIN;
      const inside = row >= 0 && col >= 0 && row < qr.getModuleCount() && col < qr.getModuleCount();
      if (inside && qr.isDark(row, col)) raw[y * (size + 1) + 1 + x] = 0;
    }
  }
  const idat = new Uint8Array(
    await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()
  );

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  return new Blob(parts);
}

export default {
  async fetch(request, env, ctx) {
    const incoming = new URL(request.url);
    let slug = incoming.pathname.slice(1);

    // QR image: go.domain.com/slug+qr.png or slug+qr.svg
    const qrAt = slug.lastIndexOf(QR_SUFFIX);
    const qrFormat = qrAt > 0 ? slug.slice(qrAt + QR_SUFFIX.length) : '';
    if (qrFormat === 'png' || qrFormat === 'svg') {
      const qrSlug = slug.slice(0, qrAt);
      if (!(await env.URL_SHORTCUTS.get(qrSlug))) {
        return new Response('Not found', { status: 404 });
      }
      const qr = makeQr(`${incoming.protocol}//${incoming.host}/${qrSlug}`);
      const body = qrFormat === 'png' ? await qrPng(qr) : qrSvg(qr);
      return new Response(body, {
        headers: {
          'Content-Type': qrFormat === 'png' ? 'image/png' : 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Stats page: go.domain.com/slug+
    if (slug.endsWith('+')) {
      const statsSlug = slug.slice(0, -1);
      const row = await env.DB.prepare(
        'SELECT count FROM hits WHERE slug = ?'
      ).bind(statsSlug).first();
      const count = row ? row.count : 0;
      const destination = await env.URL_SHORTCUTS.get(statsSlug);
      return new Response(
        `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Stats: ${statsSlug}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; color: #111; }
    h1 { font-size: 1.25rem; margin-bottom: 4px; }
    .slug { font-size: 2rem; font-weight: 700; margin: 8px 0; }
    .count { font-size: 3.5rem; font-weight: 800; color: #2563eb; line-height: 1; margin: 24px 0 8px; }
    .label { font-size: 0.875rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
    .dest { margin-top: 32px; font-size: 0.875rem; color: #666; word-break: break-all; }
    .dest a { color: #2563eb; }
    .qr { margin-top: 40px; }
    .qr img { display: block; width: 240px; height: 240px; margin: 12px 0; }
    .qr a { font-size: 0.875rem; color: #2563eb; margin-right: 16px; }
  </style>
</head>
<body>
  <div class="label">Short link stats</div>
  <div class="slug">${incoming.host}/${statsSlug}</div>
  <div class="count">${count.toLocaleString()}</div>
  <div class="label">all-time clicks</div>
  ${destination ? `<div class="dest">→ <a href="${destination}">${destination}</a></div>
  <div class="dest"><a href="/${statsSlug}?${NO_TRACK_PARAM}">Test the short link</a> (not counted)</div>
  <div class="qr">
    <div class="label">QR code</div>
    <img src="/${statsSlug}${QR_SUFFIX}svg" alt="QR code for ${incoming.host}/${statsSlug}">
    <a href="/${statsSlug}${QR_SUFFIX}png" download="${statsSlug}-qr.png">Download PNG</a>
    <a href="/${statsSlug}${QR_SUFFIX}svg" download="${statsSlug}-qr.svg">Download SVG</a>
  </div>` : ''}
</body>
</html>`,
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      );
    }

    if (!slug) {
      return new Response('Not found', { status: 404 });
    }

    const destination = await env.URL_SHORTCUTS.get(slug);

    if (!destination) {
      return new Response('Not found', { status: 404 });
    }

    // Increment hit count after response is sent
    if (!incoming.searchParams.has(NO_TRACK_PARAM)) {
      ctx.waitUntil(
        env.DB.prepare(
          'INSERT INTO hits (slug, count) VALUES (?, 1) ON CONFLICT (slug) DO UPDATE SET count = count + 1'
        ).bind(slug).run()
      );
    }

    const dest = new URL(destination);

    // Merge any query params from the short URL onto the destination.
    // The URL API handles ?/& correctly regardless of what's already on the destination.
    for (const [key, value] of incoming.searchParams) {
      if (key === NO_TRACK_PARAM) continue;
      dest.searchParams.append(key, value);
    }

    return Response.redirect(dest.toString(), 302);
  },
};
