# Handoff

## 2026-10-07: QR generator at /qr

Done (branch `feature/qr-generator`):
- `/qr` page (`src/qr-page.js`): link/text, Wi-Fi, phone, SMS, email and contact (vCard 3.0), with PNG (about 1000px) and SVG downloads, no margin
- Runs in the browser. The library loads from jsDelivr, pinned to 2.0.4 with an integrity hash
- Library default encoding drops non-ASCII; the page switches it to UTF-8
- Tested in the browser pane: link/text, Wi-Fi, phone and contact PNGs decode back to their exact payload (BarcodeDetector), including UTF-8; SMS and email payloads checked as text; over-long input shows an error; no sideways scroll at 375px
- Live and checked on go.3bweb.com/qr, and Jack tested the codes on a real phone

Gotchas:
- `qr` is now a reserved path, not usable as a slug
- Don't add a long Cache-Control to the page; browsers then keep the old version after a deploy
- When upgrading qrcode-generator, update the jsDelivr URL and integrity hash in `src/qr-page.js` too: `openssl dgst -sha384 -binary node_modules/qrcode-generator/dist/qrcode.js | openssl base64 -A`

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
