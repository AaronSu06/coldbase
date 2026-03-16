# Phase 5: Test Coverage - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Add automated tests for classifier logic, utility functions, and critical server routes. The test suite must run with `npm test` and exit 0 with no failures. No UI changes, no new features — purely test infrastructure and the minimal export changes needed to make private functions testable.

</domain>

<decisions>
## Implementation Decisions

### Test framework
- Use Node's built-in `node:test` for all tests — no new test framework dependencies
- Use `node:assert/strict` for all assertions — consistent with existing `classifier.test.js` pattern
- No testing-library, no Vitest, no Jest

### Server route testing
- Start the Express app in each test file and make real HTTP calls using Node's built-in `http` module
- No supertest dependency — `http.request` is sufficient
- Tests cover: happy path + key error cases (409 duplicate, 404 not found, 400 invalid input)
- Four routes to test: `POST /api/outreach` (create + duplicate), `PATCH /api/outreach/:threadId`, `GET /api/outreach` (pagination), `GET /track/:trackingId`

### Test database
- Integration tests use a separate `server/test.db` (not `dev.db`)
- `DATABASE_URL` points to `server/test.db` during test runs
- Each test file wipes and re-migrates using `prisma migrate reset --force` before tests start — guaranteed clean state
- Auth: Tests load a `.env.test` file with `REACH_SECRET=test-secret` and pass it in every request header — full auth middleware tested

### Private function exports
- `normalizeForMatch()` in `extension/reply-checker.js` — add `export` to enable direct unit testing
- `normalizeStatus()` in `web/src/hooks/useOutreach.js` — add `export` to enable direct unit testing
- Email address parsing function in `extension/reply-checker.js` — export and test directly (same pattern)

### npm test wiring
- Define `test` script in root `package.json` using `node --test` with glob pattern
- One command runs all tests across `extension/`, `web/src/`, and `server/`
- Add `"type": "module"` to root `package.json` to eliminate the `MODULE_TYPELESS_PACKAGE_JSON` warning already appearing with existing tests

### Claude's Discretion
- Exact glob pattern in the `npm test` command (how to handle cross-directory globs)
- How to pass `DATABASE_URL` and `REACH_SECRET` env vars to the test process (dotenv vs inline)
- Prisma client instantiation in test files (whether to reuse server's singleton or create fresh client)
- Test file naming and location (colocated with source vs dedicated `__tests__/` directories)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/classifier.test.js`: Working test file using `node:test` + `assert/strict` — established pattern for all new test files
- `server/lib/prisma.js`: Prisma singleton — integration tests can import or replace with a test-DB-pointed instance
- `server/.env.example`: Template for env vars — `.env.test` will follow the same format

### Established Patterns
- `node:test` runner: All tests use `describe()` / `it()` from `node:test` and `assert` from `node:assert/strict`
- ES modules throughout: extension and web use `import`/`export`; server currently uses CommonJS (`require`) — test files for server may need `.mjs` extension or CJS style
- `DATABASE_URL` in `server/.env`: Prisma reads this at startup — overriding for tests requires setting it before `prisma.js` is imported

### Integration Points
- `extension/classifier.js`: `isColdOutreach()`, `extractCompanyFromEmail()`, `countKeywordMatches()` already exported — new tests extend existing file
- `extension/reply-checker.js`: `normalizeForMatch()` and email parsing function need export additions
- `web/src/hooks/useOutreach.js`: `normalizeStatus()` needs export addition
- `web/src/lib/utils.js`: `formatShortDate()`, `getDaysSince()` already exported — can be tested directly
- `server/index.js` (or route files): Integration tests will `require`/`import` the Express app and call `app.listen()` on a dynamic port

</code_context>

<specifics>
## Specific Ideas

- The `isColdOutreach()` edge cases in requirements: bracket format `[Company]`, non-English names, HTML-only messages, forwarded emails — these are the acceptance criteria for TEST-01
- `GET /api/outreach` pagination test must verify the `{ data, total }` response shape (established in Phase 3)
- Server routes now use Zod validation middleware (Phase 3) — 400 error tests should send payloads that fail Zod schemas

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-test-coverage*
*Context gathered: 2026-03-16*
