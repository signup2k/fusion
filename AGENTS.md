# Agent Instructions

Read `docs/FILE_MAP.md` before exploring or opening files; keep it updated per the repo-map skill.

## Communication

- Use English for all documentation and code comments.
- Keep responses concise and actionable.
- Challenge proposals when you have a better alternative.

## Project Context

- This project is an open-source, lightweight RSS reader and aggregator.
- Prioritize simplicity and maintainability over complexity.
- Treat it as a small, personal project: optimize for a fast, pleasant single-user experience and low maintenance cost, not hypothetical scale.

## Change Hierarchy and Website-Specific Fixes

All future user-requested fixes for a specific website must follow this hierarchy:

1. Fix the existing standards-based path only when the problem is genuinely generic.
2. Extract a small shared helper only when multiple real cases already need the same behavior.
3. Otherwise, add an isolated website-specific compatibility rule at the closest existing boundary (discovery, fetch, parsing, normalization, or content rendering), scoped by a normalized hostname and preserving the generic fallback.

For a single-site quirk, prefer one small function, lookup entry, or explicit branch plus a focused regression test or fixture. Do not introduce a plugin system, adapter framework, registry, dependency-injection layer, new service, schema change, configuration surface, or settings UI unless current requirements clearly justify it.

Keep changes local to the layer that owns the behavior and avoid unrelated refactors. Basic extensibility means leaving an obvious place for the next proven rule; create broader abstractions only after real repetition appears.

## Code Standards

- Follow best practices without over-engineering.
- Default to no backward-compatibility work unless explicitly requested; if a change may break data formats, public APIs, or migrations, clearly state the impact.
- Write self-explanatory code with clear naming.
- Add comments in English only when they provide non-obvious value:
  - **DO write comments for:**
    - Complex business logic or algorithms
    - Non-obvious design decisions and trade-offs
    - Public APIs, exported functions, and package documentation
    - TODO/FIXME/NOTE markers with context
  - **DON'T write comments for:**
    - Self-evident code (e.g., getters/setters)
    - Repeating what the code already says
    - Implementation details that naming makes clear

## Go Development

- After modifying Go code, run `goimports -w .` before verification.
- Verify compilation with `go build -o /dev/null /path/to/file_or_dir`.
- Run related tests and ensure they pass.
- Use named SQL parameters (e.g., `:param_name` or `@param_name`).

## Frontend Development

- Verify TypeScript/TSX compilation with `npx tsc -b --noEmit`.
- shadcn components use Base UI (`@base-ui/react`) on the `base-vega` style. Regenerate via CLI (`pnpm dlx shadcn@latest add <component> --overwrite`) instead of hand-editing source files in `frontend/src/components/ui/`.
