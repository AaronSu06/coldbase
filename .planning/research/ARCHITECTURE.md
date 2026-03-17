# Architecture Patterns

**Domain:** Production Foundation — PostgreSQL migration, observability, error monitoring
**Researched:** 2026-03-17
**Confidence:** MEDIUM — Based on deep codebase reading + training knowledge. External docs (Prisma, Sentry) not verifiable in this session; all Sentry/Prisma integration patterns flagged accordingly.

---

## Recommended Architecture

The v1.1 milestone adds three cross-cutting concerns to the existing three-tier system: a new data store (PostgreSQL), a new observability layer (request logging + health), and a new error monitoring layer (Sentry). None of these change routing, response shapes, or the extension's message-passing protocol. They slot into existing seams.

### Existing System Seams (Where New Code Lands)

```
server/
  app.js               ← PRIMARY INTEGRATION FILE for middleware additions
  index.js             ← Sentry.init goes here (before app import), not app.js
  lib/
    prisma.js          ← datasource URL change only; no structural change
  prisma/
    schema.prisma      ← provider + type changes; new migration baseline
  routes/
    outreach.js        ← NO CHANGE
    tracking.js        ← NO CHANGE
    email.js           ← NO CHANGE
    analytics.js       ← NO CHANGE (verify raw SQL compat with Postgres)

extension/
  background.js        ← Sentry init for MV3 service worker
  (no other files change)
```

---

## Component Boundaries

| Component | Responsibility | Modified for v1.1 | Communicates With |
|-----------|---------------|-------------------|-------------------|
| `server/app.js` | Express app config, middleware chain, route mounts | YES — add logging middleware + health route | All route files |
| `server/index.js` | Process entry point, calls app.listen() | YES — Sentry.init before app import | app.js |
| `server/lib/prisma.js` | PrismaClient singleton | NO — URL comes from env | schema.prisma (generated client) |
| `server/prisma/schema.prisma` | DB schema + ORM config | YES — provider + types | Prisma migrations |
| `server/lib/requestLogger.js` | NEW — structured req/res logging middleware | NEW | logger.js (existing), app.js |
| `server/routes/health.js` | NEW — GET /api/health endpoint | NEW | prisma.js (DB probe) |
| `extension/background.js` | MV3 service worker | YES — Sentry.init at top | Sentry CDN/npm bundle |

---

## Data Flow Changes

### Logging Middleware Data Flow

```
Incoming Request
      |
      v
cors middleware (app.js line 17)
      |
      v
requestLogger middleware  ← NEW: log method, path, start time
      |
      v
express.json() (app.js line 28)
      |
      v
requireSecret (app.js line 43)
      |
      v
Route handler
      |
      v
Response sent
      |
      v
requestLogger on-finish hook  ← NEW: log status, duration
```

**Position rationale:** Logging middleware goes after CORS (so preflight OPTIONS are skipped or minimized) but before JSON parsing (to capture body-parse errors). It must be before `requireSecret` to log 401 responses. It attaches an `onFinished` listener (using the `on-finished` npm package or a `res.on('finish')` listener) to record the response status and duration after the response is flushed.

### Sentry Error Flow (Express)

```
Incoming Request
      |
      v
Sentry.setupExpressErrorHandler(app)  ← added BEFORE global error handler
      |
      v
Global error handler (app.js line 67)  ← EXISTING; Sentry captures before this runs
```

**MEDIUM confidence:** Sentry SDK v8 requires `Sentry.setupExpressErrorHandler(app)` called after routes but before the existing `(err, req, res, next)` error handler. The `Sentry.init()` call must happen at process start, which means `index.js` (not `app.js`) because `index.js` is the true entry point. If `app.js` is imported for tests without `index.js`, Sentry won't be initialized in the test environment — which is correct behavior (tests shouldn't report to Sentry).

### PostgreSQL Data Flow

No data flow changes. The Prisma client singleton in `server/lib/prisma.js` continues to be the only path to the DB. Only the connection string and generated client binary change. All route files are unaffected.

---

## Patterns to Follow

### Pattern 1: Middleware-as-File (requestLogger)

**What:** Extract the logging middleware into `server/lib/requestLogger.js` as a named export, import it in `app.js`.

**When:** Any middleware that requires more than 5 lines of code should be a separate file per the existing codebase convention (compare: `requireSecret` is inline because it's 8 lines; a full request/response logger with timing will be longer).

**Example (illustrative structure, not final code):**
```javascript
// server/lib/requestLogger.js
import { makeLogger } from './logger.js'; // existing logger module
const log = makeLogger('http');

export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;
  res.on('finish', () => {
    log.info({ method, path: originalUrl, status: res.statusCode, ms: Date.now() - start });
  });
  next();
}
```

**Insert in app.js after:** `app.use(express.json())` — after body parsing so Content-Type is available, before auth middleware so 401s are logged.

### Pattern 2: Health Endpoint as Lightweight Route File

**What:** `GET /api/health` returns `{ status: 'ok', uptime, timestamp }`. It performs a lightweight DB probe (e.g., `prisma.$queryRaw\`SELECT 1\`` ) to confirm DB connectivity.

**When:** Health endpoints always mount under `/api`. They must come BEFORE `app.use('/api', requireSecret)` — or be explicitly exempted — because health checks are public. A load balancer or monitoring service will call `/api/health` without the `x-reach-secret` header.

**Critical:** The `requireSecret` middleware is currently applied as `app.use('/api', requireSecret)`, which means ALL `/api/*` routes require the secret. The health route must either be:
- Mounted before `app.use('/api', requireSecret)`, or
- Use a separate path like `/health` (no `/api` prefix)

Recommendation: Mount at `/api/health` before `app.use('/api', requireSecret)` by ordering it earlier in `app.js`. This is the cleanest — no path compromise.

**Example mount order in app.js:**
```javascript
// Health check — public, mounted BEFORE requireSecret
app.get('/api/health', healthRoute);

// Secret validation applies to all other /api routes
app.use('/api', requireSecret);

// ... other routes
```

### Pattern 3: schema.prisma Provider Swap for PostgreSQL

**What:** Change `datasource db { provider = "sqlite" }` to `provider = "postgresql"` and update the `url` to use `DATABASE_URL` env var. Then run `prisma migrate dev --name postgres-migration` against the new database to generate a fresh baseline migration.

**Schema type changes required (MEDIUM confidence — based on training data, verify with Prisma docs):**

| SQLite type | PostgreSQL equivalent | Affected fields |
|-------------|----------------------|-----------------|
| `AUTOINCREMENT` (implicit) | `SERIAL` / `@default(autoincrement())` | `Outreach.id` — no schema change needed, Prisma handles this |
| `cuid()` for String @id | `uuid()` or keep `cuid()` | `TrackingPixel.id`, `OpenEvent.id` — no change needed |
| `DateTime` | `TIMESTAMP WITH TIME ZONE` | All DateTime fields — Prisma handles automatically |
| `String` default `""` | `TEXT DEFAULT ''` | Multiple Outreach fields — no schema change needed |
| `Boolean` | `BOOLEAN` | Multiple fields — no change needed |

**Practically:** Prisma 5 handles all these type mappings automatically when you change the provider. The `schema.prisma` model definitions themselves do NOT need field-type edits — the generator handles translation. The only file change is the `datasource db` block.

**Columns to drop as part of this migration:**
- `aiSuggestion String @default("")` — remove from schema
- `draft String @default("")` — remove from schema

These deletions must be included in the same migration that creates the PostgreSQL baseline, not as a separate migration, because we are doing a fresh migrate (no existing Postgres data to preserve).

**Migration strategy:** Since this is a fresh PostgreSQL instance (no production Postgres data exists yet), the correct approach is:
1. Change `schema.prisma` provider + url + remove dropped columns
2. `prisma migrate dev --name init-postgres` — generates a new baseline migration for Postgres
3. The SQLite migration history becomes irrelevant for the new Postgres database

**If production SQLite data needs to be carried over** (data migration, not just schema migration), a separate data export/import step is required before this. The milestone should clarify whether dev data preservation is needed.

### Pattern 4: Sentry in Express (MEDIUM confidence)

**What:** `Sentry.init()` in `server/index.js` before the `import app from './app.js'` line. `Sentry.setupExpressErrorHandler(app)` in `server/app.js` before the global error handler.

**Sentry SDK version note:** As of Sentry SDK v8 (released 2024), the API changed. `Sentry.Handlers.requestHandler()` and `Sentry.Handlers.errorHandler()` from v7 are deprecated. The replacement is `Sentry.setupExpressErrorHandler(app)`. Verify the installed SDK version determines which API to use.

**MEDIUM confidence example (verify against installed SDK version):**
```javascript
// server/index.js — entry point
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
});

import app from './app.js'; // import AFTER Sentry.init
const PORT = 3001;
app.listen(PORT, () => { /* ... */ });
```

```javascript
// server/app.js — after route mounts, before global error handler
import * as Sentry from '@sentry/node';

// ... routes ...

Sentry.setupExpressErrorHandler(app); // ← after routes, before error handler

app.use((err, req, res, next) => { /* existing global error handler */ });
```

**Import order caveat:** ES module `import` statements are hoisted, so `import app from './app.js'` at the bottom of `index.js` will still execute before any code in `index.js`. To guarantee `Sentry.init()` runs before route modules load, the Sentry init should be done in a separate file that is the true entry point, OR use a dynamic `import()` after `Sentry.init()`. This is a known ESM/Sentry gotcha.

**Recommended pattern for ESM:**
```javascript
// server/instrument.js
import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN, /* ... */ });
```
```javascript
// server/index.js
import './instrument.js';  // must be first import
import app from './app.js';
```

### Pattern 5: Sentry in MV3 Service Worker (LOW confidence)

**What:** Service workers in Chrome MV3 cannot use Node.js modules or require CDN script injection. Sentry provides `@sentry/browser` which works in service workers, but MV3 has restrictions on dynamic script loading.

**LOW confidence — verify before implementing:**
- `@sentry/browser` works in MV3 service workers if bundled (not loaded via `importScripts()`)
- Since the extension uses ES modules (`"type": "module"` in manifest background), Sentry must be imported as an ES module
- `chrome.runtime.getManifest()` provides version info for release tracking
- The extension has no build step currently — adding Sentry to the extension requires either (a) adding a bundler (Rollup/esbuild) or (b) using a pre-bundled Sentry UMD script via `web_accessible_resources`

**Risk:** Adding Sentry to the extension may require introducing a build step that doesn't currently exist. This is the highest-complexity integration point in the milestone. It should be scoped carefully — server-side Sentry alone provides most of the monitoring value.

**Minimum viable approach:** If extension Sentry is required, add `@sentry/browser` as a bundled file in the extension directory, list it in `manifest.json` before `background.js` in the service worker context. Without a bundler, this means manually downloading the Sentry browser bundle.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sentry.init Inside app.js

**What:** Calling `Sentry.init()` inside `server/app.js` instead of `index.js`/`instrument.js`.

**Why bad:** `app.js` is imported by integration tests (`server/app.js` was split from `index.js` precisely to enable test imports without starting the server). Tests importing `app.js` would trigger Sentry initialization, potentially sending test errors to the production Sentry project.

**Instead:** Init in `index.js` or a dedicated `instrument.js` that `index.js` imports first. Tests import `app.js` directly and bypass Sentry.

### Anti-Pattern 2: Health Route After requireSecret

**What:** Mounting `GET /api/health` after `app.use('/api', requireSecret)`.

**Why bad:** Load balancers and monitoring ping `/api/health` without auth headers. The health check becomes unreachable from infrastructure tooling, defeating its purpose.

**Instead:** Mount health before `app.use('/api', requireSecret)` in `app.js`.

### Anti-Pattern 3: Logging Middleware After requireSecret

**What:** Adding the request logging middleware after the `requireSecret` middleware.

**Why bad:** 401 Unauthorized responses from `requireSecret` won't be logged. Log coverage of failed/rejected requests is essential for security observability.

**Instead:** Insert logging middleware before `app.use('/api', requireSecret)` so all requests are logged including rejections.

### Anti-Pattern 4: New Prisma Migration Without Provider Baseline

**What:** Running `prisma migrate dev` for column drops (aiSuggestion, draft) while still on SQLite, then switching provider.

**Why bad:** SQLite migrations cannot be replayed against PostgreSQL. The migration history will have SQLite-specific SQL that fails on PostgreSQL (`AUTOINCREMENT`, `PRAGMA` statements).

**Instead:** Switch `provider = "postgresql"` first, update `DATABASE_URL`, drop the columns in the same schema edit, then run `prisma migrate dev --name init-postgres` once to generate a clean PostgreSQL-native baseline.

### Anti-Pattern 5: Raw SQL Analytics Without Postgres Compat Check

**What:** Assuming the raw SQL in `analytics.js` (grouping Outreach by hour sent) works identically in PostgreSQL.

**Why bad:** SQLite and PostgreSQL differ in datetime functions. SQLite uses `strftime('%H', sentDate)` for hour extraction. PostgreSQL uses `EXTRACT(HOUR FROM "sentDate")` or `date_part('hour', "sentDate")`.

**Detection:** Read `server/routes/analytics.js` to find raw SQL queries. Any `strftime` call must be replaced with PostgreSQL equivalents.

**Instead:** Before migrating, audit all `prisma.$queryRaw` and `prisma.$executeRaw` calls in analytics.js and update them for PostgreSQL syntax.

---

## Integration Points — New vs Modified Files

### New Files

| File | Purpose | Notes |
|------|---------|-------|
| `server/lib/requestLogger.js` | Express middleware: log method, path, status, duration | Uses existing `logger.js` module |
| `server/routes/health.js` | `GET /api/health` handler | Lightweight DB probe; public endpoint |
| `server/instrument.js` | Sentry.init for Express | First import in index.js |

### Modified Files

| File | What Changes | Risk |
|------|-------------|------|
| `server/prisma/schema.prisma` | `provider = "postgresql"`, `url = env("DATABASE_URL")`, drop `aiSuggestion` + `draft` fields | Generates new Prisma client; all routes using `prisma.outreach.*` work unchanged |
| `server/app.js` | Add `import requestLogger`, mount logging middleware, mount health route before requireSecret, add `Sentry.setupExpressErrorHandler(app)` before global error handler | Existing middleware order must be preserved |
| `server/index.js` | Add `import './instrument.js'` as first import | 3-line change |
| `server/.env` (and `.env.example`) | Add `DATABASE_URL`, `SENTRY_DSN` | New env vars required before server start |
| `extension/background.js` | Add Sentry init at top | Only if extension Sentry is in scope; may require bundler |
| `server/routes/analytics.js` | Replace SQLite `strftime` with PostgreSQL `EXTRACT` in raw SQL | Read file first to confirm raw SQL usage |

### No-Change Files

| File | Why Unchanged |
|------|--------------|
| `server/routes/outreach.js` | Pure Prisma ORM calls; provider-agnostic |
| `server/routes/tracking.js` | Pure Prisma ORM calls; provider-agnostic |
| `server/routes/email.js` | No DB interaction |
| `server/lib/prisma.js` | Singleton pattern unchanged; URL from env |
| Extension content scripts | No DB or server init involvement |
| Web dashboard | No server-side changes affect client |

---

## Build Order

Dependencies drive order. The PostgreSQL migration must precede everything else because it changes the Prisma-generated client that all routes depend on.

### Step 1: PostgreSQL Migration (DB-01 + DATA-01)

**Do first.** All other work runs against the new database.

1. Read `server/routes/analytics.js` to identify raw SQL queries — fix any SQLite-specific datetime functions before migrating
2. Edit `server/prisma/schema.prisma`: `provider = "postgresql"`, `url = env("DATABASE_URL")`, remove `aiSuggestion` and `draft` fields from Outreach model
3. Add `DATABASE_URL` to `server/.env` pointing at local Postgres instance
4. Run `prisma migrate dev --name init-postgres` — generates PostgreSQL migration, regenerates client
5. Verify `prisma studio` or a test query confirms schema applied correctly
6. Update any application code that references `aiSuggestion` or `draft` (search codebase — web dashboard components may read these fields)

**Dependency:** All subsequent steps depend on Step 1 completing (generated Prisma client changes).

### Step 2: Request Logging + Health (OBS-01, OBS-02)

**Do second.** These are purely additive and have no dependencies beyond Step 1.

1. Create `server/lib/requestLogger.js`
2. Create `server/routes/health.js` with DB probe
3. Modify `server/app.js`: add health route mount before `requireSecret`, add `requestLogger` middleware
4. Test: `curl http://localhost:3001/api/health` without secret header → 200 OK
5. Test: Any authenticated request → appears in logs with status + duration

### Step 3: Sentry — Server (MON-01, server side)

**Do third.** Depends only on server being functional (Step 2 complete gives a known-good baseline to test Sentry against).

1. `npm install @sentry/node` in `server/`
2. Create `server/instrument.js` with `Sentry.init()`
3. Add `SENTRY_DSN` to `server/.env`
4. Modify `server/index.js`: first line `import './instrument.js'`
5. Modify `server/app.js`: add `Sentry.setupExpressErrorHandler(app)` before global error handler
6. Test: Trigger a deliberate 500 error; confirm event appears in Sentry dashboard

### Step 4: Sentry — Extension (MON-01, extension side)

**Do last.** Highest complexity; most likely to require scope adjustment. If a build step is needed it should not block Steps 1-3.

1. Evaluate whether `@sentry/browser` can be used without a bundler in MV3 context
2. If bundler required: scope decision (add esbuild/rollup or defer extension Sentry)
3. If proceeding: download/bundle Sentry browser SDK, add to extension directory, update manifest if needed
4. Add `Sentry.init()` at top of `background.js`
5. Test: Trigger error in extension; confirm event appears in Sentry dashboard

---

## Scalability Considerations

| Concern | Now (SQLite dev) | v1.1 (PostgreSQL) | Future (multi-tenant) |
|---------|-----------------|-------------------|----------------------|
| Concurrent writes | Single-writer SQLite blocks | Postgres handles concurrent writes natively | Connection pooling (PgBouncer/Prisma Accelerate) needed at scale |
| Request logging volume | N/A | Structured JSON; log files grow | Ship to log aggregator (Datadog, Logtail) |
| Sentry event volume | N/A | Low volume (single user) | Per-user sampling rates, PII scrubbing |
| Analytics raw SQL | SQLite-specific datetime | PostgreSQL datetime functions | Materialized views if analytics slow |
| DB connection limit | N/A | Default Prisma pool (10) | Pool configuration needed before multi-tenant |

---

## Gaps to Address in Phase Planning

1. **analytics.js raw SQL audit** — must be read before writing the migration plan; SQLite vs PostgreSQL datetime syntax difference is a certain breakage point.
2. **Extension Sentry bundler decision** — needs a go/no-go decision before Phase planning. If the answer is "no bundler," extension Sentry is either deferred or uses a vendored CDN bundle.
3. **Data migration** — if existing SQLite dev data needs to be preserved (outreach records the user has tracked), a `sqlite3 .dump` → psql import step is needed. Clarify with user.
4. **`aiSuggestion`/`draft` column references** — codebase search needed: web dashboard components likely read these fields from the API response. They will receive `undefined` after schema drop; verify no UI code crashes on missing fields.
5. **`DATABASE_URL` format for Prisma PostgreSQL** — must include schema name to avoid conflicts: `postgresql://user:pass@localhost:5432/reach?schema=public`. This is Prisma-specific (not standard PostgreSQL URL format).

---

## Sources

- Codebase reading: `server/app.js`, `server/index.js`, `server/lib/prisma.js`, `server/prisma/schema.prisma`, `server/routes/outreach.js`, `server/routes/tracking.js`, `server/package.json`, `extension/background.js`, `extension/manifest.json` — HIGH confidence (direct source)
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STACK.md` — HIGH confidence (prior analysis of same codebase)
- Prisma provider swap behavior, type mapping, ESM init order — MEDIUM confidence (training data, knowledge cutoff August 2025; verify with `prisma.io/docs`)
- Sentry SDK v8 Express API (`setupExpressErrorHandler` vs old `Handlers.*`) — MEDIUM confidence (training data; verify installed SDK version)
- MV3 service worker + Sentry bundle compatibility — LOW confidence (training data only; MV3 restrictions evolve; verify with Sentry MV3 docs)
