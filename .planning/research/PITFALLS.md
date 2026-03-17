# Domain Pitfalls

**Domain:** Production Foundation — PostgreSQL migration, Sentry, request logging, schema column removal
**Project:** Reach (Express 4 + Prisma + Chrome Extension MV3)
**Researched:** 2026-03-17
**Confidence:** MEDIUM — based on Prisma docs knowledge (cutoff Aug 2025), MV3 service worker architecture (well-documented), Express middleware patterns (stable). No live web fetch available; flag low-confidence items for validation before implementation.

---

## Critical Pitfalls

Mistakes that cause data loss, silent failure, or rewrites.

---

### Pitfall 1: Prisma Baseline Migration Missing — Shadow Database Drift

**What goes wrong:** When switching from `provider = "sqlite"` to `provider = "postgresql"`, you cannot simply change the provider and run `prisma migrate dev`. Prisma's migration history was generated against SQLite. PostgreSQL requires a fresh migration baseline, or `prisma migrate dev` will error with "migration history conflict" or attempt to replay SQLite-incompatible DDL against Postgres.

**Why it happens:** Prisma stores applied migration names in `_prisma_migrations`. SQLite and PostgreSQL migrations are not interchangeable — SQLite migrations use `TEXT` for all types, no `ENUM`, no native `UUID`, and different `DateTime` handling. The old migration folder contains SQLite DDL that will fail on Postgres.

**Consequences:** `prisma migrate dev` fails mid-run, leaving the database in a partially-applied state. Or the migration runs but with wrong column types (e.g., `DateTime` stored as `TEXT` instead of `TIMESTAMPTZ`).

**Prevention:**
1. Delete `server/prisma/migrations/` entirely (or archive it).
2. Change `provider = "postgresql"` in `schema.prisma`.
3. Run `prisma migrate dev --name init` to generate a fresh baseline migration that Prisma writes as valid PostgreSQL DDL.
4. Do NOT run `prisma db push` as a shortcut — it skips migration history and will cause drift later.

**Detection:** If `prisma migrate dev` emits a "migration history conflict" error, or if `\d outreach` in psql shows `TEXT` columns where `TIMESTAMPTZ` is expected.

**Phase:** DB-01 (PostgreSQL migration)

---

### Pitfall 2: `autoincrement()` vs `serial` — Implicit Column Type Mismatch

**What goes wrong:** `@default(autoincrement())` on `id Int` works in SQLite but maps to `SERIAL` (integer) in PostgreSQL, not `BIGSERIAL`. If the `id` field is ever referenced across services expecting 64-bit integers, overflow is not possible at current scale — but the bigger issue is that `cuid()` fields (`TrackingPixel.id`, `OpenEvent.id`) work fine in both. The risk is specific to `Outreach.id Int @id @default(autoincrement())`: Prisma maps this to `INTEGER` (32-bit) in Postgres. At tens of millions of rows, this could theoretically overflow, but it is not a v1.1 concern.

**Consequences:** Not a blocker for v1.1 but worth documenting. If schema column `id` is changed to `BigInt` for future-proofing, Prisma will generate a destructive migration requiring a table rewrite.

**Prevention:** Accept `Int` + `autoincrement()` for now. Document the decision. If multi-tenancy (v1.2) brings high volume, migrate to `BigInt` then.

**Detection:** Not detectable at runtime — only matters at ~2B rows.

**Phase:** DB-01 (note, not a blocker)

---

### Pitfall 3: Dropping Columns in Production Without a Two-Phase Migration

**What goes wrong:** Removing `aiSuggestion` and `draft` from the Prisma schema and running `prisma migrate dev` generates a `DROP COLUMN` migration. If the running application still references these columns anywhere (in `SELECT *` expansions, in Zod schemas with `.passthrough()`, or in any route handler), the deployment will cause a 500 on any read that expects those columns in the response — or a query error if Prisma client is not regenerated after the migration runs.

**Why it happens:** With `passthrough()` in `CreateOutreachSchema` and `PatchOutreachSchema` (present in `outreach.js`), client-sent payloads that include `aiSuggestion` or `draft` will attempt to write to dropped columns, throwing a Prisma P2009 or similar unknown field error.

**Consequences:** On a production system with active users, dropping columns before the code that references them is removed causes immediate query failures.

**Prevention:**
1. Phase A: Remove all server-side references to `aiSuggestion` and `draft` in route handlers, Zod schemas (or ensure `passthrough()` strips unknowns — verify Prisma ignores extra fields on create).
2. Phase B: Remove columns from schema and generate the DROP COLUMN migration.
3. Verify: `prisma generate` after schema change to ensure the Prisma client no longer exposes these fields, catching any lingering `record.aiSuggestion` references at dev time.

**Note on Prisma + `passthrough()`:** Prisma's `create()` will throw if unknown fields are passed when using `strictMode`, but in default mode it silently ignores extra fields. Verify which mode is active. If Zod `passthrough()` is forwarding all client fields directly to Prisma, dropping the columns at the DB level while `passthrough()` is still active could cause errors only if the Prisma client is regenerated (it would then throw "Unknown arg `aiSuggestion`"). The safe order is: remove from schema → regenerate client → deploy → migrate.

**Detection:** After `prisma generate`, run `grep -r "aiSuggestion\|\.draft" server/` — any hit is a reference that must be removed before the migration runs.

**Phase:** DATA-01 (schema cleanup)

---

### Pitfall 4: Sentry in MV3 Service Worker — Fetch Transport Blocked, `XMLHttpRequest` Unavailable

**What goes wrong:** Sentry's browser SDK uses `XMLHttpRequest` as its default transport for error reporting. MV3 service workers do not have access to `XMLHttpRequest` — only `fetch`. The standard `@sentry/browser` package will silently fail to initialize or throw on first use inside `background.js`.

**Why it happens:** MV3 service workers run in a restricted Worker context. `XMLHttpRequest`, `window`, `document`, and `localStorage` are all unavailable. Sentry's browser SDK assumes a DOM environment.

**Consequences:** Sentry initializes without error in some versions but never transmits events. You get no errors reported from the extension while believing Sentry is working. This is the worst failure mode — silent.

**Prevention:**
1. Use `@sentry/browser` v7.x+ which added a `fetch`-based transport; verify the version used explicitly supports MV3 service workers. As of Sentry SDK v7.47+, a `makeFetchTransport` transport option is available. [MEDIUM confidence — verify against current Sentry docs before implementing]
2. Alternatively, use `@sentry/node` on the server only, and for the extension rely solely on structured logging (`logger-esm.js`) rather than Sentry SDK in the service worker.
3. If Sentry in the extension is required: initialize with `transport: Sentry.makeFetchTransport` explicitly, and confirm the `chrome-extension://` origin is not blocked by CSP.
4. Test the integration with a deliberate `Sentry.captureException(new Error('test'))` call and verify the event appears in the Sentry dashboard before shipping.

**Detection:** Open Chrome DevTools → Service Worker console. If Sentry throws on import or `init()`, you'll see it there. If no error but no events appear in Sentry dashboard → silent transport failure.

**Phase:** MON-01 (Sentry integration) — flag for deeper research before implementation

---

### Pitfall 5: MV3 Service Worker Termination Interrupts Sentry Event Queue

**What goes wrong:** MV3 service workers are ephemeral — Chrome terminates them after ~30 seconds of inactivity. Sentry's SDK queues events and flushes them asynchronously. If the service worker terminates before the flush completes, queued error events are lost.

**Why it happens:** There is no persistent background page in MV3. Unlike MV2, you cannot keep a service worker alive. Sentry's default retry/queue mechanism was designed for long-lived browser tabs.

**Consequences:** Intermittent errors in the extension (especially those during `chrome.alarms` handlers, which fire, do work, and then the SW is terminated) will be silently dropped.

**Prevention:**
1. Call `await Sentry.flush(2000)` at the end of any alarm handler or event listener that may have captured errors — before the service worker exits naturally.
2. Keep Sentry DSN usage in the extension minimal: only capture errors that are critical and non-recoverable; do not use Sentry for performance tracing in the extension.
3. Accept that extension error coverage is best-effort; the server-side Sentry integration will be more reliable.

**Detection:** Compare error rates in Sentry dashboard with manual error triggers in the extension. If triggered errors don't appear consistently, the queue is being dropped.

**Phase:** MON-01

---

## Moderate Pitfalls

### Pitfall 6: Request Logging Middleware Logging Request Bodies with PII or Credentials

**What goes wrong:** A naive `req.body` logger will capture email addresses, contact names, email content, and — critically — the `x-reach-secret` header value. If logs are shipped to a log aggregation service or written to disk with broad file permissions, this is a security and privacy issue.

**Prevention:**
1. Never log `req.headers['x-reach-secret']` — redact it explicitly.
2. Log body fields selectively, not `JSON.stringify(req.body)` wholesale. Or use an allowlist of safe fields.
3. For the tracking pixel route (`/track/:id`), log IP address only if explicitly needed; `ipAddress` is already stored in `OpenEvent`. Avoid double-storing PII.
4. Apply a body size guard: if `req.body` is large (e.g., a snippet field with a long email body), truncate before logging.

**Detection:** Grep log output for REACH_SECRET value after a test request. If it appears, the headers are being logged unredacted.

**Phase:** OBS-01 (request/response logging middleware)

---

### Pitfall 7: Logging Middleware Placed After Routes — No Requests Get Logged

**What goes wrong:** Express middleware is order-dependent. Placing the logging middleware after route definitions means it is never called for normal requests (only for unmatched routes, if at all).

**Why it happens:** In `app.js`, routes are registered via `app.use()` calls. If `app.use(requestLogger)` is placed after `app.use('/api/outreach', outreachRoutes)`, the logger only runs for requests that fall through all routes.

**Prevention:** Register the logging middleware **before** all route mounts, ideally immediately after `app.use(express.json())` and before `app.use('/api', requireSecret)`. Correct order in `app.js`:
```
app.use(express.json())
app.use(requestLogger)       ← here
app.use('/api', requireSecret)
app.use('/api/outreach', ...)
```

**Detection:** Make a test request to `/api/outreach` — if no log line appears, the middleware is in the wrong position.

**Phase:** OBS-01

---

### Pitfall 8: Health Endpoint Placed Before `requireSecret` Middleware — Accidentally Auth-Protected

**What goes wrong:** `app.use('/api', requireSecret)` protects all routes under `/api`, including `/api/health`. If `/api/health` is the canonical health endpoint, load balancers and uptime monitors that don't send `x-reach-secret` will receive 401s.

**Why it happens:** The current `app.js` applies `requireSecret` to the entire `/api` prefix before any routes are registered. A new `/api/health` route added after that line inherits the auth requirement.

**Prevention:** Either:
- Register `/api/health` before `app.use('/api', requireSecret)` — but this requires careful placement.
- Or use `/health` (no `/api` prefix) as the health endpoint, which entirely sidesteps the auth middleware.
- The `/health` path is the cleaner option and matches common conventions.

**Detection:** `curl http://localhost:3000/api/health` without the secret header returns 401 — the health check is protected.

**Phase:** OBS-02 (health endpoint)

---

### Pitfall 9: PostgreSQL `DateTime` Fields and Timezone Handling

**What goes wrong:** SQLite stores `DateTime` as ISO 8601 text strings with no timezone enforcement. PostgreSQL uses `TIMESTAMPTZ` (with timezone) by default when Prisma generates `DateTime` columns. Existing data migrated from SQLite may have UTC strings, but any application code that constructs dates with `new Date()` (local time, not UTC) will insert local-timezone data into Postgres, then read it back in UTC — causing apparent time shifts.

**Why it happens:** Node.js `new Date()` is local-time-aware if `TZ` env var is not set. Prisma's Postgres adapter handles the conversion correctly at the ORM level, but if raw SQL or a migration script constructs timestamps manually, timezone bugs appear.

**Consequences:** `sentDate`, `repliedAt`, `lastOpenedAt`, `nextActionDate` could all have incorrect values after migration if the data export/import uses string representations without explicit UTC.

**Prevention:**
1. Set `TZ=UTC` in the server's production environment.
2. When writing a data migration script (SQLite → Postgres), parse all date strings with explicit UTC: `new Date(dateString + 'Z')` if the string lacks a timezone suffix.
3. Verify migrated dates with a spot-check query: compare a known `sentDate` value in SQLite vs the Postgres record.

**Detection:** After migration, query `SELECT "sentDate", "createdAt" FROM "Outreach" LIMIT 5` and compare to the SQLite source. Any timestamp off by a multiple of hours indicates a timezone bug.

**Phase:** DB-01

---

### Pitfall 10: Prisma Client Not Regenerated After `provider` Change — Old Client Used at Runtime

**What goes wrong:** After changing `datasource.provider` from `sqlite` to `postgresql` and running `prisma migrate dev`, if `prisma generate` was not run (or was not part of the CI/start script), the application runs against the old SQLite Prisma client. It will attempt SQLite-style queries against a Postgres connection string and throw cryptic errors.

**Prevention:**
1. Add `prisma generate` to the `postinstall` script in `package.json` so it always runs after `npm install`.
2. Verify `server/package.json` postinstall script exists: `"postinstall": "prisma generate"`.
3. In dev, always run `prisma generate` after any schema change before restarting the server.

**Detection:** Server throws `Error: Invalid datasource provider` or Prisma throws connection errors that reference SQLite file paths despite `DATABASE_URL` pointing to Postgres.

**Phase:** DB-01

---

## Minor Pitfalls

### Pitfall 11: Response Logging Capturing Large Bodies (Tracking Pixel Responses)

**What goes wrong:** The tracking pixel route returns a 1x1 GIF (binary). If the response logger captures and logs response bodies, it will attempt to serialize binary data to JSON/string, producing garbage in logs or causing buffer encoding errors.

**Prevention:** The response logger should only log metadata (status code, duration, content-type, content-length) — not response body. Use `res.on('finish')` listener pattern rather than intercepting `res.write()` / `res.end()`.

**Phase:** OBS-01

---

### Pitfall 12: Sentry DSN Exposed in Extension Source Code

**What goes wrong:** Chrome Extension source code (including `background.js`) is visible to anyone who inspects the `.crx` file. The Sentry DSN (project identifier + secret) is considered low-sensitivity by Sentry (it's ingest-only, not admin access), but it can be abused to flood your Sentry quota with fake errors.

**Prevention:**
1. Treat the extension DSN as semi-public — enable Sentry rate limiting and filtering in the Sentry dashboard.
2. Use a separate Sentry project for the extension vs the server so a quota flood on extension events doesn't suppress server errors.
3. Consider `beforeSend` filtering to drop events below a severity threshold.

**Phase:** MON-01

---

### Pitfall 13: `prisma migrate dev` Used in Production

**What goes wrong:** `prisma migrate dev` creates shadow databases, resets databases on drift, and is designed for development only. Running it against a production Postgres instance can wipe data.

**Prevention:** Use `prisma migrate deploy` in production. Document this clearly in the deployment runbook. Never use `migrate dev` outside of a local dev environment.

**Phase:** DB-01

---

### Pitfall 14: `@sentry/node` Import in ES Module Server Without Proper Init Order

**What goes wrong:** Sentry's Node SDK must be initialized (via `Sentry.init()`) before any other imports that might throw errors — because Sentry patches `unhandledRejection` and `uncaughtException` handlers at init time. If `Sentry.init()` is called after `import prisma from './lib/prisma.js'` (which connects to the DB), errors during Prisma startup are not captured.

**Why it happens:** In ESM (`"type": "module"`), top-level imports are hoisted. The initialization order matters for error capture coverage.

**Prevention:** Create a `server/instrument.js` file that calls `Sentry.init()`, and import it as the very first import in `server/index.js` (before `app.js` or any other module). In ESM, this means `import './instrument.js'` must be the first line.

**Detection:** Trigger a Prisma connection error (wrong DATABASE_URL) and verify it appears in Sentry. If not captured, Sentry init ran too late.

**Phase:** MON-01

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| PostgreSQL migration (DB-01) | Replay of SQLite migrations onto Postgres | Delete old migrations, generate fresh baseline |
| PostgreSQL migration (DB-01) | Date/timezone corruption in migrated data | Set TZ=UTC, parse dates with explicit UTC in migration script |
| PostgreSQL migration (DB-01) | Using `migrate dev` in production | Use `migrate deploy` only in production |
| Schema column removal (DATA-01) | Dropping columns before code references removed | Two-phase: remove code references first, then run DROP COLUMN migration |
| Schema column removal (DATA-01) | Zod `passthrough()` forwarding dropped field names to Prisma | Regenerate Prisma client after schema change to catch unknown field errors at dev time |
| Request logging (OBS-01) | `x-reach-secret` header value logged | Explicitly redact all auth headers before logging |
| Request logging (OBS-01) | Middleware positioned after routes | Place logger before route mounts in `app.js` |
| Health endpoint (OBS-02) | `/api/health` protected by `requireSecret` middleware | Use `/health` path (no `/api` prefix) or register route before auth middleware |
| Sentry server (MON-01) | `Sentry.init()` called after first error-prone import | Create `instrument.js`, import it first in `index.js` |
| Sentry extension (MON-01) | `XMLHttpRequest` unavailable in MV3 service worker | Use fetch-based transport; verify SDK version supports MV3 |
| Sentry extension (MON-01) | Event queue dropped on SW termination | Call `await Sentry.flush()` at end of alarm handlers |

---

## Confidence Notes

| Area | Confidence | Basis |
|------|------------|-------|
| Prisma SQLite→Postgres migration baseline | HIGH | Prisma docs are clear on this; well-documented behavior |
| Prisma `migrate dev` vs `migrate deploy` | HIGH | Explicit Prisma documentation warning |
| Two-phase column removal | HIGH | Standard database migration practice |
| MV3 service worker XHR restriction | HIGH | Defined in Chrome MV3 specification |
| Sentry MV3 fetch transport availability | MEDIUM | Sentry added MV3 support in v7.x; verify exact version requirements before implementing |
| Sentry SW termination/flush behavior | MEDIUM | Service worker lifecycle is well-documented; Sentry flush behavior from docs |
| Express middleware ordering | HIGH | Fundamental Express behavior |
| Auth middleware scope for health endpoint | HIGH | Directly verifiable in `app.js` |

---

## Sources

- Prisma migration documentation (training data, cutoff Aug 2025) — verify at https://www.prisma.io/docs/guides/migrate/migration-workflows
- Chrome MV3 service worker restrictions — https://developer.chrome.com/docs/extensions/mv3/service_workers/
- Sentry Chrome Extension docs — https://docs.sentry.io/platforms/javascript/guides/chrome-extensions/
- Express middleware documentation — https://expressjs.com/en/guide/using-middleware.html
- Project source: `/Users/aaron/Documents/GitHub/reach/server/app.js`, `server/prisma/schema.prisma`, `extension/background.js`
