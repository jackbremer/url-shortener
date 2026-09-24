import { qrcode } from 'qrcode-generator';

// Add ?notrack to a short URL to follow it without adding a hit.
// It is stripped before the query params are forwarded to the destination.
const NO_TRACK_PARAM = 'notrack';

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 10, margin: 40, scalable: true });
}

export default {
  async fetch(request, env, ctx) {
    const incoming = new URL(request.url);
    let slug = incoming.pathname.slice(1);

    // Stats page: go.domain.com/slug+
    if (slug.endsWith('+')) {
      const statsSlug = slug.slice(0, -1);
      const row = await env.DB.prepare(
        'SELECT count FROM hits WHERE slug = ?'
      ).bind(statsSlug).first();
      const count = row ? row.count : 0;
      const destination = await env.URL_SHORTCUTS.get(statsSlug);
      const shortUrl = `${incoming.protocol}//${incoming.host}/${statsSlug}`;
      const svg = destination ? qrSvg(shortUrl) : '';
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
    .qr svg { display: block; width: 240px; height: 240px; margin: 12px 0; }
    .qr a, .qr button { font: inherit; font-size: 0.875rem; color: #2563eb; background: none; border: 0; padding: 0; margin-right: 16px; cursor: pointer; text-decoration: underline; }
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
    ${svg}
    <a href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" download="${statsSlug}-qr.svg">Download SVG</a>
    <button type="button" id="png">Download PNG</button>
  </div>
  <script>
    // Draw the SVG onto a canvas at print size and save it as a PNG
    document.getElementById('png').addEventListener('click', () => {
      const svg = document.querySelector('.qr svg');
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1024;
        const c = canvas.getContext('2d');
        c.fillStyle = '#fff';
        c.fillRect(0, 0, 1024, 1024);
        c.drawImage(img, 0, 0, 1024, 1024);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = '${statsSlug}-qr.png';
        a.click();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML);
    });
  </script>` : ''}
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
