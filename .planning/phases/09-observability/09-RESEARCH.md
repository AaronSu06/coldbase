# Phase 9: Observability - Research

**Researched:** 2026-03-17
**Domain:** Express.js middleware, structured logging, HTTP health endpoints
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Logging library:** `console.log(JSON.stringify({...}))` — zero new dependencies
- **No external logging library** (pino, morgan, etc.)
- **Synchronous stdout write** — acceptable at Reach's current scale
- **Middleware placement:** Mount before everything (before CORS, before requireSecret) so ALL requests are logged — including preflight, 401s, and /health polls
- **Pattern:** Use `res.on('finish')` — record start time on request arrival, emit log line after response is sent (captures actual status code and duration)
- **Log fields:** `method`, `path`, `status`, `durationMs`, `query` (query parameters)
- **`x-reach-secret` header value is redacted (not logged)** — per OBS-01
- **No IP address logged** (PII, no debugging value for single-user app)
- **No error message in request log** — error handler handles error detail separately
- **Same log format for all status codes** — status field distinguishes them
- **`/health` requests ARE logged** like any other request
- **Health route:** `GET /health` (no `/api` prefix — naturally bypasses `app.use('/api', requireSecret)`)
- **Health handler:** Inline in `app.js`, mounted before `requireSecret`
- **DB liveness check:** `prisma.$queryRaw\`SELECT 1\`` — minimal, uses existing Prisma client
- **`version` field:** Read from `server/package.json` once at app startup, stored in memory
- **`uptime`:** `process.uptime()` in seconds
- **`dbLatencyMs`:** Measured duration of the `SELECT 1` query
- **Success response (200):** `{ "status": "ok", "uptime": 123.4, "version": "1.1.0", "dbLatencyMs": 5 }`
- **Failure response (503):** `{ "status": "error", "uptime": 123.4, "version": "1.1.0", "dbLatencyMs": null, "error": "..." }`
- **New directory:** `server/middleware/`
- **Logging middleware file:** `server/middleware/requestLogger.js` (exported as default)
- **Health route:** Inline in `app.js` — not worth a separate file

### Claude's Discretion
- Exact log timestamp field (include or omit — `new Date().toISOString()` is obvious if included)
- Whether to include a `type` or `event` field to distinguish request logs from other log types
- Error message format in 503 response (raw `err.message` vs sanitized string)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OBS-01 | Request/response logging middleware emits structured JSON (method, path, status, duration) on every request; `x-reach-secret` header is redacted from logs | `res.on('finish')` pattern captures final status + duration; redaction is a simple header omission in the log object |
| OBS-02 | `GET /health` returns DB liveness status, uptime, version, and DB latency; mounted before `requireSecret` so no auth header is required | Route at root `/health` bypasses `app.use('/api', requireSecret)`; `prisma.$queryRaw` for DB check; `process.uptime()` for uptime; `readFileSync` of `package.json` at startup for version |
</phase_requirements>

---

## Summary

Phase 9 adds two pieces of production observability infrastructure to the Express server: a request logging middleware and a public health endpoint. Both are zero-dependency implementations using existing Node.js built-ins and the already-installed Prisma client.

The logging middleware uses the `res.on('finish')` event pattern, which is the canonical Express approach for capturing the final HTTP status code and response time after the response is committed. Placing it as the first `app.use()` call guarantees all requests — including CORS preflights, auth failures, and `/health` polls — produce a log entry.

The health endpoint is a single inline route in `app.js`, placed before the `requireSecret` guard. It performs a `SELECT 1` query via Prisma to verify DB connectivity, measures the round-trip latency, and returns a fixed JSON shape that load balancers can parse deterministically. On DB failure it returns 503 instead of 200 so that load balancers can remove the instance.

**Primary recommendation:** Implement as two small, focused additions to the existing Express app — one middleware file and four lines of inline route handler. No new npm packages required.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `node:test` | built-in | Test runner for the new test file | Already used by all other server tests |
| `node:assert/strict` | built-in | Assertions in tests | Already used by all other server tests |
| `node:http` | built-in | HTTP helper for integration tests | Already used by outreach/analytics test harness |
| `@prisma/client` | ^5 (installed) | DB liveness query in `/health` | Already in project — `server/lib/prisma.js` exports singleton |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` (readFileSync) | built-in | Read `server/package.json` for `version` at startup | One-time synchronous read at module load — acceptable |
| `node:url` + `node:path` | built-in | `__dirname` equivalent in ESM for locating `package.json` | Required because `server` uses `"type": "module"` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `console.log(JSON.stringify(...))` | pino, morgan | Locked out by user decision — zero-dependency is the goal |
| Inline `/health` in `app.js` | Separate `routes/health.js` | Inline is simpler; user explicitly decided this |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure
```
server/
├── middleware/
│   └── requestLogger.js   # New — exported as default, mounted first in app.js
├── app.js                 # Modified — import requestLogger, add /health route, read version
├── lib/
│   └── prisma.js          # Existing — import for health check
└── observability.test.js  # New — integration tests for OBS-01 and OBS-02
```

### Pattern 1: res.on('finish') Request Logger

**What:** Record `Date.now()` at the top of the middleware, attach `res.on('finish', ...)` listener, emit the structured log line inside that listener.

**When to use:** Any time you need to capture the final status code and elapsed duration — the `finish` event fires after the response has been fully flushed to the OS, so `res.statusCode` is guaranteed to be final.

**Example:**
```javascript
// server/middleware/requestLogger.js
export default function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const log = {
      // timestamp: optional, at Claude's discretion
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      query: req.query,
    };
    // x-reach-secret intentionally omitted — never log auth credentials
    console.log(JSON.stringify(log));
  });
  next();
}
```

**Key details:**
- `req.path` gives the path without query string (e.g. `/api/outreach`, not `/api/outreach?limit=10`)
- `req.query` is already parsed by Express — including it captures query parameters without embedding them in `path`
- `res.statusCode` inside `finish` callback is the final committed status
- No try/catch needed — `JSON.stringify` on these primitive values cannot throw

### Pattern 2: Inline Health Route

**What:** A single `app.get('/health', async (req, res) => { ... })` placed after `express.json()` and before `app.use('/api', requireSecret)`.

**When to use:** Public endpoints that must bypass authentication middleware.

**Example:**
```javascript
// Inline in app.js — add after readFileSync for version at top of file
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prisma } from './lib/prisma.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8')
);

// In app setup, before app.use('/api', requireSecret):
app.get('/health', async (req, res) => {
  const uptime = process.uptime();
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - t0;
    res.json({ status: 'ok', uptime, version, dbLatencyMs });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      uptime,
      version,
      dbLatencyMs: null,
      error: err.message,
    });
  }
});
```

**Key details:**
- Route MUST be placed before `app.use('/api', requireSecret)` — Express matches routes top-to-bottom, but since `/health` has no `/api` prefix it would naturally skip the guard anyway; placing it explicitly above is clearer
- `process.uptime()` returns fractional seconds (e.g. `123.456`) — no parsing needed
- `readFileSync` at module load (not inside the handler) — reads once, never blocks a request
- `prisma.$queryRaw\`SELECT 1\`` returns `[{ "1": 1 }]`; we discard the result and only care whether it throws
- `err.message` in 503 is at Claude's discretion; raw message is acceptable for a single-user app

### Pattern 3: ESM `__dirname` in Node.js

**What:** ES modules do not have `__dirname`. The canonical workaround is required to locate `package.json`.

**Example:**
```javascript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
```

**Note:** `import.meta.url` in `app.js` refers to `server/app.js`, so `join(__dirname, 'package.json')` resolves to `server/package.json` — which is the file that contains `"version": "1.0.0"`.

### Anti-Patterns to Avoid

- **Logging in the route handler instead of middleware:** Misses 401s, CORS preflights, and any request that doesn't reach a route handler.
- **Using `req.url` instead of `req.path` for the path field:** `req.url` includes the query string, which would duplicate what `query` already captures.
- **Placing `/health` after `app.use('/api', requireSecret)`:** While the `/api` guard doesn't technically apply to `/health`, ordering is an explicit requirement and matters when reading the code.
- **Reading `package.json` inside the health handler:** Unnecessary file I/O on every poll — read once at startup.
- **Returning 200 when DB is down:** Load balancers interpret 2xx as healthy; must return 503 on DB failure.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Response time measurement | Custom timers | `Date.now()` delta with `res.on('finish')` | This IS the hand-rolled solution — no library needed at this scale |
| Structured log output | Custom log formatter class | `JSON.stringify({...})` directly | The locked decision; complexity unwarranted |
| DB connectivity check | Custom ping logic | `prisma.$queryRaw\`SELECT 1\`` | Reuses existing Prisma connection pool; no new socket overhead |

**Key insight:** This phase is intentionally zero-abstraction. The patterns are so small (< 30 lines each) that any abstraction layer would add more complexity than it removes.

---

## Common Pitfalls

### Pitfall 1: `res.statusCode` read too early

**What goes wrong:** Reading `res.statusCode` synchronously in the middleware (before `next()` or in a sync position) gives `200` for all requests, even ones that later become 401 or 500.

**Why it happens:** Express sets `res.statusCode` when `res.status(N)` or `res.json()` is called, which happens inside route handlers and error handlers — after `next()` returns.

**How to avoid:** Always read `res.statusCode` inside the `res.on('finish', ...)` callback, never before.

**Warning signs:** All log entries show `"status": 200` even for requests you know failed.

### Pitfall 2: `req.path` vs `req.url`

**What goes wrong:** Using `req.url` includes the query string: `/api/outreach?limit=10&offset=0`. If `query` is also logged, query parameters appear twice.

**Why it happens:** `req.url` is the raw URL string; `req.path` is Express's parsed path-only value.

**How to avoid:** Use `req.path` for the `path` field. Use `req.query` (already an object) for the `query` field.

### Pitfall 3: `readFileSync` inside the health handler

**What goes wrong:** Every load balancer poll (every few seconds) triggers a synchronous file read from disk.

**Why it happens:** Putting initialization logic inside the handler instead of at module load.

**How to avoid:** Call `readFileSync` at the top of `app.js` and store the `version` string in a `const`.

### Pitfall 4: Middleware mounting order

**What goes wrong:** If `requestLogger` is mounted after `cors()` or `requireSecret`, preflight requests (OPTIONS) and rejected 401 requests never produce a log entry.

**Why it happens:** Express executes middleware in registration order; requests rejected early never reach later middleware.

**How to avoid:** `app.use(requestLogger)` must be the first `app.use()` call in `app.js`, before `app.use(cors(...))`.

### Pitfall 5: ESM `__dirname` not defined

**What goes wrong:** `ReferenceError: __dirname is not defined in ES module scope` at server startup.

**Why it happens:** `server` uses `"type": "module"` — CommonJS globals like `__dirname` and `__filename` are not available.

**How to avoid:** Use the `fileURLToPath` + `dirname` pattern shown in Pattern 3 above. The same pattern is already used in `outreach.test.js` and `analytics.test.js`.

### Pitfall 6: Logging `x-reach-secret` accidentally

**What goes wrong:** A catch-all header dump (e.g. `headers: req.headers`) includes the secret token in plaintext logs.

**Why it happens:** Attempting to log "all request details" without explicitly allowlisting fields.

**How to avoid:** Build the log object field-by-field. Never include `req.headers` as a block. The `requestLogger` only logs `method`, `path`, `status`, `durationMs`, and `query`.

---

## Code Examples

Verified patterns from official sources and existing project code:

### res.on('finish') — Node.js EventEmitter pattern
```javascript
// Source: Node.js HTTP docs — ServerResponse inherits EventEmitter
// 'finish' fires when the response has been handed to the OS
res.on('finish', () => {
  // res.statusCode is final here
  console.log(JSON.stringify({ status: res.statusCode }));
});
```

### prisma.$queryRaw — raw SQL via Prisma
```javascript
// Source: server/lib/prisma.js exports the singleton
import { prisma } from './lib/prisma.js';

// Template literal form — preferred for parameterized/literal queries
await prisma.$queryRaw`SELECT 1`;
// Returns [{ "1": 1 }] on Postgres — discard result, catch error
```

### process.uptime()
```javascript
// Source: Node.js process docs
// Returns seconds elapsed since process started, as a float
const uptime = process.uptime(); // e.g. 42.387
```

### Reading package.json at startup (ESM)
```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
// version === '1.0.0' (from server/package.json)
```

### Existing test harness pattern (for new test file)
```javascript
// Source: server/outreach.test.js — established pattern for all server tests
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
process.env.REACH_SECRET = 'test-secret';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Dynamic import after env vars are set
const { default: app } = await import('./app.js');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| morgan for HTTP logging | Custom `res.on('finish')` middleware | This project — by design | Zero deps, total control over log shape |
| Winston/pino for structured logs | `console.log(JSON.stringify(...))` | This project — by design | Synchronous, simple, no configuration overhead |
| Separate health route file | Inline in app.js | This project — by design | Appropriate for a single short handler |

**Note:** The "old approach" column represents ecosystem defaults, not prior project code. The decisions in CONTEXT.md are intentional departures from those defaults, justified by the project's single-user scale.

---

## Open Questions

1. **Timestamp field in log output**
   - What we know: CONTEXT.md leaves this to Claude's discretion
   - What's unclear: Whether the planner should include `timestamp: new Date().toISOString()` or omit it
   - Recommendation: Include it — structured logs without timestamps lose all correlation value when reading log output, and `new Date().toISOString()` is one additional field with zero cost

2. **`type`/`event` field in log output**
   - What we know: CONTEXT.md leaves this to Claude's discretion
   - What's unclear: Whether a `type: 'request'` field is worth adding now vs later
   - Recommendation: Include `type: 'request'` — Phase 10 (Sentry) may add `type: 'error'` log lines and having a discriminator field from the start avoids a grep/parse ambiguity

3. **Error message sanitization in 503**
   - What we know: CONTEXT.md leaves this to Claude's discretion; raw `err.message` is the simplest approach
   - Recommendation: Use raw `err.message` — this endpoint is unauthenticated but the error detail is low-sensitivity (Prisma connection strings are in env vars, not in error messages)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (no version — built into Node) |
| Config file | none — invoked directly via CLI |
| Quick run command | `node --test server/observability.test.js` |
| Full suite command | `node --test --test-concurrency=1 extension/*.test.js web/src/**/*.test.js server/*.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | Every request emits structured JSON log line | integration | `node --test server/observability.test.js` | ❌ Wave 0 |
| OBS-01 | `x-reach-secret` header value is redacted | integration | `node --test server/observability.test.js` | ❌ Wave 0 |
| OBS-02 | `GET /health` returns 200 with required fields | integration | `node --test server/observability.test.js` | ❌ Wave 0 |
| OBS-02 | `GET /health` requires no auth header | integration | `node --test server/observability.test.js` | ❌ Wave 0 |

**Note on testing the logger:** The logger writes to stdout via `console.log`. Tests can capture this by reassigning `console.log` before the request and restoring it after, then asserting on the captured JSON string. This is a standard Node.js test pattern.

### Sampling Rate
- **Per task commit:** `node --test server/observability.test.js`
- **Per wave merge:** `node --test --test-concurrency=1 server/*.test.js`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/observability.test.js` — covers OBS-01 (logger output shape, redaction) and OBS-02 (health response shape, no-auth access)
- [ ] `server/middleware/` directory — must be created before requestLogger.js can be written

*(All test infrastructure otherwise exists — node:test built-in, http helper pattern established in outreach.test.js)*

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `server/app.js` — middleware mounting order, existing patterns
- Direct code inspection of `server/outreach.test.js` — test harness pattern (node:test, http helper, dynamic import)
- Direct code inspection of `server/lib/prisma.js` — Prisma singleton export
- Direct code inspection of `server/package.json` — version field, ESM module type
- Direct code inspection of `server/index.js` — startup sequence, dynamic import pattern
- `09-CONTEXT.md` — all implementation decisions (locked)
- Node.js `process.uptime()` — built-in, no external verification needed
- Node.js `res.on('finish')` — standard HTTP EventEmitter behavior

### Secondary (MEDIUM confidence)
- `prisma.$queryRaw\`SELECT 1\`` pattern — standard Prisma raw query syntax; consistent with Prisma v5 docs

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all tools are built-ins or already installed
- Architecture: HIGH — patterns are fully specified in CONTEXT.md and cross-verified with existing code
- Pitfalls: HIGH — sourced from direct code inspection of existing patterns in the codebase

**Research date:** 2026-03-17
**Valid until:** 2026-09-17 (Node.js built-ins and Express patterns are stable)
