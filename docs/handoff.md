# Handoff

## 2026-09-24: all live

- PR #1 and #2 merged and deployed via Workers Builds
- Apps Script uses one token, `3b-cf-kv-d1-read-url-shortener` in 1Password (Account: Workers KV Storage Edit, D1 Read). The old KV-only token can be deleted
- `refreshHits` and `syncToCloudflare` both run cleanly; Hits column filled

Next:
- Swap the sheet QR formula to `=IF(C2<>"",C2&"+qr.png","")` if not done, and scan one
- Set the hourly time-driven trigger for `refreshHits` if not done
- Don't delete the "CF Workers build on deploy from github" token; Workers Builds needs it

## 2026-09-24: QR images from the Worker

Done (branch `feature/worker-qr-png`):
- `slug+qr.png` and `slug+qr.svg` routes. The PNG uses a small encoder in `src/index.js` (CompressionStream for the zlib data), so there's no extra dependency
- Stats page shows and downloads these instead of building its own, so the sheet and stats page match
- Tested locally: PNG valid (990px greyscale), SVG served, unknown slug 404

Next:
- After deploy, change the sheet QR formula to `=IF(C2<>"",C2&"+qr.png","")` and scan one to confirm

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
