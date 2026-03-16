# Phase 5: Test Coverage - Research

**Researched:** 2026-03-16
**Domain:** Node.js built-in test runner, Prisma integration testing, ES module test patterns
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use Node's built-in `node:test` for all tests — no new test framework dependencies
- Use `node:assert/strict` for all assertions — consistent with existing `classifier.test.js` pattern
- No testing-library, no Vitest, no Jest
- Start the Express app in each test file and make real HTTP calls using Node's built-in `http` module
- No supertest dependency — `http.request` is sufficient
- Tests cover: happy path + key error cases (409 duplicate, 404 not found, 400 invalid input)
- Four routes to test: `POST /api/outreach` (create + duplicate), `PATCH /api/outreach/:threadId`, `GET /api/outreach` (pagination), `GET /track/:trackingId`
- Integration tests use a separate `server/test.db` (not `dev.db`)
- `DATABASE_URL` points to `server/test.db` during test runs
- Each test file wipes and re-migrates using `prisma migrate reset --force` before tests start
- Auth: Tests load a `.env.test` file with `REACH_SECRET=test-secret` and pass it in every request header
- `normalizeForMatch()` in `extension/reply-checker.js` — add `export` to enable direct unit testing
- `normalizeStatus()` in `web/src/hooks/useOutreach.js` — add `export` to enable direct unit testing
- Email address parsing function in `extension/reply-checker.js` — export and test directly
- Define `test` script in root `package.json` using `node --test` with glob pattern
- One command runs all tests across `extension/`, `web/src/`, and `server/`
- Add `"type": "module"` to root `package.json`

### Claude's Discretion
- Exact glob pattern in the `npm test` command (how to handle cross-directory globs)
- How to pass `DATABASE_URL` and `REACH_SECRET` env vars to the test process (dotenv vs inline)
- Prisma client instantiation in test files (whether to reuse server's singleton or create fresh client)
- Test file naming and location (colocated with source vs dedicated `__tests__/` directories)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Unit tests for `classifier.js` covering `isColdOutreach()`, `extractCompanyFromEmail()`, `countKeywordMatches()` — edge cases: bracket format `[Company]`, non-English names, HTML-only messages, forwarded emails | `classifier.test.js` exists as pattern; all three functions already exported; new test file extends or supplements existing file |
| TEST-02 | Integration tests for critical server routes: `POST /api/outreach` (create + duplicate handling), `PATCH /api/outreach/:threadId`, `GET /api/outreach` (pagination), `GET /track/:trackingId` | Routes confirmed in `server/routes/outreach.js` and `server/routes/tracking.js`; server is pure ESM (`"type":"module"`); requires test DB setup and env var injection before Prisma import |
| TEST-03 | Unit tests for utility functions: date formatting, `normalizeStatus()`, email address parsing, `normalizeForMatch()` | `formatShortDate`/`getDaysSince` already exported from `web/src/lib/utils.js`; `normalizeStatus` and `normalizeForMatch` need `export` added; `normalizeStatus` imports `COLUMNS` from `shared/constants.js` — test file must resolve that import |
</phase_requirements>

---

## Summary

Phase 5 adds automated tests for three areas of an existing JavaScript codebase: classifier logic (extension), utility functions (extension + web), and Express/Prisma server routes (server). No new dependencies are permitted — the stack is `node:test` + `node:assert/strict` + `node:http` exclusively. The project has a working reference test file (`extension/classifier.test.js`) that establishes the exact patterns to replicate.

The primary technical challenge is environmental: the server is pure ESM (`"type":"module"` in `server/package.json`), Prisma reads `DATABASE_URL` at module-load time, and the integration test DB must be seeded/reset before any server code is imported. This requires carefully ordering env var injection before ESM imports. The root `package.json` currently lacks `"type":"module"` and a `test` script — both must be added.

The secondary challenge is that `normalizeForMatch()` (in `extension/reply-checker.js`) and `normalizeStatus()` (in `web/src/hooks/useOutreach.js`) are currently unexported private functions. Both need `export` added before their test files can import them.

**Primary recommendation:** Colocate test files next to their source files; use `node:test` `describe`/`it` with `before` hooks for DB setup; inject `DATABASE_URL` and `REACH_SECRET` via `process.env` assignment at the very top of integration test files before any import of server modules.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` | Node 20+ built-in | Test runner with `describe`/`it`/`before`/`after` | Locked decision; already used in classifier.test.js |
| `node:assert/strict` | Built-in | Assertions | Locked decision; consistent with existing tests |
| `node:http` | Built-in | HTTP requests in integration tests | Locked decision; no supertest |
| `prisma` CLI | ^5 (already installed) | `migrate reset --force` for test DB setup | Already in server/package.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | ^16 (already in server) | Load `.env.test` before Prisma instantiation | Integration tests only |
| `node:child_process` | Built-in | Run `prisma migrate reset` as subprocess | Integration test `before()` hook |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:http.request` | `node:fetch` (Node 18+) | `fetch` is cleaner; both are built-in; `fetch` preferred if Node version supports it |
| `prisma migrate reset` subprocess | In-process Prisma migration | Subprocess is more reliable for SQLite — avoids connection state issues |

**Installation:**
No new packages needed. All tools are already installed or built into Node.

---

## Architecture Patterns

### Recommended Project Structure
```
extension/
├── classifier.test.js        # Exists — extend with isColdOutreach + countKeywordMatches cases
├── reply-checker.test.js     # New — tests normalizeForMatch + extractEmailAddress
server/
├── outreach.test.js          # New — integration tests for /api/outreach routes
├── tracking.test.js          # New — integration test for GET /track/:trackingId
├── .env.test                 # New — REACH_SECRET=test-secret, DATABASE_URL=file:./test.db
web/src/
├── hooks/
│   └── useOutreach.test.js   # New — tests normalizeStatus
└── lib/
    └── utils.test.js         # New — tests formatShortDate + getDaysSince
```

### Pattern 1: node:test structure (existing reference)
**What:** `describe`/`it` blocks imported from `node:test`, `assert` from `node:assert/strict`
**When to use:** All test files in this project
**Example:**
```javascript
// Source: extension/classifier.test.js (project reference)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCompanyFromText } from './classifier.js';

describe('extractCompanyFromText', () => {
  it('extracts from bracket format', () => {
    assert.strictEqual(extractCompanyFromText('[Stripe] Internship', ''), 'Stripe');
  });
});
```

### Pattern 2: Integration test with DB reset (before hook)
**What:** Run `prisma migrate reset --force` in `before()`, start Express on random port, make HTTP calls, close server in `after()`
**When to use:** Any test file touching server routes (outreach.test.js, tracking.test.js)
**Example:**
```javascript
// Inject env vars BEFORE any server module import (ESM hoisting caveat)
process.env.DATABASE_URL = 'file:./test.db';
process.env.REACH_SECRET = 'test-secret';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import app from './app.js'; // must export app without calling listen()

let server;
let port;

before(async () => {
  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: '/path/to/server',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' }
  });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});
```

### Pattern 3: HTTP request helper in integration tests
**What:** Thin wrapper around `http.request` returning a promise with `{ status, body }`
**When to use:** Each integration test file — avoids repetition
**Example:**
```javascript
function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-reach-secret': 'test-secret',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        ...headers,
      },
    }, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
```

### Anti-Patterns to Avoid
- **Importing server modules before setting env vars:** ESM static imports are hoisted; if `DATABASE_URL` is not set before the module graph loads, Prisma uses the schema default (`file:../dev.db`). Use top-of-file `process.env` assignment before imports, OR use a loader approach.
- **Calling `app.listen()` inside the exported module:** The server `index.js` currently calls `listen()` at the bottom. A separate `app.js` (or conditional listen) is needed to allow test files to bind on their own port.
- **Sharing test.db across parallel test files:** `node --test` can run files concurrently; two files resetting the same DB simultaneously will corrupt state. Either serialize test files or use different DB paths per file.
- **Using `prisma.connect()` without `prisma.disconnect()`:** Prisma connections must be closed in `after()` hooks or SQLite will hold file locks.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB reset | Custom SQL truncation script | `prisma migrate reset --force` | Handles schema drift; applies all migrations cleanly |
| HTTP assertion | Custom response parser | `node:assert/strict` on response object | Already established pattern |
| Test isolation | Manual `DELETE FROM` queries | Full `migrate reset` per file | Guarantees clean schema, not just clean data |

**Key insight:** `prisma migrate reset --force` is idempotent and fast on SQLite. It's the most reliable way to guarantee a known DB state for each test run.

---

## Common Pitfalls

### Pitfall 1: ESM env var injection timing
**What goes wrong:** `process.env.DATABASE_URL = 'file:./test.db'` placed after imports has no effect because `prisma.js` is already evaluated with the original value.
**Why it happens:** ESM static `import` statements are hoisted and evaluated before any imperative code runs in the module, including `process.env` assignments.
**How to avoid:** Place all `process.env` assignments at the very top of the test file, before any `import` statements — OR use dynamic `import()` calls after setting env vars.
**Warning signs:** Tests running against `dev.db` instead of `test.db`; data appearing in dev database during test runs.

### Pitfall 2: `index.js` starts the server on import
**What goes wrong:** Importing `./index.js` in a test calls `app.listen(3001)`, binding port 3001 permanently and potentially failing if already in use.
**Why it happens:** The current `index.js` ends with `app.listen(PORT, ...)` — there is no export of `app` separately.
**How to avoid:** Extract Express app setup to `server/app.js` (export `app` without calling `listen`), keep `listen` call in `index.js`. Test files import from `app.js`.
**Warning signs:** `EADDRINUSE` errors in tests; port 3001 conflicts with a running dev server.

### Pitfall 3: `useOutreach.js` imports `@shared/constants`
**What goes wrong:** `normalizeStatus` test imports from `web/src/hooks/useOutreach.js`, which imports `COLUMNS` from `@shared/constants` — a path alias configured by Vite that Node's test runner does not understand.
**Why it happens:** `@shared` is a Vite path alias resolving to `../../shared/constants.js`. Node's native test runner has no alias resolution.
**How to avoid:** Two options: (a) test `normalizeStatus` by extracting it to `web/src/lib/normalize.js` (pure function, no imports), or (b) in the test file, mock `@shared/constants` or use a test-specific import that resolves the path directly. Option (a) is cleaner and consistent with the "extract for testability" approach already planned for `normalizeForMatch`.
**Warning signs:** `Cannot find package '@shared/constants'` error when running tests.

### Pitfall 4: Parallel DB corruption
**What goes wrong:** Running `node --test "**/*.test.js"` with multiple integration test files causes concurrent `prisma migrate reset` calls on `test.db`, corrupting state.
**Why it happens:** `node --test` runs test files concurrently by default.
**How to avoid:** Use `--concurrency=1` flag in the test script for integration tests, or use `node --test --concurrency=1`. Alternatively, give each integration test file its own DB (`test-outreach.db`, `test-tracking.db`).
**Warning signs:** Intermittent failures that pass when run individually; SQLite "database is locked" errors.

### Pitfall 5: `reply-checker.js` has heavy import chain
**What goes wrong:** Importing `reply-checker.js` to test `normalizeForMatch` pulls in `./auth.js`, `./api-client.js`, `./classifier.js` — modules that may require browser globals (`chrome`, `fetch`) or fail in Node.
**Why it happens:** `normalizeForMatch` is a private function buried in a file with 10+ side-effectful imports.
**How to avoid:** The CONTEXT.md plan is to `export` the function from `reply-checker.js`. If the import chain causes errors in Node, extract the function to a standalone utility file (e.g., `extension/text-utils.js`) that has zero imports.
**Warning signs:** `ReferenceError: chrome is not defined` or `fetch is not defined` when running reply-checker tests.

---

## Code Examples

Verified patterns from official sources:

### node:test with before/after lifecycle hooks
```javascript
// Source: Node.js docs (https://nodejs.org/api/test.html)
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('suite name', () => {
  before(() => { /* runs once before all tests in this describe */ });
  after(() => { /* runs once after all tests */ });
  beforeEach(() => { /* runs before each it() */ });

  it('test name', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

### Dynamic port binding for integration tests
```javascript
// Server listens on port 0 (OS assigns available port)
const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
// Use `port` in all subsequent requests
```

### Testing pagination response shape
```javascript
it('GET /api/outreach returns { data, total } shape', async () => {
  const { status, body } = await request('GET', '/api/outreach');
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body.data), 'body.data should be an array');
  assert.ok(typeof body.total === 'number', 'body.total should be a number');
});
```

### Testing 400 Zod validation error
```javascript
it('POST /api/outreach with missing required fields returns 400', async () => {
  const { status, body } = await request('POST', '/api/outreach', {
    // Missing threadId, company, contactEmail
    subject: 'Internship at Stripe',
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.error, 'Validation Error');
});
```

### Testing 409 duplicate
```javascript
it('POST /api/outreach duplicate threadId returns 409', async () => {
  const payload = { threadId: 'thread-001', company: 'Stripe', contactEmail: 'hr@stripe.com',
    gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-001',
    contactName: 'HR', domain: 'stripe.com', subject: 'Internship',
    sentDate: new Date().toISOString(), latestActivity: new Date().toISOString() };
  await request('POST', '/api/outreach', payload);
  const { status } = await request('POST', '/api/outreach', payload);
  assert.strictEqual(status, 409);
});
```

### Testing GET /track/:trackingId pixel response
```javascript
it('GET /track/:trackingId returns 1x1 GIF regardless of DB state', async () => {
  const res = await new Promise(resolve => {
    http.get(`http://localhost:${port}/track/nonexistent-id`, resolve);
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'image/gif');
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest / Mocha as test runner | `node:test` built-in | Node 18+ (stable Node 20+) | Zero new dependencies; slightly less ecosystem tooling |
| `supertest` for HTTP testing | `node:http.request` | This project's decision | No new deps; slightly more verbose |

**Deprecated/outdated:**
- `--experimental-test-runner` flag: Removed. `node:test` is stable in Node 18+ and default in Node 20+. No flag needed.

---

## Critical Implementation Notes

### Server `index.js` must be split into `app.js` + `index.js`
The current `server/index.js` both configures Express and calls `app.listen(3001)`. Integration tests need to import the app without starting a server on port 3001. The plan must include:
1. Create `server/app.js` — exports the configured `app` object, no `listen` call
2. Update `server/index.js` — imports `app` from `app.js`, calls `app.listen(PORT)`

This is a structural prerequisite for TEST-02, not optional.

### `DATABASE_URL` injection for ESM server
`server/lib/prisma.js` contains `new PrismaClient()` which reads `DATABASE_URL` from `process.env` at instantiation time. The Prisma schema `datasource` block specifies `url = "file:../dev.db"` as default. In ESM test files, the correct approach:

```javascript
// TOP of test file — before any imports
process.env.DATABASE_URL = 'file:./test.db';
process.env.REACH_SECRET = 'test-secret';

// Dynamic import after env is set (required if prisma.js is at module graph root)
const { default: app } = await import('./app.js');
```

Alternatively, use `dotenv` to load `.env.test` at the very top:
```javascript
import { config } from 'dotenv';
config({ path: './server/.env.test' });
// Now import server modules
```
But `dotenv` `config()` call still runs after static imports are hoisted. Use dynamic import pattern.

### `@shared/constants` resolution for `useOutreach.js` tests
`web/src/hooks/useOutreach.js` imports `COLUMNS` from `@shared/constants`. When Node's test runner imports this file, it will fail because `@shared` is a Vite path alias not understood by Node. Resolution options (in order of preference):
1. **Extract `normalizeStatus` to `web/src/lib/normalize.js`** (pure function, no imports) — test that file directly
2. **Pass `--import` with a loader** — adds complexity
3. **Mock the import** — `node:test` does not have built-in module mocking as of Node 20

Option 1 is recommended and aligns with the existing "export for testability" pattern.

### Root `package.json` test script glob
Cross-directory glob with `node --test` requires Node 21+ for recursive glob support. For Node 20 compatibility, enumerate files explicitly or use shell glob expansion:
```json
{
  "type": "module",
  "scripts": {
    "test": "node --test --concurrency=1 'extension/**/*.test.js' 'web/src/**/*.test.js' 'server/**/*.test.js'"
  }
}
```
Shell glob expansion works in zsh/bash. For cross-platform safety, use `node --test $(find . -name '*.test.js' -not -path '*/node_modules/*')` or list files individually.

---

## Open Questions

1. **`reply-checker.js` import chain in Node context**
   - What we know: `reply-checker.js` imports `./auth.js` (uses `chrome.identity`) and `./api-client.js` — both require browser globals
   - What's unclear: Whether Node will throw on import even if those code paths aren't executed during testing
   - Recommendation: Extract `normalizeForMatch` and `extractEmailAddress` to `extension/text-utils.js` (no imports) as part of the export task; test `text-utils.js` directly

2. **`prisma migrate reset` timing**
   - What we know: This command drops and recreates the DB, applying all migrations
   - What's unclear: How long it takes on CI — if > 5s it will slow the test suite
   - Recommendation: Acceptable for a project of this size; plan for it in the `before()` hook with no timeout concerns

3. **`node --test` concurrency behavior**
   - What we know: `node --test` runs test files concurrently by default in Node 20+
   - What's unclear: Whether `--concurrency=1` flag is available in Node 20 or only later versions
   - Recommendation: Use `--test-concurrency=1` (the correct flag name in Node 20) or serialize by listing integration test files after unit test files

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 20+ built-in) |
| Config file | none — flags in `npm test` script |
| Quick run command | `node --test extension/classifier.test.js` |
| Full suite command | `npm test` (root package.json script) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | `isColdOutreach()` keyword detection | unit | `node --test extension/classifier.test.js` | Partial (classifier.test.js exists, missing isColdOutreach cases) |
| TEST-01 | `extractCompanyFromEmail()` domain parsing | unit | `node --test extension/classifier.test.js` | Partial |
| TEST-01 | `countKeywordMatches()` keyword counting | unit | `node --test extension/classifier.test.js` | Partial |
| TEST-01 | Edge cases: bracket format, non-English names, HTML-only, forwarded | unit | `node --test extension/classifier.test.js` | Partial |
| TEST-02 | `POST /api/outreach` create + 409 duplicate | integration | `node --test server/outreach.test.js` | Wave 0 |
| TEST-02 | `PATCH /api/outreach/:threadId` update + 404 | integration | `node --test server/outreach.test.js` | Wave 0 |
| TEST-02 | `GET /api/outreach` pagination `{ data, total }` | integration | `node --test server/outreach.test.js` | Wave 0 |
| TEST-02 | `GET /track/:trackingId` pixel delivery | integration | `node --test server/tracking.test.js` | Wave 0 |
| TEST-03 | `formatShortDate()` date formatting | unit | `node --test web/src/lib/utils.test.js` | Wave 0 |
| TEST-03 | `getDaysSince()` day calculation | unit | `node --test web/src/lib/utils.test.js` | Wave 0 |
| TEST-03 | `normalizeStatus()` status normalization | unit | `node --test web/src/hooks/useOutreach.test.js` | Wave 0 |
| TEST-03 | `normalizeForMatch()` text normalization | unit | `node --test extension/reply-checker.test.js` | Wave 0 |
| TEST-03 | `extractEmailAddress()` email parsing | unit | `node --test extension/reply-checker.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test extension/classifier.test.js` (existing file, always valid quick check)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/app.js` — extract Express app without `listen()` call (prerequisite for integration tests)
- [ ] `server/outreach.test.js` — covers TEST-02 outreach routes
- [ ] `server/tracking.test.js` — covers TEST-02 tracking pixel route
- [ ] `server/.env.test` — `REACH_SECRET=test-secret`, `DATABASE_URL=file:./test.db`
- [ ] `web/src/lib/utils.test.js` — covers TEST-03 date utilities
- [ ] `web/src/hooks/useOutreach.test.js` OR `web/src/lib/normalize.js` + test — covers TEST-03 `normalizeStatus`
- [ ] `extension/reply-checker.test.js` OR `extension/text-utils.js` + test — covers TEST-03 `normalizeForMatch` + `extractEmailAddress`
- [ ] Root `package.json` — add `"type":"module"` and `"test"` script
- [ ] `extension/reply-checker.js` — add `export` to `normalizeForMatch` and `extractEmailAddress`
- [ ] `web/src/hooks/useOutreach.js` — add `export` to `normalizeStatus`

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/extension/classifier.test.js` — established test pattern
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/server/index.js`, `routes/outreach.js`, `routes/tracking.js` — route shapes confirmed
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/server/package.json` — `"type":"module"` confirmed
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/server/lib/prisma.js` — singleton pattern confirmed
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/server/prisma/schema.prisma` — DB schema confirmed
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/extension/reply-checker.js` — `normalizeForMatch` and `extractEmailAddress` are unexported
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/web/src/hooks/useOutreach.js` — `normalizeStatus` is unexported; imports `@shared/constants`
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/web/src/lib/utils.js` — `formatShortDate` and `getDaysSince` are exported
- Direct code inspection of `/Users/aaron/Documents/GitHub/reach/shared/constants.js` — `COLUMNS` array confirmed

### Secondary (MEDIUM confidence)
- Node.js 20 documentation on `node:test` — `describe`/`it`/`before`/`after` API, `--concurrency` flag
- Prisma documentation — `migrate reset --force` behavior, `DATABASE_URL` env var precedence over schema default

### Tertiary (LOW confidence)
- Shell glob behavior in `node --test` argument — varies by Node version; enumerated file approach is safer

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are built-in Node.js; no external library research needed
- Architecture: HIGH — code directly inspected; all integration points verified
- Pitfalls: HIGH — based on direct code inspection of actual import chains and module patterns
- Validation architecture: HIGH — test commands derived from confirmed file paths and module exports

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable Node.js built-ins; no third-party deps to drift)
