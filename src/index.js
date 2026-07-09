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
  </style>
</head>
<body>
  <div class="label">Short link stats</div>
  <div class="slug">${incoming.host}/${statsSlug}</div>
  <div class="count">${count.toLocaleString()}</div>
  <div class="label">all-time clicks</div>
  ${destination ? `<div class="dest">→ <a href="${destination}">${destination}</a></div>` : ''}
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
    ctx.waitUntil(
      env.DB.prepare(
        'INSERT INTO hits (slug, count) VALUES (?, 1) ON CONFLICT (slug) DO UPDATE SET count = count + 1'
      ).bind(slug).run()
    );

    const dest = new URL(destination);

    // Merge any query params from the short URL onto the destination.
    // The URL API handles ?/& correctly regardless of what's already on the destination.
    for (const [key, value] of incoming.searchParams) {
      dest.searchParams.append(key, value);
    }

    return Response.redirect(dest.toString(), 302);
  },
};
