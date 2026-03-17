# Project Research Summary

**Project:** Reach
**Domain:** Production Foundation — PostgreSQL migration, observability, error monitoring (Express 4 + Prisma 5 + Chrome MV3)
**Researched:** 2026-03-17
**Confidence:** MEDIUM

## Executive Summary

Reach v1.1 is a production-readiness milestone for an existing application. The codebase is already feature-complete at the v1.0 level (Express 4, Prisma 5 on SQLite, React 18 dashboard, Chrome MV3 extension). This milestone adds the infrastructure layer that separates a working prototype from a deployable product: a production-grade database, request observability, error monitoring, and a deployment health signal. None of the new work changes user-facing behavior — it all lands in cross-cutting seams that already exist in the architecture.

The recommended implementation order is strictly dependency-driven. PostgreSQL migration comes first because switching the Prisma datasource regenerates the client that every route depends on. Observability (request logging + health endpoint) comes second as pure additions with no dependencies beyond a working server. Sentry server integration comes third. Extension Sentry comes last and carries the highest uncertainty — the MV3 service worker environment has real constraints (no `XMLHttpRequest`, ephemeral lifecycle) that require careful implementation and testing before committing.

The key risk in this milestone is not complexity but sequencing. Three of the five critical pitfalls identified are ordering mistakes: replaying SQLite migrations against PostgreSQL, dropping columns before removing code references, and placing Sentry init after error-prone imports. The mitigations are well-understood — generate a fresh Postgres baseline migration, do a two-phase column removal, and use a dedicated `instrument.js` file as the true server entry point. The only genuinely uncertain area is Sentry in the MV3 extension, which should be treated as a stretch goal and validated with a deliberate test error before considering it complete.

---

## Key Findings

### Recommended Stack

The existing stack requires only two new npm packages for this milestone: `pg` (PostgreSQL wire driver, required by Prisma at runtime) and `@sentry/node` (Express error monitoring). No version bumps are needed — Prisma 5.22.0 already supports PostgreSQL natively. The Prisma schema change is a two-line edit to the `datasource` block.

For the Chrome extension, the recommended approach avoids introducing a build step. A manual ~30-line Sentry envelope reporter using `fetch()` covers the actual need (capturing unhandled errors) without requiring `@sentry/browser` bundling. This is the clearest decision in the research: Option B (manual reporter) over Option A (esbuild build step), because the extension has no existing build pipeline and adding one for a single file is disproportionate.

**Core technologies:**
- `pg ^8`: PostgreSQL wire driver — required by Prisma when `provider = "postgresql"`; no code changes needed beyond the schema edit
- `@sentry/node ^8`: Express error monitoring — v8 preferred over v7 (OpenTelemetry-based auto-instrumentation, no manual `requestHandler`/`tracingHandler` calls)
- Custom `requestLogger.js` middleware: structured request/response logging — avoids `morgan` dependency, stays consistent with existing structured JSON logger
- Plain Express route for `GET /api/health`: DB liveness probe — no library needed (`@godaddy/terminus` is overkill)
- Manual Sentry envelope reporter (extension): ~30 lines using `fetch()` — avoids build step, works in both background SW and classic content scripts

### Expected Features

**Must have (table stakes):**
- PostgreSQL datasource in `schema.prisma` — SQLite cannot handle concurrent writes or hosted deployment platforms (Railway, Render, Fly.io)
- `prisma migrate deploy` in production startup — `migrate dev` is interactive and will hang or reset data in CI/CD
- Drop `aiSuggestion` and `draft` columns — dead schema debt; clean migration moment since no Postgres data exists yet
- `GET /api/health` returning DB liveness status — load balancers require a health endpoint before routing traffic
- Request/response logging (method, path, status, duration) — minimum signal for ops; feeds log aggregators
- Sentry DSN wired on server with `environment` and `release` tags — without tags, Sentry events from dev/staging/prod are indistinguishable

**Should have (competitive):**
- Health response includes `uptime`, `version`, and `dbLatencyMs` — richer signal for deployment tooling with near-zero added cost
- Request logger explicitly redacts `x-reach-secret` header — security audit requirement; trivial to implement
- Sentry `beforeSend` configured to strip `request.data` — prevents PII (email addresses, contact names) from landing in Sentry
- Sentry in Chrome MV3 background SW — surfaces auth failures and API timeouts that are otherwise invisible; medium complexity

**Defer (v2+):**
- Full Sentry `RequestData` capture (explicit anti-feature — PII risk)
- Sentry in content scripts — memory footprint + CSP risk in Gmail page context; background SW alone covers the high-value errors
- Gmail token expiry surfacing to user (EXT-V2-03) — medium complexity; depends on `chrome.storage` IPC pattern between SW and sidebar UI; good v2 candidate

### Architecture Approach

The v1.1 additions are purely additive and slot into three existing seams: `server/index.js` (Sentry init before app import), `server/app.js` (middleware chain additions + health route placement), and `server/prisma/schema.prisma` (datasource swap + column removal). No routing logic, response shapes, or extension message-passing protocol changes. The Prisma client singleton in `server/lib/prisma.js` is unchanged — only the connection string changes via `DATABASE_URL` env var. Two new files (`server/lib/requestLogger.js`, `server/routes/health.js`) and one new entry point file (`server/instrument.js`) are the entire surface area of new code on the server side.

**Major components:**
1. `server/instrument.js` (NEW) — Sentry.init before any other imports; first import in `index.js` to guarantee error capture coverage from process start
2. `server/lib/requestLogger.js` (NEW) — Express middleware using `res.on('finish')` to emit structured JSON log after response sent; positioned after `express.json()` but before `requireSecret`
3. `server/routes/health.js` (NEW) — `GET /api/health` with `prisma.$queryRaw` SELECT 1 probe; mounted before `app.use('/api', requireSecret)` to remain publicly accessible
4. `server/prisma/schema.prisma` (MODIFIED) — provider swap to postgresql, DATABASE_URL, drop `aiSuggestion` + `draft` fields; generates fresh Postgres migration baseline
5. `extension/background.js` (MODIFIED, conditional) — manual Sentry envelope reporter at top of file; only if extension error monitoring is in scope

### Critical Pitfalls

1. **SQLite migration history replayed against PostgreSQL** — delete `server/prisma/migrations/` entirely, change `provider`, run `prisma migrate dev --name init-postgres` once for a clean PostgreSQL baseline. Never attempt to replay SQLite DDL on Postgres.

2. **Dropping columns before code references removed** — two-phase: (a) remove all `aiSuggestion`/`draft` references from route handlers and Zod schemas, regenerate Prisma client, confirm no TS/JS errors; (b) then run the DROP COLUMN migration. Zod `passthrough()` on create/patch routes must not forward these field names to Prisma after the schema drop.

3. **Sentry init too late in ESM server** — top-level `import` is hoisted in ESM; `Sentry.init()` in `index.js` after `import app from './app.js'` still runs after `app.js` loads. Use a dedicated `server/instrument.js` file and make it the very first import in `index.js`. Errors during Prisma startup (bad `DATABASE_URL`) will not be captured if Sentry init is deferred.

4. **Sentry MV3 service worker — silent transport failure** — standard `@sentry/browser` uses `XMLHttpRequest` which is unavailable in MV3 service workers. Events are silently dropped. Use `fetch`-based transport explicitly (`makeFetchTransport`) or use the manual envelope reporter approach. Always validate with a deliberate `Sentry.captureException(new Error('test'))` and confirm the event appears in the Sentry dashboard before shipping.

5. **Health endpoint behind `requireSecret`** — `app.use('/api', requireSecret)` in `app.js` line 43 protects all `/api/*` routes. `GET /api/health` must be registered before that line, or use the `/health` path (no `/api` prefix) which entirely sidesteps the auth middleware. Load balancers will 401 on every health check otherwise.

---

## Implications for Roadmap

Research is unambiguous about implementation order. Dependencies cascade clearly, and all five critical pitfalls map to specific phase boundaries.

### Phase 1: PostgreSQL Migration + Schema Cleanup

**Rationale:** The Prisma client is regenerated when the datasource changes. Every subsequent step (logging, health endpoint, Sentry) runs against the new client. Doing this first means everything else is built on the correct foundation. Doing it last would require re-testing all prior work.

**Delivers:** Production-grade database, clean schema (no dead columns), `prisma migrate deploy` startup script, `DATABASE_URL` env var documented in `.env.example`

**Addresses:** PostgreSQL datasource, `prisma migrate deploy`, drop `aiSuggestion`/`draft`, analytics raw SQL compatibility check

**Avoids:** Pitfall 1 (fresh baseline migration), Pitfall 2 (column removal two-phase), Pitfall 10 (Prisma client regeneration in postinstall)

**Pre-work required:** Audit `server/routes/analytics.js` for raw SQL — any `strftime()` calls must be replaced with PostgreSQL `EXTRACT()` equivalents before migrating. This is a certain breakage point.

### Phase 2: Observability — Request Logging + Health Endpoint

**Rationale:** Pure additions with no dependencies beyond a working server. Both touch `app.js` middleware ordering, so doing them together minimizes integration surface. Establishes a known-good observability baseline before Sentry is added.

**Delivers:** Structured HTTP request logs for every request (including 401s), `GET /api/health` returning DB liveness + uptime + version + latency, `SENTRY_DSN` and `DATABASE_URL` both documented in `.env.example`

**Addresses:** Request/response logging middleware, health endpoint (shallow + DB probe), header redaction for `x-reach-secret`

**Avoids:** Pitfall 6 (body/header PII in logs), Pitfall 7 (middleware after routes), Pitfall 8 (health endpoint behind auth middleware)

### Phase 3: Sentry — Express Server

**Rationale:** Depends on a stable server (Phase 2 provides a known-good baseline to test against). Sentry should be added after observability so that the request log and Sentry trace ID can be correlated. Server Sentry is the highest-value monitoring integration with the clearest implementation path.

**Delivers:** Unhandled exceptions and promise rejections captured in Sentry, `environment` + `release` tags, error events correlated with request logs via trace ID

**Addresses:** `@sentry/node` init, `setupExpressErrorHandler`, `beforeSend` PII scrubbing, `SENTRY_DSN` env var

**Avoids:** Pitfall 14 (Sentry init after first error-prone import — use `instrument.js`), Anti-Pattern 1 (Sentry.init in app.js instead of index.js)

### Phase 4: Sentry — Chrome MV3 Extension (Stretch)

**Rationale:** Highest complexity, most uncertainty. Should not block Phases 1-3. MV3 service worker constraints (no XHR, ephemeral lifecycle, no build step) require validation before committing implementation approach. Treat as a stretch goal with a clear go/no-go decision point before starting.

**Delivers:** Background SW errors (auth failures, API timeouts, unhandled rejections) captured in Sentry; manual envelope reporter usable from both SW and content scripts if needed

**Addresses:** Sentry in Chrome MV3, `await Sentry.flush(2000)` in alarm handlers, separate Sentry project for extension vs server

**Avoids:** Pitfall 4 (XHR unavailable — use fetch transport or manual reporter), Pitfall 5 (event queue dropped on SW termination — explicit flush), Pitfall 12 (DSN exposure — use separate project + rate limiting)

**Decision gate:** Before implementing, confirm whether manual envelope reporter (~30 lines, no build step) satisfies the requirement, or whether full `@sentry/browser` SDK is needed. The manual reporter is strongly recommended.

### Phase Ordering Rationale

- Phase 1 before everything: Prisma client regeneration is a hard dependency for all server work
- Phase 2 before Phase 3: Establishes logging baseline; Sentry trace IDs require the logger to be running for correlation
- Phase 4 last: Isolated to the extension directory; can be deferred without blocking production deployment of Phases 1-3
- Column removal (DATA-01) bundled with Phase 1 (not a separate phase): This is the optimal moment — no Postgres data exists yet, so no two-database data migration is needed. One clean baseline migration handles both the provider swap and the column drops simultaneously.

### Research Flags

Phases needing deeper research or validation during planning:
- **Phase 4 (Sentry Extension):** MV3 service worker + Sentry transport compatibility is MEDIUM/LOW confidence. Verify against current Sentry Chrome Extension docs (https://docs.sentry.io/platforms/javascript/guides/chrome-extensions/) before writing the implementation plan. The manual envelope reporter approach may bypass this entirely.
- **Phase 3 (Sentry Server):** Sentry v8 API (`setupExpressErrorHandler` name, `instrument.js` pattern) is MEDIUM confidence from training data. Verify against https://docs.sentry.io/platforms/javascript/guides/express/ before implementing. The API change from v7 `Handlers.*` to v8 `setupExpressErrorHandler` is the key detail to confirm.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (PostgreSQL Migration):** Prisma multi-provider support is a documented core feature; behavior is HIGH confidence. The migration steps are mechanical.
- **Phase 2 (Observability):** Express middleware ordering and `res.on('finish')` logging patterns are stable since Express 4.0. Health endpoint shape is industry-standard convention.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `pg` as Prisma's Postgres driver and Prisma 5 multi-provider support are confirmed from installed packages. Sentry v8 API is MEDIUM — verify before implementing. |
| Features | HIGH | Table stakes (Postgres, health, logging, Sentry) are well-understood production requirements. Feature scope is narrow and concrete. |
| Architecture | MEDIUM | Server-side patterns (middleware ordering, route mounting, Sentry init order) are HIGH confidence. Extension Sentry patterns are LOW confidence due to MV3 constraints evolving. |
| Pitfalls | HIGH | SQLite→Postgres migration pitfalls, Express middleware ordering, and ESM init order are all well-documented. MV3 service worker pitfalls are MEDIUM (Sentry-specific behavior). |

**Overall confidence:** MEDIUM-HIGH — the server-side work is well-understood and the implementation paths are clear. The only genuine uncertainty is Sentry in the MV3 extension, which is appropriately scoped as a stretch goal.

### Gaps to Address

- **`analytics.js` raw SQL audit:** Must read `server/routes/analytics.js` before writing the Phase 1 plan. Any `strftime()` calls break on PostgreSQL. This is the one confirmed breakage point not yet inspected.
- **Extension Sentry transport decision:** Manual reporter vs `@sentry/browser` requires a go/no-go decision before Phase 4 planning. Recommendation is manual reporter but confirm stakeholder requirement.
- **Data preservation decision:** If existing SQLite dev data needs to carry forward to Postgres, a `sqlite3 .dump` → psql import step is required before Phase 1 migration. Clarify before executing.
- **Health endpoint path:** `/api/health` (mounted before `requireSecret`) vs `/health` (separate path, no auth concern). Both work; pick one consistently.
- **`aiSuggestion`/`draft` references in web dashboard:** React components in `web/` may read these fields from API responses. After schema drop, they will receive `undefined`. Audit `web/src/` before the migration runs.

---

## Sources

### Primary (HIGH confidence)
- `server/node_modules/@prisma/client/package.json` — Prisma 5.22.0, PostgreSQL support confirmed
- `server/prisma/schema.prisma` — current SQLite datasource, Outreach model fields confirmed
- `server/app.js` — middleware order, `requireSecret` position (line 43), global error handler confirmed
- `extension/manifest.json` — MV3, `"type": "module"` background SW, content scripts confirmed
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STACK.md` — prior v1.0 codebase analysis

### Secondary (MEDIUM confidence)
- Sentry v8 Node.js SDK — `setupExpressErrorHandler`, `instrument.js` pattern, OpenTelemetry auto-instrumentation (training data, cutoff Aug 2025; verify at https://docs.sentry.io/platforms/javascript/guides/express/)
- Sentry v8 Chrome Extension MV3 — fetch transport, `integrations: []` for no-DOM environments (training data; verify at https://docs.sentry.io/platforms/javascript/guides/chrome-extensions/)
- Prisma SQLite→PostgreSQL migration baseline behavior — migration history conflict, fresh baseline requirement (training data; verify at https://www.prisma.io/docs/guides/migrate/migration-workflows)

### Tertiary (LOW confidence)
- Sentry MV3 service worker + bundler compatibility — whether `@sentry/browser` works without esbuild in MV3 context; needs validation before Phase 4 implementation

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
