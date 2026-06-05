export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const slug = incoming.pathname.slice(1);

    if (!slug) {
      return new Response('Not found', { status: 404 });
    }

    const destination = await env.URL_SHORTCUTS.get(slug);

    if (!destination) {
      return new Response('Not found', { status: 404 });
    }

    const dest = new URL(destination);

    // Merge any query params from the short URL onto the destination.
    // The URL API handles ?/& correctly regardless of what's already on the destination.
    for (const [key, value] of incoming.searchParams) {
      dest.searchParams.append(key, value);
    }

    return Response.redirect(dest.toString(), 301);
  },
};
