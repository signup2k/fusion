# File Map

> Per-file index for AI agents. Read the relevant entry BEFORE opening a file;
> read only the line ranges the entry points to. Update entries after structural
> changes (see the repo-map skill).
> Last partial audit: 2026-07-28 | Files mapped: 47

## Project documentation

### docs/STATE.md (~5 lines, Markdown, map-updated 2026-07-25)

Purpose: Records the current handoff state and whether completed behavior specifications are awaiting user review.

### docs/behavior-specs/20260725_feed-order-folder-expansion.feature.md (~94 lines, Markdown/Gherkin, map-updated 2026-07-25)

Purpose: Defines reviewable behavior for the Simplified Chinese-only UI, feed sorting, manual movement, persistence, folder expansion, and preference recovery.

### docs/TODO.md (~39 lines, Markdown, map-updated 2026-07-22)

Purpose: Tracks actionable project work in priority order with evidence and acceptance criteria.
Status: The SQLite startup-write deployment blocker was resolved and production-verified through `4a9c880`.

### docs/openapi.yaml (~1263 lines, OpenAPI YAML, map-updated 2026-07-18)

Purpose: Documents the authenticated HTTP API contract and shared request/response schemas.
Structure:

- `/feeds/{id}/refresh` / `/feeds/{id}/check` (near L380/L398): single-feed ingestion and non-persisting health checks.
- `FeedCheckData` / `FeedCheckEnvelope` (near L1020): health-check response schema.

## Runtime configuration

### deploy.sh (~320 lines, POSIX shell, map-updated 2026-07-28)

Purpose: Deploys the already-pushed `origin/main`, builds and validates a candidate image on `bwgvps1`, then performs a backed-up production switch with rollback.
Structure:

- candidate validation (near L153): uses a read-only container with writable `/tmp` tmpfs and rejects SQLite startup errors.
- production switch (near L185): ensures Compose tmpfs, backs up SQLite, switches images, and fails on startup or persistent SQLite errors.
- retention cleanup (near L90/L300): after successful validation, keeps the five newest database backups and three newest application images.
Gotchas: Local uncommitted changes are ignored because deployment always resolves the commit from `origin/main`; callers must push before deploying.

### .env.example (~64 lines, dotenv, map-updated 2026-07-16)

Purpose: Documents supported runtime environment variables and deployment defaults.
Gotchas: No translation provider, model, timeout, concurrency, or cost-control settings exist today.

## Backend data model and persistence

### backend/internal/store/store.go (~73 lines, Go, map-updated 2026-07-18)

Purpose: Opens the SQLite store, configures connections, enables WAL once, and runs migrations.
Structure:

- `New` (L24): registers connection-scoped foreign-key/busy-timeout hooks, verifies WAL mode once per database, then migrates.
Gotchas: WAL must not be set in the per-connection hook because concurrent startup connections contend on the pragma.

### backend/internal/store/store_test.go (~119 lines, Go, map-updated 2026-07-18)

Purpose: Provides shared store test helpers and covers store initialization and shutdown.
Structure:

- `TestNew` (L75): verifies connectivity and WAL initialization.

### backend/internal/model/model.go (~87 lines, Go, map-updated 2026-07-16)

Purpose: Defines the JSON-facing domain models shared by handlers and persistence.
Structure:

- `type Item` (L59): RSS item with title and a single HTML content field.
- `type Bookmark` (L72): Saved snapshot that duplicates an item's title and content.
Depends on: standard library only. Used by: store, handlers, puller, Fever API.

### backend/internal/store/migrations/001_initial.sql (~86 lines, SQL, map-updated 2026-07-16)

Purpose: Creates the core SQLite schema, including items, bookmarks, and item full-text search.
Structure:

- `items` (L31): stores one title and one content value per item.
- `items_fts` and triggers (L48): indexes title and content for search.
- `bookmarks` (L78): stores title/content snapshots separately from items.
Gotchas: Adding translated searchable fields requires updating the FTS table and triggers.

### backend/internal/store/migrations/004_limit_items_fts_update_trigger.sql (~8 lines, SQL, map-updated 2026-07-28)

Purpose: Restricts the item FTS update trigger to title/content changes so unread-only updates do not rebuild full-text rows.

### backend/internal/store/migrate.go (~143 lines, Go, map-updated 2026-07-16)

Purpose: Applies embedded, versioned SQL migrations transactionally at startup.
Structure:

- `migrate` (L20): discovers and applies unapplied `NNN_description.sql` files.
- `applyMigration` (L110): executes migration SQL and records its version atomically.
Depends on: `backend/internal/store/migrations/*.sql`, SQLite store.

### backend/internal/store/item.go (~511 lines, Go, map-updated 2026-07-28)

Purpose: Owns item CRUD, pagination, unread state, Fever item queries, and item search.
Structure:

- `ListItems` (L29) / `GetItem` (L96): select the complete item API model.
- `CreateItem` (L113) / `BatchCreateItemsIgnore` (L141): insert fetched items.
- `BatchUpdateItemsUnread` (L208): updates read state in bounded chunks and skips rows already at the target state.
- `ListFeverItems` (L331): returns items for third-party Fever clients.
- `SearchItems` (L411): searches the FTS index with a LIKE fallback.
Gotchas: Item column changes require coordinated SELECT/Scan updates in several methods.

## Feed ingestion

### backend/internal/pull/parser.go (~244 lines, Go, map-updated 2026-07-16)

Purpose: Fetch parsing support and normalization from RSS/Atom data into `ParsedItem`.
Structure:

- `type ParsedItem` (L19): normalized item passed to the puller.
- `mapItem` (L189): maps title and prefers feed content over description.
- `fallbackGUID` (L235): hashes title/content/date when the feed has no stable identifier.
Gotchas: Translation must not affect GUID generation or duplicate detection.

### backend/internal/pull/puller.go (~320 lines, Go, map-updated 2026-07-18)

Purpose: Schedules concurrent feed refreshes and persists newly parsed items.
Structure:

- `Puller.Start` (L41): periodic refresh loop.
- `pullFeed` (L84): fetches one feed, maps parsed items, batch-inserts new rows.
- `RefreshFeed` / `CheckFeed` (L272/L288): manually ingest one feed or fetch/parse it without persistence.
- item input construction (L167): current ingestion-to-store boundary.
Depends on: config, parser, pull policy, store.
Gotchas: Network fetches use configured concurrency, but `writeMu` serializes each completed feed's SQLite persistence phase.

### backend/internal/pull/puller_test.go (~247 lines, Go, map-updated 2026-07-18)

Purpose: Covers manual/all-feed refresh orchestration and non-persisting feed checks.
Structure:

- `TestCheckFeedDoesNotPersistItemsOrFetchState` (L98): verifies health checks parse content without database side effects.
- `TestRefreshAllPersistsConcurrentFetches` (near L195): verifies concurrent network fetches fully persist under production concurrency.

## Backend API and configuration

### backend/internal/handler/handler.go (~273 lines, Go, map-updated 2026-07-18)

Purpose: Composes the HTTP handler, authentication state, dependencies, and API routes.
Structure:

- `Handler` / `New` (L18/L40): require a puller supporting refresh-all, refresh-one, and check-one operations.
- `SetupRouter` (L92): registers authenticated feed routes including `POST /feeds/:id/refresh` and `/check`.

### backend/internal/handler/feed.go (~454 lines, Go, map-updated 2026-07-18)

Purpose: Exposes feed CRUD, discovery, batch creation, manual refresh, and health-check endpoints.
Structure:

- `validateFeed` (L209): discovers feed URLs from an arbitrary URL.
- `refreshFeed` / `refreshAllFeeds` (L311/L371): enqueue one-feed or all-feed ingestion.
- `checkFeed` (L341): synchronously fetches/parses one saved feed and returns health details without persistence.

### backend/internal/handler/item.go (~164 lines, Go, map-updated 2026-07-16)

Purpose: Exposes item listing, retrieval, pagination, and read-state HTTP endpoints.
Structure:

- `listItems` (L20): validates filters, queries store, returns paginated JSON.
- `getItem` (L108): returns one item by ID.
Depends on: item store and Gin response helpers.

### backend/internal/handler/search.go (~45 lines, Go, map-updated 2026-07-16)

Purpose: Exposes combined feed and item search.
Structure:

- `search` (L9): validates the query and combines store search results.
Depends on: `Store.SearchFeeds`, `Store.SearchItems`.

### backend/internal/config/config.go (~239 lines, Go, map-updated 2026-07-16)

Purpose: Loads and validates all runtime settings from environment variables.
Structure:

- `type Config` (L10): database, pull, auth, logging, and OIDC settings.
- `Load` (L42): parses defaults and constructs the runtime configuration.
Gotchas: No translation or AI provider configuration exists today.

### backend/cmd/fusion/main.go (~117 lines, Go, map-updated 2026-07-16)

Purpose: Composes configuration, store, puller, HTTP server, and shutdown lifecycle.
Structure:

- `run` (L25): starts the HTTP server and pull service in one errgroup.
Gotchas: A durable asynchronous translator would need another lifecycle-managed worker.

## Frontend item display

### frontend/src/queries/items.ts (~279 lines, TypeScript, map-updated 2026-07-28)

Purpose: Defines item list/detail queries and optimistic read-state mutations across item, feed, and bookmark caches.
Structure:

- `itemQueries` (L50): builds paginated list and detail query options.
- `applyOptimisticItemReadState` (L103): mirrors read-state changes into loaded article, detail, feed-count, and bookmark caches while deduplicating per-item count changes.
- `useSetItemsReadState` (L244): performs read/unread mutations with rollback and no post-success refetch.
Gotchas: Unread-mode visibility is filtered from the optimistic item state by `useArticleList`; the cached source sequence remains intact for drawer navigation.

### frontend/src/hooks/use-article-list.ts (~92 lines, TypeScript, map-updated 2026-07-28)

Purpose: Selects and normalizes the paginated article source for all, unread, and starred list modes.
Structure:

- `useArticleList` (L17): routes item/bookmark queries, filters optimistic read items from unread lists, and exposes the unfiltered cached sequence for drawer navigation.
Depends on: item queries, bookmark queries, article filter types.

### frontend/src/components/article/article-list.tsx (~260 lines, TSX, map-updated 2026-07-28)

Purpose: Renders the article list header, filter tabs, pagination, and read/star actions.
Structure:

- `ArticleList` (L22): derives URL scope, loads articles, and wires list interactions.
- `handleMarkAllAsRead` (L128): marks every currently loaded unread article in the active scope as read.
Gotchas: “Mark all as read” applies to loaded pages only; optimistic cache state owns the immediate list and count update.

### frontend/src/queries/keys.ts (~63 lines, TypeScript, map-updated 2026-07-22)

Purpose: Centralizes normalized filters and TanStack Query key factories for groups, feeds, items, and bookmarks.
Structure:

- `normalizeItemFilters` (L12): converts optional list filters into stable query-key values.
- `queryKeys` (L39): defines hierarchical keys used for cache reads, invalidation, and optimistic updates.

### frontend/src/store/preferences.ts (~143 lines, TypeScript, map-updated 2026-07-25)

Purpose: Owns persisted font/page-size, feed/folder ordering, and folder-expansion preferences and defensively validates restored values.
Structure:

- preference option types (near L4): article page sizes, font sizes, and feed sort modes.
- normalization helpers (near L24): sanitize persisted scalar, manual ID-order lists, and per-group expansion values.
- `PreferencesState` / `usePreferencesStore` (near L71): Zustand store persisted under `fusion-preferences`.
Gotchas: New persisted values must be included in both `partialize` and the defensive `merge` normalization.

### frontend/src/store/index.ts (~7 lines, TypeScript, map-updated 2026-07-17)

Purpose: Public barrel for the frontend UI and preference stores.

### frontend/src/main.tsx (~44 lines, TSX, map-updated 2026-07-25)

Purpose: Initializes the router, providers, PWA, fixed Simplified Chinese document language, and font-size attribute before rendering.
Structure:

- preference bootstrap/subscription (near L20): applies `lang="zh-CN"` and the persisted `data-font-size` to the root document element.
- React application mount (L39): composes query, theme, router, and toast providers.

### frontend/src/components/settings/settings-dialog.tsx (~306 lines, TSX, map-updated 2026-07-25)

Purpose: Renders the Appearance and About settings tabs.
Structure:

- `AppearanceContent` (near L58): edits global font size, article page size, theme, and shortcut access; language switching is intentionally absent.
- `SettingsDialog` (L286): owns responsive tab navigation and dialog layout.
Depends on: persisted preference/UI stores, theme provider, Chinese message lookup, PWA install hook.

### frontend/src/components/feed/feed-list.tsx (~281 lines, TSX, map-updated 2026-07-28)

Purpose: Renders the navigation sidebar filters, manually ordered folders, feeds, and persisted feed-sort controls.
Structure:

- module-level collator (L24): reuses locale comparison state across sidebar renders.
- `FeedList` (L26): sorts feeds by manual position, name, unread count, or creation time and renders group/ungrouped sections.
- `moveFeed` (near L72): swaps adjacent sibling IDs in the persisted global manual-order list.
- `moveGroup` (near L111): swaps adjacent folder IDs in the persisted folder-order list.
Depends on: group/feed/bookmark queries, URL state, preferences store, `FeedGroup`, `FeedItem`.

### frontend/src/routes/feeds.lazy.tsx (~570 lines, TSX, map-updated 2026-07-28)

Purpose: Manages subscriptions and folders, including filtering, creation entry points, refresh/export actions, and batch feed deletion.
Structure:

- toolbar (near L350): opens add dialogs and toggles batch-selection mode.
- batch deletion (near L250/L550): selects visible feeds, confirms destructive deletion, and reports the result.

### frontend/src/components/feed/feed-group-card.tsx (~330 lines, TSX, map-updated 2026-07-28)

Purpose: Renders one folder and its subscription rows, including selection controls used by batch deletion.
Gotchas: Feed moves are constrained to siblings in the same folder; new feeds and folders append after saved manual orders.

### frontend/src/components/feed/feed-group.tsx (~166 lines, TSX, map-updated 2026-07-25)

Purpose: Renders one collapsible feed folder with manual position controls, unread total, and per-folder automatic-expansion preference.
Structure:

- `FeedGroup` (L31): exposes accessible folder up/down controls and defaults open unless the persisted group override disables automatic expansion.
- folder menu (near L91): toggles automatic expansion and immediately synchronizes the current open state.
Depends on: preferences store, URL state, Base UI collapsible/menu, `FeedItem`.

### frontend/src/components/feed/feed-item.tsx (~94 lines, TSX, map-updated 2026-07-25)

Purpose: Renders one sidebar feed row with selection, unread count, editing, and optional manual-order controls.
Structure:

- `FeedItem` (L19): exposes accessible up/down controls in manual sort mode and disables boundary moves.
Depends on: URL/UI stores, feed favicon, i18n.

### frontend/src/index.css (~165 lines, CSS, map-updated 2026-07-17)

Purpose: Defines Tailwind theme tokens, global base styles, font-size presets, and article/sidebar typography.
Structure:

- root font-size presets (L133): maps the persisted `data-font-size` setting to 87.5%–125% scaling.
- `.sidebar-typography` / `.typeset-article` (L149): relative typography that follows the global scale.

## Frontend localization

### frontend/src/lib/i18n.ts (~28 lines, TypeScript, map-updated 2026-07-25)

Purpose: Provides typed Simplified Chinese message lookup and parameter interpolation to UI components.
Structure:

- `translate` (near L20): resolves a required Chinese message and interpolates named parameters.
- `useI18n` (near L27): exposes the stable translator through the existing component contract.

### frontend/src/lib/i18n/messages/index.ts (~1 line, TypeScript, map-updated 2026-07-25)

Purpose: Exports the sole Simplified Chinese dictionary and its compile-time key union.

### frontend/src/lib/i18n/messages/zh.ts (~204 lines, TypeScript, map-updated 2026-07-25)

Purpose: Canonical and only UI dictionary; its keys define the compile-time `TranslationKey` union.

### frontend/src/lib/api/types.ts (~200 lines, TypeScript, map-updated 2026-07-28)

Purpose: Defines frontend request, response, and domain types matching the backend JSON API.
Structure:

- `Item` (L31): mirrors the backend item with title and content.
- `Bookmark` (L43): mirrors saved title/content snapshots.
- `FeedCheckResponse` (L119): describes a read-only single-feed health check.
- `CreateBookmarkRequest` (L128): models either an item-ID reference or a complete orphan snapshot.
- `SearchItem` (L173): compact search result type.

### frontend/src/lib/api/index.ts (~141 lines, TypeScript, map-updated 2026-07-18)

Purpose: Defines typed HTTP client methods for all backend API resources.
Structure:

- `feedAPI` (L59): feed CRUD, discovery, batch creation, refresh-all, refresh-one, and check-one requests.

### frontend/src/components/article/article-item.tsx (~178 lines, TSX, map-updated 2026-07-28)

Purpose: Renders one article row in the list with title, extracted summary, metadata, and actions.
Structure:

- `ArticleItem` (L22): memoized article row that caches plain-text summary extraction by content.
Depends on: API `Item`, summary utility, feed favicon, i18n.

### frontend/src/components/article/article-drawer.tsx (~353 lines, TSX, map-updated 2026-07-28)

Purpose: Renders the selected article's detailed reading drawer and navigation.
Structure:

- `ArticleDrawer` (L35): resolves item/bookmark context and action state from the stable cached sequence.
- processed content memo (near L88): sanitizes full HTML only when article content/link changes.
- title/content rendering (near L265–L322): displays title and memoized sanitized HTML.
Gotchas: The reading `ScrollArea` is keyed by article ID so article navigation always starts at the top.

### frontend/src/lib/utils.ts (~73 lines, TypeScript, map-updated 2026-07-28)

Purpose: Provides styling, date formatting, and plain-text summary extraction helpers.
Structure:

- module-level formatters (near L6): reuse locale formatter instances across list rows.
- `extractSummary` (L65): strips HTML and truncates content client-side.
Gotchas: Summary text is derived client-side but memoized by each article row.

## Frontend data queries

### frontend/src/queries/feeds.ts (~173 lines, TypeScript, map-updated 2026-07-18)

Purpose: Owns feed list lookup and mutations for CRUD, moves, refreshes, and checks.
Structure:

- `useRefreshFeeds` / `useRefreshFeed` (L117/L128): trigger all-feed or single-feed ingestion.
- `useCheckFeed` (L139): runs a non-persisting feed health check.

### frontend/src/components/feed/feed-group-card.tsx (~315 lines, TSX, map-updated 2026-07-18)

Purpose: Renders a feed group and per-feed metadata/actions in the management page.
Structure:

- `FeedGroupCard` (L48): renders check, refresh, and edit controls for every feed row with per-feed pending state.

### frontend/src/routes/feeds.lazy.tsx (~511 lines, TSX, map-updated 2026-07-18)

Purpose: Implements feed management filtering, group actions, import/export, and refresh/check feedback.
Structure:

- `FeedsPage` (L58): coordinates feed mutations and shows localized result toasts.

### frontend/src/queries/items.ts (~279 lines, TypeScript, map-updated 2026-07-28)

Purpose: Owns item list/detail queries and optimistic unread-state cache updates.
Structure:

- `itemQueries` (L50): defines paginated list and item detail requests.
- `useItems` / `useItem` (L72): public item query hooks.
- optimistic cache helpers (L84 onward): update item, feed-count, and bookmark caches together without immediate refetch.

### frontend/src/queries/bookmarks.ts (~295 lines, TypeScript, map-updated 2026-07-28)

Purpose: Owns bookmark pagination, lookup, and conversion into article-list items.
Structure:

- `useBookmarkLookup` (L55): powers star state and bookmark lookup.
- `useStarredItems` (L105): returns bookmarks presented through the `Item` UI shape.
- optimistic cache helpers (near L150): upsert/remove bookmarks across loaded pages with snapshot rollback.
- `useCreateBookmark` / `useDeleteBookmark` (L229/L271): provide immediate star feedback, send compact item-ID create requests, and mark caches stale without active refetch.
Gotchas: Filtered bookmark caches are reconciled on their next mount rather than immediately refetched after each mutation.

### frontend/src/components/search/search-dialog.tsx (~225 lines, TSX, map-updated 2026-07-16)

Purpose: Renders feed and item search results and opens the selected result.
Structure:

- item result row (near L180): displays the search result's single `title` field.
Gotchas: Bilingual search-result display or Chinese search requires explicit API/FTS decisions.

## Unmapped

The remaining authentication, feed/group/bookmark handlers and stores, tests,
frontend routes/state/UI primitives, deployment files, and general documentation
are not yet mapped. Map them lazily when a task first touches them.
