# Architecture

```mermaid
flowchart TD
  subgraph s1["1 . Edit"]
    editor(("Editor adds or edits a row"))
    sheet{{"Google Sheet<br>slug, url, short_url, notes, QR, Hits"}}
  end
  subgraph s2["2 . Sync"]
    sync["Apps Script syncToCloudflare<br>on-edit trigger, Full Sync button"]
    refresh["Apps Script refreshHits<br>time-driven trigger"]
  end
  subgraph s3["3 . Store"]
    kv[(KV URL_SHORTCUTS<br>slug to url)]
    d1[(D1 url-shortener-hits<br>hits: slug, count)]
  end
  subgraph s4["4 . Serve"]
    worker["Worker src/index.js<br>302 redirect, ?notrack skips count"]
    stats{{"Stats page slug+<br>count, test link, QR download"}}
  end
  visitor(["Visitor or QR scan"])
  dest(["Destination site"])

  editor --> sheet
  sheet --> sync
  sync -->|REST PUT| kv
  visitor --> worker
  worker -->|get| kv
  worker -->|count +1| d1
  worker --> dest
  worker --> stats
  refresh -.->|REST query| d1
  refresh -.->|writes Hits| sheet

  classDef built fill:#e9f6ef,stroke:#0d9268,stroke-width:2px,color:#111
  classDef todo fill:#fdeceb,stroke:#e03131,stroke-width:2px,color:#111
  class editor,sheet,sync,kv,d1,worker,stats,visitor,dest built
  class refresh todo
```

Shapes: stadium = outside world, rectangle = code that runs, cylinder = data store, hexagon = UI surface, circle = human step.

## Not built yet

| Piece | State | Evidence |
|---|---|---|
| `refreshHits` | Code written on `feature/hits-qr-notrack`, not pasted into Apps Script yet | `appsscript/sync.gs`; needs `CF_D1_DATABASE_ID` property and D1 Read on the token |

The stats page QR and `?notrack` ship with the Worker on the same branch. They go live when it's merged and Workers Builds deploys.
