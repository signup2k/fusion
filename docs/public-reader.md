# Public reader

The optional public hostname provides anonymous, read-only access to all current
feed sources and their articles published during the rolling last 168 hours.
It uses the existing database and pull service. Adding, renaming, or deleting a
feed on the private site is reflected by the next public query; new articles
appear after the existing pull service ingests them.

## Configuration

Set `FUSION_PUBLIC_HOST` to a hostname without a scheme, port, or path, and route
that hostname to the same backend as the private site. Leave it unset to disable
all anonymous public API routes. The private site continues to require its
existing password or OIDC session.

For this deployment, `PUBLIC_HOST` in `deploy.sh` defaults to
`rss2.iooi-forfun.cc`. `PUBLIC_HOST='' ./deploy.sh` disables the public reader.
The deployment script persists the setting in Compose and verifies the public
API and frontend on the candidate container before switching production.

A Caddy site can use the existing local origin:

```caddy
rss2.iooi-forfun.cc {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8010
}
```

The backend checks the request hostname itself. It serves the public HTML entry
on the configured host and blocks private pages, authentication, Fever, and
management routes there, including when a valid private session is supplied.
All writes on the public hostname return `405`. Private-host CORS permissions
are not extended to the public origin.

## API

These endpoints are available only on the configured public hostname:

- `GET /api/public/feeds`: `{data: [{id, name, site_url?}]}`.
- `GET /api/public/items`: a preview page with `data`, `next_cursor`,
  `window_start`, and `window_end`. Optional parameters are `feed_id`, `limit`,
  and `before`. The default page size is 30 and the existing API limit applies.
- `GET /api/public/items/{id}`: `{data: {id, feed_id, title, link, content?, pub_date}}`.

Lists use publication time descending, then ID descending, with the existing
`<pub_date>_<id>` cursor format. Both lists and details apply a server-selected
168-hour window and exclude future-dated articles. An expired or deleted article
returns `404` even when requested directly by ID. Articles without a date follow
the existing parser fallback to their initial ingestion time.

No read state, bookmark data, unread counts, feed URLs, proxy settings, filtering
rules, or fetch diagnostics are included. Public queries do not write to the
database or create sessions. Public API responses use `Cache-Control: no-store`.
The public client omits credentials and queries feeds and articles every minute;
this only reads already-ingested content and does not trigger feed pulls.

## Verification

`backend/internal/handler/public_test.go` covers chronological pagination,
publication windows on lists and details, source filtering and source changes,
read-state isolation, absent private metadata, disabled-by-default access,
private authentication, origin isolation, and denied writes with an owner session.
The public frontend uses a separate Vite entry and shares only display utilities,
content sanitization, theme styling, and UI primitives with the private app.
