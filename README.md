# URL Shortener — Google Sheets + Cloudflare Workers

A self-hosted, zero-maintenance URL shortener that uses a private Google Sheet as its admin UI and Cloudflare Workers + KV as the serving layer.

No database. No third-party shortlink services. No ongoing servers. Edit a spreadsheet → short URL is live within seconds.

```
go.yourdomain.com/blog  →  https://your-actual-long-url.com/path
```

---

## How it works

```
Google Sheet (private)
  → Apps Script on-edit trigger
    → Cloudflare KV (stores slug → URL pairs)
      → Cloudflare Worker (reads KV, returns 301 redirect)
```

Your Google Sheet stays completely private — it's never published or exposed. When you add or edit a row, a Google Apps Script automatically pushes the change to Cloudflare KV. The Worker serves redirects directly from KV, so there's no runtime dependency on Google at all.

---

## Features

- **Fast** — redirects served from Cloudflare's edge, KV lookup is sub-millisecond
- **Private** — your sheet is never public; KV values aren't enumerable via the Worker
- **Query param forwarding** — `go.domain.com/blog?ref=twitter` appends `ref=twitter` to the destination URL, merging correctly whether the destination already has params or not
- **Free** — runs entirely on Cloudflare's free tier (100k requests/day, 1k KV writes/day)
- **No maintenance** — nothing to update, patch, or restart

> **Note on hash fragments (`#anchor`):** Browsers strip `#` fragments before sending HTTP requests, so they can't be forwarded server-side. This is an HTTP limitation, not a gap in this implementation.

---

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- A domain on Cloudflare (or a subdomain of one)
- A Google account
- [Node.js](https://nodejs.org/) installed locally (for the one-time deploy)

---

## Setup: Cloudflare

### 1. Create the KV namespace

```bash
npx wrangler kv namespace create URL_SHORTCUTS
```

Note the `id` value in the output — you'll need it next.

### 2. Configure `wrangler.jsonc`

Edit `wrangler.jsonc` and replace the placeholders:

```jsonc
{
  "name": "url-shortener",
  "main": "src/index.js",
  "compatibility_date": "2025-01-01",
  "kv_namespaces": [
    {
      "binding": "URL_SHORTCUTS",
      "id": "YOUR_KV_NAMESPACE_ID"   // ← paste the ID from step 1
    }
  ],
  "routes": [
    {
      "pattern": "go.yourdomain.com/*",   // ← your short domain or subdomain
      "zone_name": "yourdomain.com"        // ← your Cloudflare zone
    }
  ]
}
```

### 3. Deploy the Worker

```bash
npx wrangler deploy
```

### 4. Add a DNS record

In the Cloudflare dashboard, add a DNS record for your subdomain pointing to the Worker:

- **Type:** AAAA
- **Name:** go (or whatever subdomain you chose)
- **Content:** `100::` (a dummy IPv6 address — the Worker intercepts before it's used)
- **Proxy:** ✅ Proxied (orange cloud)

---

## Setup: GitHub Actions auto-deploy (optional)

To have Cloudflare redeploy the Worker automatically on every push to `main`:

1. In your GitHub repo, go to **Settings → Secrets and variables → Actions** and add:
   - `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with Workers Scripts:Edit permission
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID

2. Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## Setup: Google Sheet

### 1. Create the sheet

Make a new Google Sheet with these columns in row 1:

| A | B | C |
|---|---|---|
| slug | url | notes |

### 2. Add the Apps Script

1. In your sheet: **Extensions → Apps Script**
2. Delete any existing code and paste the contents of [`appsscript/sync.gs`](appsscript/sync.gs)
3. Save (Ctrl/Cmd + S)

### 3. Add Script Properties

1. In the Apps Script editor: **Project Settings** (gear icon) → **Script Properties**
2. Add these three properties:

| Property | Value |
|---|---|
| `CF_API_TOKEN` | A Cloudflare API token — see below |
| `CF_ACCOUNT_ID` | Your Cloudflare account ID (found in the Cloudflare dashboard sidebar) |
| `CF_KV_NAMESPACE_ID` | The KV namespace ID from step 1 of the Cloudflare setup |

**Creating the Cloudflare API token:**
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token → Custom Token**
3. Permissions: `Workers KV Storage` → `Edit`
4. Scope it to your account
5. Copy the token into Script Properties

### 4. Set up the on-edit trigger

1. In Apps Script: **Triggers** (clock icon) → **+ Add Trigger**
2. Settings:
   - Function: `syncToCloudflare`
   - Event source: **From spreadsheet**
   - Event type: **On edit**
3. Save and authorise when prompted

### 5. Add a "Sync Now" button (optional but recommended)

1. In your sheet: **Insert → Drawing** → draw a rectangle, add text "Sync Now"
2. Click the drawing → three-dot menu → **Assign script** → `syncToCloudflare`

---

## Usage

Add a row to your sheet:

| slug | url | notes |
|---|---|---|
| blog | https://my-blog.com/a-long-post-title | Main blog |

Within a few seconds, `go.yourdomain.com/blog` redirects to your destination.

**Query param forwarding:**
`go.yourdomain.com/blog?ref=twitter` → `https://my-blog.com/a-long-post-title?ref=twitter`

If the destination already has params:
`go.yourdomain.com/blog?ref=twitter` → `https://my-blog.com/post?existing=param&ref=twitter`

---

## Security

- Your Google Sheet is private — not published, not shared
- The Cloudflare API token stored in Apps Script has minimal scope (KV edit only)
- The Worker never exposes a list of slugs — unknown slugs return a plain 404
- No personal data is collected or logged

---

## Cost

Everything runs on free tiers:

| Service | Free tier |
|---|---|
| Cloudflare Workers | 100,000 requests/day |
| Cloudflare KV | 100,000 reads/day, 1,000 writes/day, 1 GB storage |
| Google Apps Script | Free |

For typical personal or small-business use, the cost is $0/month.

---

## Licence

MIT
