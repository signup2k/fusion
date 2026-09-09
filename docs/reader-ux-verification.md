# Reading experience improvements — 2026-09-09

## Behavior

- Inline expansion displays the article title and feed/date once in the row header. Standalone articles opened outside the loaded list retain a title and metadata.
- Expanded rows use one read/star/original toolbar; selected titles retain full contrast. A bottom collapse control avoids scrolling back through long articles.
- Native disclosure buttons expose expanded state and are siblings of action controls, eliminating nested button keyboard conflicts.
- The list is bounded to 64rem and article prose to 72ch. Wide tables scroll within the reading column, preserving table spans and common semantic markup.
- Initial load, background refresh, pagination, and search errors have distinct recovery UI. Failed pagination stops automatic retries; existing content stays available.
- Empty states distinguish unread completion, no bookmarks, and missing article content.
- Search uses the existing query infrastructure for cancellation and caching. IME composition and active dialogs/menus do not trigger article shortcuts.
- Mobile state uses a shared media-query subscription. Feed editing mounts a fresh draft per selected feed instead of copying state through an effect.
- TypeScript 6.0.3 restores compatibility with the installed ESLint parser; TypeScript 7.0.2 crashed the parser before source checks.

## Verification

Local fixture API only; no production data was modified.

- TypeScript compilation: `npx tsc -b --noEmit`.
- Lint: `pnpm lint`.
- Production bundle: `pnpm build`.
- Backend baseline: `go test ./...` passed across all tested packages.
- Browser DOM and interaction checks: one inline title, standalone title preserved, keyboard-triggered bookmark action retains expansion, article j/Escape handler behavior, search failure message, list failure state and subsequent data recovery, empty-content message.
- Layout measurements: 390px mobile viewport and document width both 390px; 1440px desktop viewport and document width both 1440px. Desktop prose measured approximately 716px with the active font.
- Browser sanitizer assertions: scripts and event handlers removed, dangerous links rejected, relative images resolved, table colspan and superscripts retained, and table scroll wrapper present.

## Limitations

Browser screenshot capture repeatedly timed out, including the lower-level capture path. Pixel-level visual QA is therefore incomplete; layout claims above are based on DOM measurements and accessibility snapshots. Keyboard navigation was also checked with dispatched DOM key events after native key delivery was inconsistent in the browser session.

No production deployment was performed. These changes do not alter backend APIs, database schemas, or persisted user preferences.
