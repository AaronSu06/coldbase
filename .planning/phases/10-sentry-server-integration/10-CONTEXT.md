# Phase 10: Sentry Server Integration - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `@sentry/node` into the Express server so unhandled exceptions and promise rejections are captured in Sentry with environment context. PII (request body, x-reach-secret header) is stripped before events are sent. Sentry initializes before any application code so errors during Prisma startup are captured. Extension-side Sentry is out of scope (MON-02, v1.2).

</domain>

<decisions>
## Implementation Decisions

### instrument.js placement
- `instrument.js` is the first import in `index.js` — decided in v1.1 research
- `instrument.js` calls `Sentry.init()` only; it does NOT receive the app instance
- `setupExpressErrorHandler(app)` is called from `app.js` after the app is created

### PII scrubbing
- `beforeSend` hook sets `event.request.data = '[Filtered]'` — strips the entire request body
- `beforeSend` also deletes `event.request.headers['x-reach-secret']` (or sets to `'[Filtered]'`)
- Consistent with Phase 9 decision to redact x-reach-secret from request logs
- Rationale: request bodies may contain email addresses; blanket strip is simpler and guaranteed PII-safe

### No-DSN behavior
- If `SENTRY_DSN` env var is not set, `instrument.js` skips `Sentry.init()` silently — server starts normally
- No warning logged, no hard fail — clean local dev experience
- `SENTRY_DSN=` added to `.env.example` as a commented optional entry for documentation

### Error handler placement in app.js
- `Sentry.setupExpressErrorHandler(app)` is added just BEFORE the existing `(err, req, res, next)` handler
- Sentry captures the error and calls `next(err)`, then the existing handler formats the JSON response
- Existing handler (Prisma P2002/P2025 logic, consistent error shape) is NOT modified

### Sentry tags
- `environment`: `process.env.NODE_ENV` (standard, no custom env var needed)
- `release`: version string read from `server/package.json` (already read at app startup in `app.js`)

### Test file
- `server/sentry.test.js` — consistent with existing test file naming pattern (observability, outreach, tracking)
- Mock `@sentry/node` to unit test that `Sentry.init()` is called with correct config when DSN is present
- Unit test `beforeSend` function directly to verify body stripped and x-reach-secret header redacted
- Unit test that `Sentry.init()` is NOT called when DSN is absent

### Claude's Discretion
- Exact mock approach for `@sentry/node` in tests (jest.mock or manual stub)
- Whether `instrument.js` exports anything for testability or just has side effects on import
- Exact value used for `[Filtered]` string (could be `undefined`, `null`, or the string `'[Filtered]'`)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/index.js`: dynamic import pattern already in place — `instrument.js` import goes at the very top, before `execSync` and before `import('./app.js')`
- `server/app.js`: `version` already read from `server/package.json` at module load — reuse for `release` tag
- `server/middleware/`: directory established by Phase 9; Sentry error handler registration lives in `app.js` not here (it's a call, not a middleware file)

### Established Patterns
- `dotenv/config` imported in `app.js` — `process.env.SENTRY_DSN` available at module load
- Global error handler is the last `app.use()` call in `app.js` — Sentry handler slot is just above it
- Test files live in `server/` alongside source files (not a separate `__tests__/` directory)
- `npm test` uses `--env-file=.env.test` for test env vars (established in Phase 9)

### Integration Points
- `server/index.js`: add `import './instrument.js'` as the very first line (before all other imports)
- `server/app.js`: add `import * as Sentry from '@sentry/node'` and call `Sentry.setupExpressErrorHandler(app)` before the existing error handler
- `server/instrument.js`: new file — calls `Sentry.init()` conditionally on `SENTRY_DSN` presence
- `server/.env.example` (or project root): add `# SENTRY_DSN= (optional — error monitoring)`

</code_context>

<specifics>
## Specific Ideas

No specific references — standard `@sentry/node` Express integration patterns apply.

</specifics>

<deferred>
## Deferred Ideas

- MON-02: Sentry in Chrome MV3 background service worker — v1.2 milestone (already in REQUIREMENTS.md)

</deferred>

---

*Phase: 10-sentry-server-integration*
*Context gathered: 2026-03-17*
