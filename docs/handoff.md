# Handoff

## 2026-09-24: QR images from the Worker

Done (branch `feature/worker-qr-png`):
- `slug+qr.png` and `slug+qr.svg` routes. The PNG uses a small encoder in `src/index.js` (CompressionStream for the zlib data), so there's no extra dependency
- Stats page shows and downloads these instead of building its own, so the sheet and stats page match
- Tested locally: PNG valid (990px greyscale), SVG served, unknown slug 404

Next:
- After deploy, change the sheet QR formula to `=IF(C2<>"",C2&"+qr.png","")` and scan one to confirm
- `refreshHits` gets 403 code 7403 from D1: the token needs Account, D1, Read on the right account

Gotchas:
- `wrangler dev` can leave a `workerd` process holding port 8793 after wrangler is killed. Kill workerd too

## 2026-09-23: Hits column, stats page QR, ?notrack

Done (branch `feature/hits-qr-notrack`):
- `refreshHits()` in `appsscript/sync.gs` reads D1 over the REST API and fills the column headed "Hits"
- Stats page (`slug+`) shows a QR for the short link, with SVG and PNG downloads, generated in the Worker (`qrcode-generator`)
- `?notrack` redirects without counting and is stripped before forwarding
- Added `package.json` with npm (not pnpm: the Workers Builds image has pnpm 10.11, which may not read a pnpm 12 lockfile)
- Tested locally with `wrangler dev`: redirect counts, `?notrack` doesn't count and strips the param, stats page renders

Next:
- Merge and check the Workers Builds deploy installs deps and succeeds
- Paste the new `sync.gs` into Apps Script, add `CF_D1_DATABASE_ID`, add D1 Read to the token, add a "Hits" header, set an hourly trigger
- Then turn `refreshHits` green in `docs/architecture.md`
- Parked: multiple domains (Cloudflare for SaaS custom hostnames if they sit in other accounts)

Gotchas:
- Sheet QR column uses api.qrserver.com; stats page QR is generated locally. Both encode the same short URL, but they look slightly different
- `npm audit` flags lodash-es via `@probelabs/maid` (dev-only diagram linter, not in the Worker bundle)
- `fullSyncToCloudflare` reads only the first page of KV keys (1000); fine until there are more slugs than that
