# Phase 8: PostgreSQL Migration + Schema Cleanup - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate the server's database from SQLite to PostgreSQL (hosted on Neon). Clean up the schema by dropping the unused `aiSuggestion` and `draft` columns. Fix the SQLite-specific `strftime()` raw SQL in `analytics.js` for PostgreSQL compatibility. All existing API endpoints must continue to work against the new database.

</domain>

<decisions>
## Implementation Decisions

### Postgres provider
- Use Neon as the hosted PostgreSQL provider for both local dev and production
- `DATABASE_URL` = Neon pooled connection string (with pgbouncer)
- `DIRECT_URL` = Neon direct connection string (required for migrations)
- `schema.prisma` datasource gets `directUrl = env("DIRECT_URL")` alongside `url = env("DATABASE_URL")`

### Migration strategy
- Delete all existing SQLite migration files from `server/prisma/migrations/`
- Drop `aiSuggestion` and `draft` from `schema.prisma` before generating the new migration
- Run `prisma migrate dev --name init-postgres` once to create a fresh PostgreSQL baseline
- The fresh migration is the canonical schema — no data to migrate (fresh start, per requirements)

### Startup migration behavior
- `prisma migrate deploy` runs at server startup (in `index.js` before `app.listen`)
- If migration fails, crash the process with a clear error message (e.g., "DB migration failed: [reason]. Check DATABASE_URL and retry.")
- Fail-fast — do not start the server if the database isn't healthy

### Test suite
- Add `TEST_DATABASE_URL` env var pointing to a Neon test branch (separate branch from main, same Neon project)
- Tests continue using the existing beforeEach create / afterEach DELETE cleanup pattern — no changes to test structure
- Tests run against real Postgres via `TEST_DATABASE_URL`

### Claude's Discretion
- Exact `EXTRACT()` query syntax for replacing `strftime('%H', sentDate)` in `analytics.js`
- Whether `pg` package needs to be explicitly installed or if Prisma's postgres provider handles it
- Content of `.env.example` additions (documenting `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`)
- Error message format for startup migration failure

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/lib/prisma.js`: existing Prisma client — just needs regeneration after schema changes
- `server/app.js` / `server/index.js`: startup sequence lives in `index.js`; migration bootstrap goes here
- Existing integration tests: use beforeEach/afterEach cleanup pattern, compatible with Postgres

### Established Patterns
- `.env` with `dotenv/config` imported in `app.js` — `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` follow same pattern
- Tests import `prisma` client directly — TEST_DATABASE_URL needs to be respected by the client

### Integration Points
- `server/prisma/schema.prisma`: datasource block needs `provider = "postgresql"`, `url`, and `directUrl`
- `server/routes/analytics.js`: one raw `$queryRaw` call using `strftime()` — replace with `EXTRACT(HOUR FROM "sentDate")`
- `server/prisma/migrations/`: clear all existing migrations, replace with single fresh baseline

</code_context>

<specifics>
## Specific Ideas

- User will use Neon for hosting — dev and prod point at the same Neon project (different branches/databases)
- Neon test branch for CI/tests — isolated from main, can be reset freely without touching production data

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-postgresql-migration-schema-cleanup*
*Context gathered: 2026-03-17*
