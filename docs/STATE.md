# Project State

- 2026-09-02: Opening an article now marks it read in every filter. The unread view retains the currently expanded row until the reader moves to another article or closes it.
- 2026-07-25: Commit `c71f27e` deployed feed ordering, per-folder automatic expansion, and the Simplified Chinese-only UI to production.
- Folder manual ordering is included in commit `ef6a7ea` and deployed to production.
- TypeScript compilation and production build passed for the follow-up.
- Browser smoke testing was unavailable because the managed execution environment denied local port binding.
- Production HTTPS/API checks passed; the container is healthy with zero recent SQLite errors.
