# Feature Landscape

**Domain:** Production foundation — PostgreSQL migration, observability, error monitoring for Express 4 + Prisma 5 + Chrome MV3
**Researched:** 2026-03-17
**Confidence:** MEDIUM — all findings from training knowledge (cutoff August 2025); external research tools unavailable this session. Prisma, Express, and Sentry patterns are mature and stable; confidence is high for behavior, medium for exact API surface.

---

## Context: What Already Exists

The codebase has Prisma 5 with a SQLite datasource, a structured logger (logger.js / logger-esm.js), Express 4 with ESM modules, a global `requireSecret` middleware, Zod validation on all POST/PATCH routes, and a Chrome MV3 extension with a module-type service worker (`background.js`). The `server/lib/prisma.js` exports a single `PrismaClient` instance. There is no health endpoint, no HTTP request logger, and no error monitoring integration.

---

## Table Stakes

Features users (operators, on-call engineers) expect. Missing = production observability is blind.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| PostgreSQL datasource in schema.prisma | SQLite is not a production database; concurrent writes, connection pooling, and hosted DBs (Railway, Render, Supabase) all require Postgres | Low | Change `provider = "sqlite"` → `"postgresql"`, update `url` to use `DATABASE_URL` env var |
| `prisma migrate deploy` in CI/startup | Production migrations must be non-interactive; `migrate dev` is for local only | Low | Add a startup script or Procfile step: `prisma migrate deploy && node index.js` |
| Drop `aiSuggestion` and `draft` columns | Dead columns waste storage and confuse the schema; removing them requires a migration with `prisma migrate dev` | Low | Two `@@` index removals not needed — columns have no index. Deletion is a destructive migration; must confirm data is disposable |
| `GET /api/health` returns 200 + JSON payload | Load balancers (Railway, Render, Fly.io) ping `/health` or `/api/health` to decide if a deployment is live before routing traffic | Low | Must be exempted from `requireSecret` middleware; lives before `app.use('/api', requireSecret)` or on a separate path |
| Health response includes DB liveness check | A 200 with no DB check gives false confidence; operators need to know if the DB connection is alive | Low | Run a cheap `prisma.$queryRaw\`SELECT 1\`` inside the handler; return `{ status: "ok", db: "ok" }` or `{ status: "degraded", db: "error" }` with HTTP 503 |
| Request/response logging middleware captures method, path, status, duration | Standard structured log line for every HTTP request; feeds into log aggregators (Datadog, Logtail, Papertrail) | Low | Capture `req.method`, `req.path`, `res.statusCode`, duration in ms using `Date.now()` diff; emit via existing `logger.js` at `info` level |
| Sentry DSN wired on server | Uncaught exceptions and unhandled rejections go to Sentry automatically once `Sentry.init()` is called | Low | Install `@sentry/node`; call `Sentry.init()` at top of `app.js` before any routes; add `Sentry.setupExpressErrorHandler(app)` before the existing global error handler |

---

## Differentiators

Features that exceed baseline expectations for this scale of project.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Health endpoint includes server uptime and version | Gives ops/deploy tooling richer signal; useful when rolling back a bad deploy | Low | `process.uptime()` and `process.env.npm_package_version` are free |
| Health endpoint DB check returns latency | Surfaces slow DB connections before they cause timeouts | Low | Record `Date.now()` before and after the `SELECT 1`; include `dbLatencyMs` in response |
| Request logger redacts sensitive headers | `x-reach-secret` must not appear in logs; plain-text logging of auth headers is a security audit failure | Low | Explicitly omit or mask `x-reach-secret` and `authorization` from any header logging |
| Sentry `environment` and `release` tags | Without these, Sentry events from dev, staging, and prod are mixed together; triage becomes impossible | Low | Set `environment: process.env.NODE_ENV`, `release: process.env.npm_package_version` in `Sentry.init()` |
| Sentry in Chrome MV3 extension (service worker) | Extension errors are otherwise invisible to operators; surface auth failures, API timeouts, and unhandled rejections from the background SW | Medium | Requires `@sentry/browser` (not Node SDK); MV3 service worker has no `window` object — Sentry must be initialized with `integrations: []` to avoid DOM-dependent integrations; `Sentry.init()` must run before any async code in `background.js` |
| Surface Gmail token expiry to user (EXT-V2-03) | Silent auth failures cause the extension to appear broken; users churn without knowing they need to re-auth | Medium | Catch `chrome.runtime.lastError` and token errors in `auth.js`; send a `chrome.notifications.create()` or `chrome.storage` flag that `sidebar.js` or `popup.js` reads to show an inline error banner |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Sentry `RequestData` integration capturing full request bodies | Request bodies may contain PII (email addresses, names); logging them to Sentry creates GDPR exposure | Use `beforeSend` to strip `request.data` or configure `Sentry.setupExpressErrorHandler` without `RequestData` |
| Custom migration scripts (raw SQL) | Prisma manages migrations via its shadow database; hand-written SQL bypasses Prisma's state tracking and breaks future `migrate` runs | Use only `prisma migrate dev` to generate migrations from schema changes |
| HTTP request logger that logs request bodies | Bodies contain user data; body logging creates both PII risk and log storage bloat | Log only method, path, status, duration — no bodies, no query strings with tokens |
| Health endpoint behind `requireSecret` | Defeats the purpose; load balancers don't send the secret header | Mount `/api/health` before `app.use('/api', requireSecret)` or use a path outside `/api` |
| Multiple `PrismaClient` instances after migration | PrismaClient creates a connection pool; instantiating it per-request or per-module exhausts DB connections | The existing `server/lib/prisma.js` singleton pattern is correct — keep it |
| `prisma migrate dev` in production | Runs interactively, creates shadow DB, prompts on destructive changes — will hang or fail in CI/CD | Use `prisma migrate deploy` in production; `migrate dev` is local-only |
| Sentry in content scripts | Content scripts run in page context; adding a third-party SDK like Sentry to every Gmail page tab increases memory footprint and risks CSP conflicts | Limit Sentry to background.js (service worker) and server only |

---

## Feature Dependencies

```
PostgreSQL datasource change
  → prisma migrate dev (generates migration file from schema diff)
    → drop aiSuggestion + draft columns (same migration or sequential)
      → DATABASE_URL env var must be set before any of the above run

requireSecret middleware position
  → /api/health must be mounted BEFORE app.use('/api', requireSecret)
    (currently line 43 in app.js — health route must come before this line)

Request/response logging middleware
  → Must be mounted before route handlers (early in app.js middleware stack)
  → Depends on existing logger.js being importable in server context (it is)

Sentry server init
  → Must run before routes are registered (top of app.js)
  → Sentry.setupExpressErrorHandler(app) must be called AFTER routes but BEFORE the existing global error handler

Sentry extension init
  → Must run at top of background.js before any async operations
  → Requires @sentry/browser (not @sentry/node) — different package
  → MV3 service worker: no DOM, no window — must disable DOM-dependent Sentry integrations

Gmail token expiry surfacing (EXT-V2-03)
  → Depends on auth.js error handling (already decomposed in v1.0)
  → Needs a mechanism to communicate error state from background SW to sidebar/popup UI
    (chrome.storage.local is the right bus — same pattern as outreachiq_pending_scan)
```

---

## MVP Recommendation

The milestone features are all well-scoped and have clear implementation paths. Prioritize in this order based on risk and dependency:

1. **PostgreSQL migration + schema cleanup** — everything else depends on a stable DB; do this first with a single migration that both switches the provider and drops the dead columns
2. **Request/response logging middleware** — pure middleware addition, no dependencies, highest signal-to-noise for ops
3. **`GET /api/health` endpoint** — low effort, high value for deployment health checks; mount before `requireSecret`
4. **Sentry server integration** — `@sentry/node` init + Express error handler wiring; follow with `environment` and `release` config
5. **Gmail token expiry surfacing (EXT-V2-03)** — medium complexity due to SW-to-UI communication; do after server observability is solid
6. **Sentry Chrome MV3 extension** — most complex due to service worker environment constraints; do last

Defer: Full Sentry `RequestData` capture — explicitly anti-feature (PII risk).

---

## Behavior Specifications by Feature

### PostgreSQL Migration via Prisma

**What `prisma migrate dev` does (LOCAL):**
- Diffs current `schema.prisma` against the last migration state
- Generates a SQL migration file in `prisma/migrations/`
- Applies it to the local DB
- Regenerates the Prisma client

**What `prisma migrate deploy` does (PRODUCTION):**
- Applies pending migration files that haven't yet been applied to the target DB
- Non-interactive, no shadow DB, no client regeneration
- Exits non-zero if any migration fails — safe to use as a pre-start step

**Switching from SQLite to PostgreSQL:**
- Change `provider = "sqlite"` to `provider = "postgresql"` in `schema.prisma`
- Change `url = "file:../dev.db"` to `url = env("DATABASE_URL")`
- `prisma migrate dev` will detect a new datasource and either reset or generate a baseline migration
- Existing `prisma/migrations/` history is SQLite-flavored SQL; for a clean Postgres start, run `prisma migrate reset` locally (destructive) then `prisma migrate dev` to get a single baseline migration
- The `cuid()` default on `TrackingPixel.id` and `OpenEvent.id` is supported in PostgreSQL — no schema changes needed there
- `autoincrement()` on `Outreach.id` maps to `SERIAL` in PostgreSQL — no change needed

**Dropping `aiSuggestion` and `draft` columns:**
- Remove both fields from `schema.prisma`
- Run `prisma migrate dev --name drop-unused-columns`
- Prisma will warn "this is a destructive change" — confirm in CLI
- The generated SQL will be `ALTER TABLE "Outreach" DROP COLUMN "aiSuggestion"; ALTER TABLE "Outreach" DROP COLUMN "draft";`
- Any server code referencing these fields (e.g., in route handlers or emailFinder) must be removed first or Prisma will error at generate time

### Health Endpoint Behavior

**Standard production health response shape:**
```json
{
  "status": "ok",
  "uptime": 42.3,
  "version": "1.0.0",
  "db": "ok",
  "dbLatencyMs": 2
}
```

**Degraded state (DB unreachable):**
```json
{
  "status": "degraded",
  "uptime": 42.3,
  "version": "1.0.0",
  "db": "error",
  "dbError": "Can't reach database server"
}
```
HTTP status 503 when degraded. Load balancers interpret 5xx as unhealthy.

**Middleware position in app.js:** The health route handler must be registered BEFORE `app.use('/api', requireSecret)` on line 43 of app.js, otherwise every health check returns 401.

### Request/Response Logging Middleware

**What to capture (table stakes):**
- `req.method` — GET, POST, etc.
- `req.path` — the matched path, not `req.url` (avoids logging query strings that may contain tokens)
- `res.statusCode` — captured in `res.on('finish', ...)` callback
- Duration in ms — `Date.now()` diff between middleware entry and `res.finish`

**What NOT to capture:**
- Request bodies — PII risk
- `x-reach-secret` header — security risk
- Full `req.url` if query strings appear — token leakage risk

**Implementation pattern (standard for Express 4):**
```javascript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info('http', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});
```
Mount this BEFORE routes but AFTER `express.json()` (so the body is already parsed if you later decide to add selective body logging). The existing `logger.js` in the server can be used directly — it already produces structured output.

### Sentry in Chrome MV3 Service Worker

**Why MV3 service workers are different from Node.js:**
- No `window`, `document`, or DOM APIs
- The SW can be terminated between events (idle timeout ~30 seconds in Chrome)
- When the SW restarts, `Sentry.init()` must run again — it's not persistent
- `@sentry/browser` works because it doesn't require DOM for core capture; `@sentry/node` does NOT work in an extension context

**Installation:**
- Server: `npm install @sentry/node` in `server/`
- Extension: `npm install @sentry/browser` in `extension/` (or bundle via the web package.json if shared)

**MV3 service worker init pattern:**
```javascript
// Top of background.js — before any imports that might throw
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'https://...@sentry.io/...',
  // Disable integrations that require DOM/window
  integrations: [],
  // Captures unhandled promise rejections (critical for async SW code)
  // SW environment handles this natively via 'unhandledrejection' event
});
```

**Key constraints:**
- Because the SW terminates and restarts, Sentry's `replay` and `browserTracing` integrations are not applicable — omit them
- `Sentry.captureException(e)` works in event listeners and async functions
- `fetch()` calls from the SW (to the server) will work for Sentry's event transport
- The DSN must be hardcoded or injected at build time — no runtime config file accessible to a SW; use `config.js` (already exists) to export the DSN alongside SERVER_URL

**Gmail token expiry surfacing:**
- In `auth.js`, when `getAuthToken` fails with an expired/revoked token, write to `chrome.storage.local` with a key like `outreachiq_auth_error`
- `sidebar.js` or `popup.js` reads this key on load and shows an inline error: "Gmail access has expired — click to reconnect"
- `chrome.identity.getAuthToken({ interactive: true })` can be triggered from the popup (user gesture context required for interactive:true)
- Clear the `outreachiq_auth_error` flag after successful re-auth

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| PostgreSQL migration | Existing SQLite `prisma/migrations/` contain SQLite-flavored SQL; PostgreSQL rejects this if applied | Use `prisma migrate reset` locally to get a fresh baseline; generate one clean Postgres migration |
| Drop unused columns | Any route handler or Prisma query that selects `aiSuggestion` or `draft` will fail at query time after migration | Grep codebase for both field names before running migration; remove all references first |
| Health endpoint | `app.use('/api', requireSecret)` on line 43 of app.js will intercept `/api/health` if health is registered after it | Register `/api/health` handler on line 42 or earlier — before the secret middleware |
| Sentry Express setup | `Sentry.setupExpressErrorHandler(app)` must come AFTER all routes but BEFORE the existing global error handler in app.js (currently lines 67-80) | Insert between last route mount and the `app.use((err, req, res, next) => {...})` block |
| Sentry MV3 SW | `@sentry/browser` auto-instruments `fetch` globally, which can interfere with the extension's `serverFetch` calls or cause CORS issues reporting to Sentry | Set `instrumentFetch: false` in integrations or use a custom transport if needed |
| Sentry MV3 SW | Service worker termination means Sentry's event queue may be lost if the SW is killed before the event is flushed | Use `await Sentry.flush(2000)` in critical catch blocks before the SW goes idle |
| Request logging | `req.path` strips query strings; `req.url` does not — use `req.path` to avoid logging `?token=...` style params | Always use `req.path`, never `req.url`, in the log middleware |
| Schema cleanup | `aiSuggestion` default is `""` (empty string); dropping it is safe if no application code is reading it — but Prisma's generated types will error at compile/generate time if any JS references it | Run `prisma generate` after schema change and fix any resulting TS/JS errors before the migration |

---

## Sources

- Prisma docs (training knowledge, Prisma 5.x): `prisma migrate dev` vs `prisma migrate deploy` behavior, SQLite→PostgreSQL provider switch, shadow database mechanics — confidence HIGH (stable, well-documented API)
- Express 4 middleware patterns: `res.on('finish', ...)` for response logging — confidence HIGH (unchanged since Express 4.0)
- Sentry Chrome Extension docs (training knowledge, Sentry SDK ~7.x/8.x): MV3 service worker `@sentry/browser` setup, `integrations: []` pattern for no-DOM environments — confidence MEDIUM (Sentry SDK versioning moves fast; verify current MV3 guidance at https://docs.sentry.io/platforms/javascript/guides/chrome-extensions/ before implementing)
- Health endpoint conventions: RFC 7807 problem details, standard `{ status, uptime, version, db }` shape — confidence HIGH (stable industry convention)
- Chrome MV3 service worker lifecycle (training knowledge): termination/restart behavior, `chrome.storage` as IPC bus — confidence HIGH (documented Chrome behavior, unchanged since MV3 launch)
