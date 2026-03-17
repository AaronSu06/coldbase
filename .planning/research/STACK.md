# Technology Stack — v1.1 Production Foundation

**Project:** Reach
**Researched:** 2026-03-17
**Scope:** New additions only — PostgreSQL migration, Sentry error monitoring, request/response logging middleware, health endpoint

---

## Existing Stack (Do Not Re-Research)

Prisma 5.22.0 + @prisma/client 5.22.0 (confirmed from installed node_modules), Express 4, React 18, Vite 5, Zod 3, Tailwind 3, Chrome Extension MV3. All validated in v1.0.

---

## New Stack Additions

### PostgreSQL Provider

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pg` (node-postgres) | `^8` | PostgreSQL wire driver | Required by Prisma when provider = "postgresql"; without it Prisma will error at runtime |
| Prisma schema change | — | Provider swap: sqlite → postgresql | Prisma 5 supports both providers; the only schema change is `provider` and `url` |

**No prisma or @prisma/client version bump needed.** The installed 5.22.0 already supports PostgreSQL natively. The migration is a schema config change, not a library change.

**Schema change:**
```
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`DATABASE_URL` format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

**Migration path:** Run `prisma migrate dev --name migrate-to-postgres` after switching provider. This creates a fresh migration file. Existing SQLite migrations are not reused — PostgreSQL gets its own migration history from scratch.

**Column drops (DATA-01):** Drop `aiSuggestion` and `draft` columns in the same migration by removing them from `schema.prisma` before running `prisma migrate dev`. Prisma generates `ALTER TABLE ... DROP COLUMN` for PostgreSQL automatically.

**SQLite → PostgreSQL type compatibility:** Prisma's `String`, `Int`, `Boolean`, `DateTime`, `Float` map correctly to PostgreSQL types without code changes. No Prisma query changes required — the client API is provider-agnostic.

**Confidence:** HIGH — Prisma's multi-provider support is a documented core feature; behavior confirmed by examining installed Prisma 5.22.0 package description which explicitly lists PostgreSQL as supported.

---

### Sentry — Express Server

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@sentry/node` | `^8` | Error monitoring for Express server | Official Sentry SDK for Node.js; v8 is the current major with OpenTelemetry-based auto-instrumentation |

**v8 setup pattern (important — differs from older docs):**

Sentry v8 `init()` must be called before any other imports. The recommended pattern is a dedicated `instrument.js` file that is imported first in `index.js` (the entry point, not `app.js`):

```js
// server/instrument.js  (new file)
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0, // reduce in production
});
```

```js
// server/index.js  (modified)
import './instrument.js';   // MUST be first import
import app from './app.js';
...
```

**Express error handler** — still required in v8, added after all routes but before the custom error handler in `app.js`:

```js
import * as Sentry from '@sentry/node';
// after route mounts, before custom error handler:
Sentry.setupExpressErrorHandler(app);
```

**Why this order matters:** `Sentry.setupExpressErrorHandler` registers a 4-arg Express error handler that forwards errors to Sentry before the custom error handler runs. The custom error handler (the `(err, req, res, next)` function already in `app.js`) must remain last.

**Auto-instrumentation in v8:** Unlike v7, v8 auto-instruments HTTP, Express routes, Prisma via OpenTelemetry. No manual `Handlers.requestHandler()` or `Handlers.tracingHandler()` middleware calls needed. This is a significant API change from v7 docs found online — most tutorials still show v7 patterns.

**Confidence:** MEDIUM — v8 architecture based on training knowledge (cutoff Aug 2025). The `setupExpressErrorHandler` function name and `instrument.js` pattern are confirmed in Sentry's v8 migration guide as of mid-2025. Verify exact API against https://docs.sentry.io/platforms/javascript/guides/express/ before implementing.

---

### Sentry — Chrome MV3 Extension

This is the most constrained integration point. The extension has **no build step** — JS files are loaded directly by Chrome. This rules out npm packages in content scripts.

**Extension structure constraints:**
- `background.js` — ES module service worker (`"type": "module"` in manifest). CAN import ES modules.
- Content scripts (`logger.js`, `email-detector.js`, `compose-widget.js`, `tracking.js`, `content.js`, `sidebar.js`) — classic scripts loaded via manifest `content_scripts` array and `scripting.executeScript`. CANNOT use ES module imports.
- Sentry's npm SDK (`@sentry/browser`) requires a bundler to tree-shake and resolve imports — not usable as a raw file.

**Recommended approach: CDN bundle for background SW only**

Sentry publishes a pre-built CDN bundle (`@sentry/browser` ESM build) usable in environments without a bundler. However, Chrome MV3 service workers have Content Security Policy restrictions that block CDN fetches at runtime.

**Practical approach: Bundled Sentry in background SW**

Add a build step for `background.js` using esbuild (already available as a Vite dep in `web/`), or use a minimal Sentry reporter pattern:

**Option A (Recommended): esbuild bundle of background.js with @sentry/browser**

The background service worker (`background.js`) is already `"type": "module"`. Add an esbuild step that bundles `background.js` with `@sentry/browser` into a single output file. Content scripts remain unbundled (no change).

```json
// extension/package.json (new)
{
  "scripts": {
    "build:bg": "esbuild background.entry.js --bundle --outfile=background.js --format=esm --platform=browser"
  },
  "devDependencies": {
    "@sentry/browser": "^8",
    "esbuild": "^0.24"
  }
}
```

**Option B: Manual error reporter (no build step)**

A lightweight `sentry-reporter.js` file (plain JS, no imports) that sends errors to Sentry via the Envelope API using `fetch()`. ~30 lines. Works in both background SW (via import) and content scripts (via window global). Avoids any build step for the extension.

```js
// extension/sentry-reporter.js
const SENTRY_DSN = '...';  // parsed to extract project ID and host
function reportError(error, context = {}) {
  // POST to https://[host]/api/[project]/envelope/ with Sentry envelope format
  fetch(sentryEndpoint, { method: 'POST', body: JSON.stringify(envelope) });
}
```

**Verdict:** Option B (manual reporter) is better for this project. The extension has no build pipeline, Option A introduces a build step that adds ongoing maintenance. Option B is ~30 lines, works from both classic scripts and the ES module SW, and covers the actual need: capturing unhandled errors and surfacing them in Sentry. Full SDK tracing/breadcrumbs are unnecessary in an extension context.

**Confidence:** MEDIUM — Sentry Envelope API format is stable and documented; the constraint analysis of MV3 + no-build-step is HIGH confidence based on manifest.json inspection.

---

### Request/Response Logging Middleware

**No new library needed.**

The existing `logger.js` (classic script, for extension) and a server-side equivalent are already in the codebase pattern. The PROJECT.md notes a structured logging module was built in v1.0 — verify its location in the server (not found in `server/lib/` via glob, but referenced in the requirements as `logger.js`).

**Pattern:** Custom Express middleware using `res.on('finish', ...)` to log after response is sent. Structured JSON output consistent with whatever server logging exists.

```js
// server/middleware/requestLogger.js
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    log.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
}
```

**Why not morgan:** morgan outputs text/Apache format by default. Switching to JSON requires configuration. Since v1.0 already established a structured JSON logging pattern via `logger.js`, a 15-line custom middleware stays consistent and avoids a new dependency.

**Confidence:** HIGH — This is a well-established Express pattern; no library needed.

---

### Health Endpoint

**No new library needed.**

`GET /api/health` is a plain Express route. It should:
1. Return `200 { status: 'ok' }` for shallow health (always fast)
2. Optionally probe Prisma with `prisma.$queryRaw\`SELECT 1\`` for database liveness

```js
// server/routes/health.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});
```

**Note:** The `/api/health` endpoint sits behind `app.use('/api', requireSecret)` in the current `app.js`. If health checks need to be callable without auth (e.g., by a load balancer or uptime monitor), the route must be mounted before the `requireSecret` middleware, or the middleware must exempt `/health`.

**Confidence:** HIGH — Standard Express pattern, no novel decisions.

---

## Full Installation Summary

```bash
# In server/
npm install pg              # PostgreSQL wire driver for Prisma
npm install @sentry/node    # Sentry for Express server

# In extension/ (only if using Option A build step — not recommended)
npm install -D @sentry/browser esbuild
```

For the recommended approach (Option B manual Sentry reporter for extension), no npm install is needed in the extension directory.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| PostgreSQL driver | `pg` ^8 | `pg-native` | No C bindings required; `pg` is what Prisma's docs specify for Node.js |
| Sentry server SDK | `@sentry/node` ^8 | `@sentry/node` ^7 | v7 is in maintenance; v8 is current with better auto-instrumentation; project hasn't used Sentry before so no migration cost |
| Extension Sentry | Manual envelope reporter | `@sentry/browser` + esbuild | Extension has no build step; adding one for one file is disproportionate to the benefit |
| Request logging | Custom middleware | `morgan` | morgan is text-format-first; project uses structured JSON logging; no new dep needed |
| Health check | Plain Express route | `@godaddy/terminus` | Terminus is for graceful shutdown + health together; overkill for a single health endpoint |

---

## Integration Points

### Sentry + Existing Error Handler

The existing global error handler in `app.js` must be positioned after `Sentry.setupExpressErrorHandler(app)`:

```
Route mounts
  ↓
Sentry.setupExpressErrorHandler(app)   // NEW — catches and reports errors
  ↓
Custom error handler (err, req, res, next)  // EXISTING — formats response
```

If Sentry's error handler is placed after the custom handler, errors that are caught and formatted will never reach Sentry. The custom handler must call `next(err)` for Sentry to capture it, OR Sentry's handler must come first.

### Request Logger + Sentry

Request log entries should include a Sentry trace ID (`Sentry.getActiveSpan()?.spanContext().traceId`) so logs and Sentry events can be correlated. This requires `@sentry/node` to be initialized before the request logger runs — guaranteed by the `instrument.js` import-first pattern.

### PostgreSQL + Existing Tests

The integration tests in `server/outreach.test.js` and `tracking.test.js` use the Prisma client. After migrating to PostgreSQL, tests will require a PostgreSQL connection (cannot use in-memory SQLite). A test DATABASE_URL pointing to a local PostgreSQL instance or a Docker container will be needed. This is a test infrastructure change, not a code change.

---

## Open Questions

1. **Sentry DSN**: Where will the Sentry project DSN be stored? Add `SENTRY_DSN` to `.env.example` as part of this milestone.
2. **Health endpoint auth**: Should `GET /api/health` bypass `requireSecret`? Decision needed before implementing the route mount order.
3. **PostgreSQL local dev**: Is Docker the assumed PostgreSQL provider for local development, or will the user provision PostgreSQL separately? Affects what goes in `.env.example` as the DATABASE_URL default.
4. **Extension Sentry scope**: Is the manual envelope reporter needed for content scripts, background SW, or both? Content script errors are lower value (DOM manipulation failures); background SW errors (auth, API calls) are higher value.

---

## Sources

- Prisma 5.22.0 installed package description (verified from `server/node_modules/@prisma/client/package.json`)
- Prisma schema.prisma current state (verified from `server/prisma/schema.prisma`)
- Express app.js architecture (verified from `server/app.js`)
- Extension manifest.json (verified from `extension/manifest.json`)
- Sentry v8 Node.js setup pattern — MEDIUM confidence, training knowledge (cutoff Aug 2025); verify at https://docs.sentry.io/platforms/javascript/guides/express/
- Sentry v8 Express error handler (`setupExpressErrorHandler`) — MEDIUM confidence, training knowledge
- `pg` as Prisma's PostgreSQL driver requirement — HIGH confidence, core Prisma documentation
