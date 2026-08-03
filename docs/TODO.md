# TODO

## Completed — Fix SQLite startup write failures

**Resolved:** Implemented in `191ea97` and verified in production deployments through `4a9c880`.

### Evidence

- Deployment `b5effd4` logged 42 transient SQLite startup errors.
- Deployment `f8998a3` logged 41 errors within the first two seconds: 36 `disk I/O error (6410)` failures and 5 `SQLITE_BUSY` failures.
- The failures occurred in `BatchCreateItemsIgnore`, so affected feeds did not persist articles during that startup refresh.
- SQLite `PRAGMA quick_check` passed and no errors appeared after the startup window, but waiting for a later scheduled refresh is not an acceptable recovery mechanism.

### Confirmed and likely causes

- Error code `6410` is `SQLITE_IOERR_GETTEMPPATH`. The production container uses a read-only root filesystem without a writable `/tmp` mount.
- The puller immediately refreshes feeds with concurrency 10 at startup.
- `PRAGMA journal_mode = WAL` currently runs in every new SQLite connection hook, likely adding lock contention while startup writes open connections concurrently.

### Required work

- Add a writable, size-limited `/tmp` tmpfs to both the production Compose service and the candidate container created by `deploy.sh`.
- Configure WAL mode once during store initialization instead of once per connection; keep connection-scoped pragmas such as `foreign_keys` and `busy_timeout` in the hook.
- Preserve concurrent network fetching, but serialize or retry SQLite write transactions if `SQLITE_BUSY` remains after the initialization fix.
- Add regression coverage for concurrent startup refreshes in a read-only container configuration.
- Tighten deployment validation so any startup SQLite write failure fails the deployment instead of being recorded as a warning.

### Acceptance criteria

- Candidate and production startup logs contain zero `disk I/O error`, `database is locked`, or `SQLITE_BUSY` entries.
- Startup refreshes persist items and fetch state successfully under the production concurrency setting.
- Container health, HTTPS checks, and `PRAGMA quick_check` all pass.
- The deployment log records zero startup and post-health SQLite errors.

### Verification

- Production deployment `4a9c880` completed with zero startup and post-health SQLite errors.
- The production container is healthy with a writable, size-limited `/tmp` tmpfs.
- HTTPS returned 200 and `PRAGMA quick_check` returned `ok` after deployment.
