# URL Shortener — Google Sheets + Cloudflare Workers

A self-hosted, zero-maintenance URL shortener that uses a private Google Sheet as its admin UI and Cloudflare Workers + KV as the serving layer.

No third-party shortlink services. No ongoing servers. Edit a spreadsheet → short URL is live within seconds.

```
go.yourdomain.com/blog  →  https://your-actual-long-url.com/path
```

Optional: add hit tracking with Cloudflare D1 and a Bitly-style stats page (`go.yourdomain.com/blog+`).

---

## How it works

```
Google Sheet (private)
  → Apps Script on-edit trigger
    → Cloudflare KV (stores slug → URL pairs)
      → Cloudflare Worker (reads KV, returns 302 redirect)
```

Your Google Sheet stays completely private — it's never published or exposed. When you add or edit a row, a Google Apps Script automatically pushes the change to Cloudflare KV. The Worker serves redirects directly from KV, so there's no runtime dependency on Google at all.

---

## Features

- **Fast** — redirects served from Cloudflare's edge, KV lookup is sub-millisecond
- **Private** — your sheet is never public; KV values aren't enumerable via the Worker
- **Query param forwarding** — `go.domain.com/blog?ref=twitter` appends `ref=twitter` to the destination URL, merging correctly whether the destination already has params or not
- **Optional hit tracking** — lifetime click counts stored in Cloudflare D1, with a public stats page at `slug+`
- **Free** — runs entirely on Cloudflare's free tier
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

Note the `id` value in the output — you'll need it in step 2.

### 2. (Optional) Create the D1 database for hit tracking

Skip this step if you don't need click counts.

```bash
npx wrangler d1 create url-shortener-hits
```

Note the `database_id` in the output, then create the table:

```bash
npx wrangler d1 execute url-shortener-hits --remote --command \
  "CREATE TABLE IF NOT EXISTS hits (slug TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);"
```

### 3. Configure `wrangler.jsonc`

Edit `wrangler.jsonc` and replace the placeholders:

```jsonc
{
  "name": "url-shortener",
  "main": "src/index.js",
  "compatibility_date": "2025-01-01",
  "kv_namespaces": [
    {
      "binding": "URL_SHORTCUTS",
      "id": "YOUR_KV_NAMESPACE_ID"        // ← from step 1
    }
  ],
  // Remove this block entirely if you skipped step 2
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "url-shortener-hits",
      "database_id": "YOUR_D1_DATABASE_ID" // ← from step 2
    }
  ],
  "routes": [
    {
      "pattern": "go.yourdomain.com/*",    // ← your short domain or subdomain
      "zone_name": "yourdomain.com"         // ← your Cloudflare zone
    }
  ]
}
```

If you skipped the D1 step, also remove the stats page and hit counter code from `src/index.js` (the `slug+` block and the `ctx.waitUntil` call).

### 4. Deploy the Worker

```bash
npx wrangler deploy
```

### 5. Add a DNS record

In the Cloudflare dashboard, add a DNS record for your subdomain:

- **Type:** AAAA
- **Name:** `go` (or whatever subdomain you chose)
- **Content:** `100::` (a dummy IPv6 address — the Worker intercepts before it's used)
- **Proxy:** ✅ Proxied (orange cloud)

---

## Setup: Cloudflare Git integration (recommended, replaces manual deploy)

Connect your GitHub repo to Cloudflare for automatic deploys on every push — no GitHub Actions or secrets needed.

1. In the Cloudflare dashboard: **Workers & Pages → url-shortener → Settings → Build**
2. Connect your GitHub repo and set:

**Build command:**
```
sed -i "s/YOUR_KV_NAMESPACE_ID/$KV_NAMESPACE_ID/g; s/YOUR_D1_DATABASE_ID/$D1_DATABASE_ID/g; s/YOUR_DOMAIN\/\*/$SHORT_DOMAIN\/*/g; s/YOUR_ZONE/$ZONE_NAME/g" wrangler.jsonc
```

If you're not using D1, use this simpler build command instead:
```
sed -i "s/YOUR_KV_NAMESPACE_ID/$KV_NAMESPACE_ID/g; s/YOUR_DOMAIN\/\*/$SHORT_DOMAIN\/*/g; s/YOUR_ZONE/$ZONE_NAME/g" wrangler.jsonc
```

**Deploy command:** `npx wrangler deploy`

3. Add these **Build variables** (keep real values out of the repo):

| Variable | Value |
|---|---|
| `KV_NAMESPACE_ID` | Your KV namespace ID |
| `SHORT_DOMAIN` | e.g. `go.yourdomain.com` |
| `ZONE_NAME` | e.g. `yourdomain.com` |
| `D1_DATABASE_ID` | Your D1 database ID *(omit if not using hit tracking)* |

---

## Setup: Google Sheet

### 1. Create the sheet

Make a new Google Sheet with these columns in row 1:

| A | B | C | D |
|---|---|---|---|
| slug | url | short_url | notes |

For column C, add this formula in C2 and drag down (shows the short link, only when both A and B are filled):
```
=IF(AND(A2<>"",B2<>""),"https://go.yourdomain.com/"&A2,"")
```

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
| `CF_KV_NAMESPACE_ID` | The KV namespace ID from Cloudflare setup step 1 |

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

### 5. Add sheet buttons (optional but recommended)

**Sync Now** — re-pushes all rows to KV (useful if the trigger misfires):
1. **Insert → Drawing** → draw a rectangle, label it "Sync Now"
2. Click the drawing → three-dot menu → **Assign script** → `syncToCloudflare`

**Full Sync** — wipes all KV entries and re-pushes everything. Use this after deleting rows, so removed slugs stop redirecting:
1. **Insert → Drawing** → draw a rectangle, label it "Full Sync"
2. Click the drawing → three-dot menu → **Assign script** → `fullSyncToCloudflare`

---

## Usage

Add a row to your sheet:

| slug | url | short_url | notes |
|---|---|---|---|
| blog | https://my-blog.com/a-long-post-title | *(auto-filled)* | Main blog |

Within a few seconds, `go.yourdomain.com/blog` redirects to your destination.

**Editing a slug or URL** also syncs automatically.

**Deleting a row** does not remove it from Cloudflare automatically — use the Full Sync button after deleting rows.

**Query param forwarding:**
`go.yourdomain.com/blog?ref=twitter` → `https://my-blog.com/post?existing=param&ref=twitter`

**Stats page** *(if hit tracking is enabled)*:
`go.yourdomain.com/blog+` shows the all-time click count and destination URL for that slug.

---

## Security

- Your Google Sheet is private — not published, not shared
- The Cloudflare API token stored in Apps Script has minimal scope (KV edit only)
- The Worker never exposes a list of slugs — unknown slugs return a plain 404
- Hit counts are public (via the `slug+` page) but contain no personal data

---

## Cost

Everything runs on free tiers:

| Service | Free tier |
|---|---|
| Cloudflare Workers | 100,000 requests/day |
| Cloudflare KV | 100,000 reads/day, 1,000 writes/day, 1 GB storage |
| Cloudflare D1 | 5 million reads/day, 100,000 writes/day, 5 GB storage |
| Google Apps Script | Free |

For typical personal or small-business use, the cost is $0/month.

---

## Licence

MIT
