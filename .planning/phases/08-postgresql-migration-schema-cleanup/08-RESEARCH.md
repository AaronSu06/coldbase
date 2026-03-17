# Phase 8: PostgreSQL Migration + Schema Cleanup - Research

**Researched:** 2026-03-17
**Domain:** Prisma 5 + PostgreSQL (Neon) migration, schema cleanup, raw SQL compatibility
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Postgres provider**
- Use Neon as the hosted PostgreSQL provider for both local dev and production
- `DATABASE_URL` = Neon pooled connection string (with pgbouncer)
- `DIRECT_URL` = Neon direct connection string (required for migrations)
- `schema.prisma` datasource gets `directUrl = env("DIRECT_URL")` alongside `url = env("DATABASE_URL")`

**Migration strategy**
- Delete all existing SQLite migration files from `server/prisma/migrations/`
- Drop `aiSuggestion` and `draft` from `schema.prisma` before generating the new migration
- Run `prisma migrate dev --name init-postgres` once to create a fresh PostgreSQL baseline
- The fresh migration is the canonical schema — no data to migrate (fresh start, per requirements)

**Startup migration behavior**
- `prisma migrate deploy` runs at server startup (in `index.js` before `app.listen`)
- If migration fails, crash the process with a clear error message (e.g., "DB migration failed: [reason]. Check DATABASE_URL and retry.")
- Fail-fast — do not start the server if the database isn't healthy

**Test suite**
- Add `TEST_DATABASE_URL` env var pointing to a Neon test branch (separate branch from main, same Neon project)
- Tests continue using the existing beforeEach create / afterEach DELETE cleanup pattern — no changes to test structure
- Tests run against real Postgres via `TEST_DATABASE_URL`

### Claude's Discretion
- Exact `EXTRACT()` query syntax for replacing `strftime('%H', sentDate)` in `analytics.js`
- Whether `pg` package needs to be explicitly installed or if Prisma's postgres provider handles it
- Content of `.env.example` additions (documenting `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`)
- Error message format for startup migration failure

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DB-01 | Prisma datasource migrated to PostgreSQL; `pg` driver installed; `analytics.js` raw SQL updated for PostgreSQL compatibility; `prisma migrate deploy` runs on server start | Covered: schema.prisma changes, EXTRACT() syntax, execSync startup pattern, pg package verdict |
| DATA-01 | `aiSuggestion` and `draft` columns removed from Outreach schema; all code references removed before migration runs | Covered: confirmed no remaining code references outside schema.prisma; two-step removal sequence documented |
</phase_requirements>

---

## Summary

Phase 8 migrates the Reach server from SQLite to PostgreSQL (hosted on Neon) with no data migration — the existing SQLite migrations are discarded and replaced with a single fresh baseline migration for the clean Postgres schema. Two unused columns (`aiSuggestion`, `draft`) are dropped as part of this baseline, and one raw SQL query in `analytics.js` must be rewritten for PostgreSQL compatibility.

The migration is straightforward because there is no production data to preserve (fresh start requirement). The main technical work is: updating `schema.prisma` datasource, deleting old migrations, running `prisma migrate dev --name init-postgres` once to generate the PostgreSQL baseline, wiring `prisma migrate deploy` into server startup via `execSync`, fixing the `strftime()` → `EXTRACT()` raw SQL, and updating test infrastructure to point at a Neon test branch.

A second raw SQL incompatibility exists beyond `strftime()`: the query uses `WHERE archived = 0` (SQLite integer boolean) which must become `WHERE archived = false` for PostgreSQL. Code audit confirms no remaining references to `aiSuggestion` or `draft` columns in server routes or React components — schema drop is safe.

**Primary recommendation:** Treat this as schema-first work. Update `schema.prisma` and fix all raw SQL before generating the new migration. Run `prisma migrate dev` locally against a Neon branch to produce the canonical migration file, then commit it. Test infrastructure requires `TEST_DATABASE_URL` (Neon test branch) and `TEST_DIRECT_URL` (for `prisma migrate reset` to work with pgbouncer).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `prisma` | `^5` (already installed) | ORM + migration CLI | Project standard |
| `@prisma/client` | `^5` (already installed) | Database client | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg` | N/A — not needed | Node-postgres driver | Only needed if using `@prisma/adapter-pg` (driver adapter pattern). Prisma 5's default setup uses built-in drivers; the standard `provider = "postgresql"` in schema.prisma does NOT require the `pg` package. |

**Installation:**

No new packages needed. Prisma 5 ships with built-in PostgreSQL support; the `pg` package is only required when using the explicit driver adapter (`@prisma/adapter-pg`) for serverless/edge environments. This project runs Node.js — the built-in driver applies.

```bash
# No new installs required — existing @prisma/client ^5 + prisma ^5 handles Postgres natively
```

---

## Architecture Patterns

### Schema Changes

**What:** Update `schema.prisma` datasource block from SQLite to PostgreSQL with Neon dual-URL pattern.

**Before:**
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:../dev.db"
}
```

**After (confirmed Neon + Prisma 5 pattern):**
```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
}
```

- `DATABASE_URL` = Neon pooled connection string (contains `-pooler` in hostname) — used by Prisma Client at runtime
- `DIRECT_URL` = Neon direct connection string (no `-pooler`) — used by Prisma CLI (`migrate dev`, `migrate deploy`, `migrate reset`) because the schema engine cannot use pgbouncer (PgBouncer breaks prepared statements required by the migration engine)
- Source: [Neon Prisma Guide](https://neon.com/docs/guides/prisma), [Prisma PgBouncer docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer)

### Migration Cleanup and Baseline

**Step 1: Clear SQLite migrations**
```bash
rm -rf server/prisma/migrations/
```

**Step 2: Remove columns from schema.prisma**
Delete `aiSuggestion String @default("")` and `draft String @default("")` from the Outreach model.

**Step 3: Generate fresh PostgreSQL baseline**
```bash
cd server && npx prisma migrate dev --name init-postgres
```
This creates `server/prisma/migrations/TIMESTAMP_init-postgres/migration.sql` — the single canonical migration.

**Step 4: Commit the migration file** — it becomes the deploy artifact.

### Startup Migration Pattern

`prisma migrate deploy` has no official programmatic Node.js API. The standard pattern is `execSync` in the startup file.

```javascript
// server/index.js — BEFORE app.listen()
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  execSync('npx prisma migrate deploy', {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  console.error(`DB migration failed: ${err.message}. Check DATABASE_URL and retry.`);
  process.exit(1);
}

import app from './app.js';
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Reach server] Listening on http://localhost:${PORT}`);
});
```

**Important:** `import app from './app.js'` must come AFTER the migration block. With ES modules and top-level `import`, the migration call cannot truly "block" module loading. The correct pattern is to restructure `index.js` to wrap the listen in an async IIFE or use dynamic import for `app` after migration completes.

**ES module restructure pattern:**
```javascript
// server/index.js
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  execSync('npx prisma migrate deploy', {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  console.error(`DB migration failed: ${err.message}. Check DATABASE_URL and retry.`);
  process.exit(1);
}

// Dynamic import ensures migration completes before app module loads
const { default: app } = await import('./app.js');
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Reach server] Listening on http://localhost:${PORT}`);
});
```

Since `server/package.json` has `"type": "module"`, top-level `await` is valid. This is the correct pattern for ES module Node.js servers.

### Raw SQL Fix: analytics.js

The `analytics.js` route has TWO SQLite-specific constructs that must be replaced:

**Current (SQLite):**
```javascript
const rows = await prisma.$queryRaw`
  SELECT
    CAST(strftime('%H', sentDate) AS INTEGER) AS hour,
    COUNT(*) AS sent_count,
    SUM(CASE WHEN repliedAt IS NOT NULL THEN 1 ELSE 0 END) AS replied_count
  FROM Outreach
  WHERE archived = 0
  GROUP BY hour
  ORDER BY hour
`;
```

**Fixed (PostgreSQL):**
```javascript
const rows = await prisma.$queryRaw`
  SELECT
    EXTRACT(HOUR FROM "sentDate")::INTEGER AS hour,
    COUNT(*) AS sent_count,
    SUM(CASE WHEN "repliedAt" IS NOT NULL THEN 1 ELSE 0 END)::INTEGER AS replied_count
  FROM "Outreach"
  WHERE archived = false
  GROUP BY hour
  ORDER BY hour
`;
```

**Changes explained:**
1. `strftime('%H', sentDate)` → `EXTRACT(HOUR FROM "sentDate")::INTEGER` — PostgreSQL date function
2. `archived = 0` → `archived = false` — PostgreSQL uses native boolean, not integer
3. Table name `Outreach` → `"Outreach"` — Prisma maps model names to quoted identifiers in PostgreSQL (case-sensitive); Neon requires quoted table/column names when they use camelCase
4. `repliedAt` → `"repliedAt"` — same reason
5. `SUM(CASE WHEN ...)` result cast to `::INTEGER` — PostgreSQL returns bigint from SUM/COUNT; `Number()` cast in JS still works but explicit cast is cleaner
6. `sentDate` → `"sentDate"` — consistent quoting

**Source:** [PostgreSQL EXTRACT docs](https://www.postgresql.org/docs/current/functions-datetime.html), [Prisma raw queries docs](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries)

### Test Infrastructure Changes

The current tests hardcode `process.env.DATABASE_URL = 'file:./test.db'` at the top and use `prisma migrate reset --force --skip-seed` for setup.

**Required changes:**

1. **`outreach.test.js` and `tracking.test.js`**: Replace `process.env.DATABASE_URL = 'file:./test.db'` with:
   ```javascript
   process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
   process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
   ```
   These must be read from environment at test startup.

2. **`.env.test`**: Update from SQLite file URL to Neon test branch URLs:
   ```
   REACH_SECRET=test-secret
   DATABASE_URL=<neon-test-branch-pooled-url>
   DIRECT_URL=<neon-test-branch-direct-url>
   ```
   The `prisma migrate reset --force` in test `before()` hooks uses the `DIRECT_URL` (because it requires direct connection, not pgbouncer).

3. **`prisma.js` client**: Current singleton client is fine — it reads `DATABASE_URL` from env which is set before import.

### .env.example Updates

Add these entries to `server/.env.example`:
```
# PostgreSQL connection (Neon)
# Pooled URL (with -pooler in hostname) — used by app at runtime
DATABASE_URL=

# Direct URL (without -pooler) — required for prisma migrate / prisma db push
DIRECT_URL=
```

### Anti-Patterns to Avoid

- **Do not run `prisma migrate dev` in production** — `migrate dev` is for local development only; it can reset the database. Production uses `migrate deploy` exclusively.
- **Do not skip `DIRECT_URL`** — Running `prisma migrate deploy` against the pooled URL (pgbouncer) will fail with "prepared statement already exists" errors.
- **Do not quote column names inconsistently** — In `$queryRaw`, PostgreSQL is case-sensitive. Prisma creates columns with their camelCase names as quoted identifiers (e.g., `"sentDate"`, `"repliedAt"`). Raw SQL must use double-quoted identifiers to match.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Running migrations at startup | Custom migration runner | `execSync('npx prisma migrate deploy')` | Prisma handles migration state tracking, lock management, and idempotency |
| PostgreSQL connection pooling | Manual pool management | Neon pgbouncer + Prisma client | Neon's pooler handles serverless connection limits; Prisma manages the pool lifecycle |
| Schema diffing for dropped columns | Manual ALTER TABLE scripts | `prisma migrate dev` | Prisma auto-generates the correct DROP COLUMN SQL |

---

## Common Pitfalls

### Pitfall 1: Running migrate deploy against pgbouncer URL
**What goes wrong:** `Error: db error: ERROR: prepared statement "s0" already exists`
**Why it happens:** Prisma's schema engine uses prepared statements; pgbouncer in transaction mode doesn't support them
**How to avoid:** Always use `DIRECT_URL` (no `-pooler` in hostname) for all `prisma migrate *` commands
**Warning signs:** Migration commands hang or throw the prepared statement error on first run

### Pitfall 2: SQLite integer booleans in raw SQL
**What goes wrong:** `WHERE archived = 0` executes silently on PostgreSQL but returns no rows (0 is not false in a boolean context in some query planners) — or throws a type mismatch error
**Why it happens:** SQLite stores booleans as 0/1 integers; PostgreSQL has a native boolean type
**How to avoid:** Replace `= 0` / `= 1` with `= false` / `= true` in all raw SQL; audit any `$queryRaw` / `$queryRawUnsafe` calls
**Warning signs:** Raw SQL queries return empty result sets or type errors after migration

### Pitfall 3: Unquoted camelCase identifiers in PostgreSQL raw SQL
**What goes wrong:** `FROM Outreach` or `sentDate` in raw SQL resolves to lowercase `outreach` / `sentdate` — table/column not found error
**Why it happens:** PostgreSQL folds unquoted identifiers to lowercase; Prisma creates tables/columns with their camelCase names as quoted identifiers
**How to avoid:** Always use double-quoted identifiers in `$queryRaw`: `"Outreach"`, `"sentDate"`, `"repliedAt"`
**Warning signs:** "relation does not exist" or "column does not exist" errors in raw queries only (standard Prisma queries are fine because Prisma handles quoting automatically)

### Pitfall 4: Top-level import ordering in ES modules
**What goes wrong:** Migration runs but app.js (and Prisma client) was already imported before migration completes — Prisma client connects before schema is ready
**Why it happens:** ES module `import` statements are hoisted and resolved before any executable code
**How to avoid:** Use dynamic `await import('./app.js')` AFTER the migration execSync block in index.js
**Warning signs:** Server starts successfully but first requests fail with "table does not exist" on a fresh deploy

### Pitfall 5: prisma migrate reset in tests against Neon
**What goes wrong:** `prisma migrate reset` against pooled URL fails (same prepared statement error as pitfall 1)
**Why it happens:** `migrate reset` uses the schema engine which needs a direct connection
**How to avoid:** Ensure `.env.test` includes both `DATABASE_URL` (pooled, for client) and `DIRECT_URL` (direct, for CLI). Tests that call `execSync('npx prisma migrate reset ...')` in `before()` hooks will use `DIRECT_URL` automatically via `directUrl` in schema.prisma.
**Warning signs:** Test setup crashes with pgbouncer prepared statement error

### Pitfall 6: Forgetting to remove aiSuggestion/draft before running migrate dev
**What goes wrong:** New migration includes the columns, then requires a second migration to drop them
**Why it happens:** Columns still present in schema when migrate dev runs
**How to avoid:** Edit schema.prisma to remove both columns BEFORE running `prisma migrate dev --name init-postgres`
**Warning signs:** Generated migration.sql contains `aiSuggestion` or `draft` column definitions

---

## Code Examples

### Confirmed EXTRACT() syntax for analytics.js
```javascript
// Source: https://www.postgresql.org/docs/current/functions-datetime.html
// Replaces: CAST(strftime('%H', sentDate) AS INTEGER)
EXTRACT(HOUR FROM "sentDate")::INTEGER
```

### Confirmed PostgreSQL boolean syntax
```sql
-- Source: PostgreSQL docs — archived is Boolean in Prisma, stored as boolean in PG
WHERE archived = false
-- NOT: WHERE archived = 0  (SQLite only)
```

### Datasource block for Neon + Prisma 5
```prisma
// Source: https://neon.com/docs/guides/prisma (Prisma 6 and earlier section)
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
}
```

### execSync migration at startup (ES module, top-level await)
```javascript
// server/index.js
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  execSync('npx prisma migrate deploy', {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  console.error(`DB migration failed: ${err.message}. Check DATABASE_URL and retry.`);
  process.exit(1);
}

const { default: app } = await import('./app.js');
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Reach server] Listening on http://localhost:${PORT}`);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLite `strftime('%H', col)` | PostgreSQL `EXTRACT(HOUR FROM "col")` | This migration | Must change in analytics.js |
| SQLite `WHERE bool_col = 0` | PostgreSQL `WHERE bool_col = false` | This migration | Must change in analytics.js |
| `prisma migrate dev` for production | `prisma migrate deploy` for production | Prisma best practice | deploy is idempotent and safe; dev can reset |
| `DATABASE_URL` only | `DATABASE_URL` + `DIRECT_URL` | Neon/pgbouncer requirement | Two URLs required from this phase forward |

**Deprecated/outdated in this phase:**
- `provider = "sqlite"` in schema.prisma — replaced with `"postgresql"`
- `url = "file:../dev.db"` — replaced with `env("DATABASE_URL")`
- All 6 existing migration files under `server/prisma/migrations/` — deleted and replaced with single Postgres baseline

---

## Code Audit Results

**aiSuggestion / draft column references:**
- `server/prisma/schema.prisma`: Both columns present (lines 29, 30) — REMOVE in this phase
- `server/routes/*.js`: No references to `aiSuggestion` or `draft` fields (only `draftType` parameter in email.js which is unrelated)
- `web/src/**`: No references to `aiSuggestion` or `draft` fields (only function names like `draftBump`, `draftReply` which are unrelated)
- **Verdict:** Safe to drop columns — no application code references them.

**strftime() / SQLite raw SQL occurrences:**
- `server/routes/analytics.js` line 16–24: One `$queryRaw` with `strftime('%H', sentDate)` AND `archived = 0` — both must be fixed.
- No other raw SQL found in server routes.

---

## Open Questions

1. **TEST_DIRECT_URL naming**
   - What we know: Tests need both pooled URL (for client) and direct URL (for migrate reset). The locked decision names the test URL `TEST_DATABASE_URL`.
   - What's unclear: Whether there needs to be a separate `TEST_DIRECT_URL` env var, or whether the Neon test branch URL can simply be used as both (if the test branch is accessed directly without pgbouncer).
   - Recommendation: If the Neon test branch URL in `.env.test` is already a direct (non-pooler) connection, use it for both `DATABASE_URL` and `DIRECT_URL` in the test env. This avoids needing a third env var. The planner should decide and document which approach is used.

2. **prisma migrate deploy in CI/test setup**
   - What we know: Test `before()` hooks run `prisma migrate reset --force --skip-seed` (which reapplies all migrations).
   - What's unclear: With the new single baseline migration, `migrate reset` should still work. No change required to test structure per locked decisions — confirm this is correct.
   - Recommendation: No change needed. `prisma migrate reset` drops and recreates the database, then applies all pending migrations from scratch. With one migration file, it's equivalent to the current behavior.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) — no framework version |
| Config file | None — tests run directly with `node` |
| Quick run command | `node --test outreach.test.js` (from `server/`) |
| Full suite command | `node --test outreach.test.js tracking.test.js` (from `server/`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-01 | Server starts with PostgreSQL DATABASE_URL | smoke | `node --test outreach.test.js` (test `before()` will fail if Postgres unavailable) | ✅ existing |
| DB-01 | `prisma migrate deploy` runs without error | integration | Covered implicitly by test setup (migrate reset runs migrations) | ✅ existing |
| DB-01 | `analytics.js` EXTRACT query executes without error | integration | `node --test outreach.test.js` (if analytics test added) | ❌ Wave 0 |
| DATA-01 | `aiSuggestion` and `draft` columns absent from schema | unit/smoke | Manual schema inspection OR `node -e "const {prisma} = await import('./lib/prisma.js'); console.log(Object.keys(await prisma.outreach.findFirst() ?? {}))"` | ❌ Wave 0 |
| DATA-01 | POST /api/outreach does not return aiSuggestion/draft fields | integration | `node --test outreach.test.js` — existing POST test checks response shape | ✅ existing (partial) |

### Sampling Rate
- **Per task commit:** `cd /Users/aaron/Documents/GitHub/reach/server && node --test outreach.test.js`
- **Per wave merge:** `cd /Users/aaron/Documents/GitHub/reach/server && node --test outreach.test.js tracking.test.js`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Analytics endpoint test — covers DB-01 EXTRACT() correctness. Add `describe('GET /api/insights/best-time', ...)` to an `analytics.test.js` or append to `outreach.test.js`. Requires seeded data (>= 20 sent, >= 5 replied) or a test that handles `insufficient: true` response.
- [ ] Schema column absence assertion — covers DATA-01. Verify Prisma client type does not expose `aiSuggestion`/`draft` after regeneration. Can be a simple runtime check or TypeScript type guard.

---

## Sources

### Primary (HIGH confidence)
- [Neon Prisma Guide](https://neon.com/docs/guides/prisma) — datasource dual-URL pattern, directUrl requirement
- [Prisma PgBouncer docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer) — why direct URL is required for CLI commands
- [PostgreSQL date/time functions](https://www.postgresql.org/docs/current/functions-datetime.html) — EXTRACT(HOUR FROM ...) syntax
- [Prisma raw queries docs](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries) — $queryRaw tagged template usage

### Secondary (MEDIUM confidence)
- [Prisma deploy migrations docs](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate) — migrate deploy vs migrate dev distinction
- [Prisma development and production workflows](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production) — confirmed execSync pattern is the standard approach

### Tertiary (LOW confidence)
- WebSearch results confirming `pg` package is not required for standard Prisma 5 Node.js PostgreSQL usage — planner should verify by checking Prisma quickstart for PostgreSQL

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing Prisma 5 already installed; no new packages required confirmed via official docs
- Architecture patterns: HIGH — schema.prisma changes and EXTRACT() syntax confirmed via official PostgreSQL and Neon docs
- Raw SQL fixes: HIGH — two specific changes identified (strftime + boolean) from direct code audit
- Test infrastructure: MEDIUM — `TEST_DIRECT_URL` question remains open; `migrate reset` behavior with Neon needs user verification
- Pitfalls: HIGH — pgbouncer/direct URL pitfall is well-documented; ES module import ordering pitfall is a real risk

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (Prisma 5 APIs stable; Neon connection patterns stable)
