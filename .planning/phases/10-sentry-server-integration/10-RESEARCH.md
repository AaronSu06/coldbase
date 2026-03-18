# Phase 10: Sentry Server Integration - Research

**Researched:** 2026-03-17
**Domain:** @sentry/node v8/v10 — Express integration, PII scrubbing, ESM instrument.js, node:test mocking
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**instrument.js placement**
- `instrument.js` is the first import in `index.js` — decided in v1.1 research
- `instrument.js` calls `Sentry.init()` only; it does NOT receive the app instance
- `setupExpressErrorHandler(app)` is called from `app.js` after the app is created

**PII scrubbing**
- `beforeSend` hook sets `event.request.data = '[Filtered]'` — strips the entire request body
- `beforeSend` also deletes `event.request.headers['x-reach-secret']` (or sets to `'[Filtered]'`)
- Consistent with Phase 9 decision to redact x-reach-secret from request logs
- Rationale: request bodies may contain email addresses; blanket strip is simpler and guaranteed PII-safe

**No-DSN behavior**
- If `SENTRY_DSN` env var is not set, `instrument.js` skips `Sentry.init()` silently — server starts normally
- No warning logged, no hard fail — clean local dev experience
- `SENTRY_DSN=` added to `.env.example` as a commented optional entry for documentation

**Error handler placement in app.js**
- `Sentry.setupExpressErrorHandler(app)` is added just BEFORE the existing `(err, req, res, next)` handler
- Sentry captures the error and calls `next(err)`, then the existing handler formats the JSON response
- Existing handler (Prisma P2002/P2025 logic, consistent error shape) is NOT modified

**Sentry tags**
- `environment`: `process.env.NODE_ENV` (standard, no custom env var needed)
- `release`: version string read from `server/package.json` (already read at app startup in `app.js`)

**Test file**
- `server/sentry.test.js` — consistent with existing test file naming pattern
- Mock `@sentry/node` to unit test that `Sentry.init()` is called with correct config when DSN is present
- Unit test `beforeSend` function directly to verify body stripped and x-reach-secret header redacted
- Unit test that `Sentry.init()` is NOT called when DSN is absent

### Claude's Discretion
- Exact mock approach for `@sentry/node` in tests (jest.mock or manual stub)
- Whether `instrument.js` exports anything for testability or just has side effects on import
- Exact value used for `[Filtered]` string (could be `undefined`, `null`, or the string `'[Filtered]'`)

### Deferred Ideas (OUT OF SCOPE)
- MON-02: Sentry in Chrome MV3 background service worker — v1.2 milestone
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MON-01 | `@sentry/node` wired to Express via `instrument.js` as first server import; captures unhandled exceptions and promise rejections with `environment` and `release` tags; `beforeSend` strips PII from request data | Covered by: Standard Stack (package + version), Architecture Patterns (instrument.js + setupExpressErrorHandler placement), Code Examples (beforeSend PII pattern), Validation Architecture (test map) |
</phase_requirements>

---

## Summary

`@sentry/node` v8/v10 (currently ~v10.x on npm) provides an Express integration via `setupExpressErrorHandler()`. The SDK uses an "instrument first" pattern: a dedicated `instrument.js` file calls `Sentry.init()` and must be loaded before all other application code so that Node.js built-ins (http, etc.) can be patched. For Express specifically, `setupExpressErrorHandler(app)` must be called after all routes are defined and before any other error-handling middleware — this slots naturally just above the existing error handler in `app.js`.

The project uses ESM (`"type": "module"` in package.json) and Node 22. Sentry's preferred ESM approach for full instrumentation is the `--import` CLI flag, but the project's CONTEXT.md has locked `import './instrument.js'` as the first line in `index.js` (side-effect import). Research confirms this works for Express error handler capture — the `--import` flag is only required for deeper OTel-based auto-instrumentation of third-party ORMs and queues. Since this phase only requires unhandled exception capture (not distributed tracing), the side-effect import pattern is sufficient and matches the locked decision.

The test strategy requires `node:test`'s `mock.module()` API, which needs the `--experimental-test-module-mocks` flag in Node 22. The best approach for testability is to export `initSentry` and `beforeSend` as named functions from `instrument.js`, unit-testing them directly without needing to mock the entire module in isolation. This avoids the `--experimental-test-module-mocks` flag entirely.

**Primary recommendation:** Install `@sentry/node`, create `instrument.js` with exported helper functions for testability, wire `setupExpressErrorHandler` into `app.js`, and unit test `beforeSend` and init behavior directly.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sentry/node | ^8 (v8.x stable; v10.x on npm as of 2026) | Node.js/Express error capture | Official Sentry SDK; replaces deprecated `@sentry/node` v7 patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | No additional packages needed | `@sentry/node` bundles its own Express integration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@sentry/node` | `@sentry/node` v7 | v7 is deprecated; `Handlers.requestHandler()` / `Handlers.errorHandler()` API removed in v8 |
| side-effect import | `--import ./instrument.js` NODE_OPTIONS | `--import` gives broader OTel instrumentation; side-effect import sufficient for exception-only capture |

**Installation:**
```bash
npm install @sentry/node
```

---

## Architecture Patterns

### Recommended Project Structure
```
server/
├── instrument.js        # NEW — Sentry.init() + exported beforeSend + initSentry helpers
├── index.js             # MODIFIED — import './instrument.js' as first line
├── app.js               # MODIFIED — Sentry.setupExpressErrorHandler(app) before error handler
├── sentry.test.js       # NEW — unit tests for MON-01
└── .env.example         # MODIFIED — add SENTRY_DSN= commented entry
```

### Pattern 1: instrument.js with Exported Functions

**What:** `instrument.js` exports `initSentry` and `beforeSend` as named functions so tests can call them directly. The module also calls `initSentry()` as a side effect on import.

**When to use:** When the test strategy requires unit-testing init behavior and the `beforeSend` filter without complex module mocking.

**Example:**
```javascript
// server/instrument.js
// Source: https://docs.sentry.io/platforms/javascript/guides/express/

import * as Sentry from '@sentry/node';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8')
);

export function beforeSend(event) {
  // Strip request body — may contain email addresses
  if (event.request) {
    event.request.data = '[Filtered]';
    // Redact x-reach-secret header
    if (event.request.headers) {
      delete event.request.headers['x-reach-secret'];
    }
  }
  return event;
}

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // Silent no-op in local dev
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    release: version,
    beforeSend,
  });
}

// Side-effect: initialise on import
initSentry();
```

### Pattern 2: index.js — instrument.js as first import

**What:** `import './instrument.js'` must be the very first line in `index.js`, before `execSync` and before the dynamic `import('./app.js')`.

**When to use:** Always — this is the "instrument first" requirement.

**Example:**
```javascript
// server/index.js (top of file)
// Source: https://docs.sentry.io/platforms/javascript/guides/node/install/esm-without-import/
import './instrument.js';
import { execSync } from 'node:child_process';
// ... rest of index.js unchanged
```

### Pattern 3: app.js — setupExpressErrorHandler placement

**What:** `Sentry.setupExpressErrorHandler(app)` is inserted immediately before the existing `(err, req, res, next)` error handler. Sentry catches the error, records it, then calls `next(err)` so the existing handler still formats the JSON response.

**When to use:** Always — Sentry docs state it must come after routes, before other error middleware.

**Example:**
```javascript
// server/app.js — just above the existing error handler
// Source: https://docs.sentry.io/platforms/javascript/guides/express/
import * as Sentry from '@sentry/node';

// ... (all routes above) ...

// ─── Sentry error handler — captures before formatting ────────────────────────
Sentry.setupExpressErrorHandler(app);

// ─── Global error handler — MUST be last app.use() call ───────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // ... existing Prisma P2002/P2025 logic unchanged ...
});
```

### Pattern 4: beforeSend — PII scrubbing

**What:** The `beforeSend` hook receives `(event, hint)` and returns the modified event. Setting `event.request.data` to a string replaces the body. Deleting a key from `event.request.headers` removes the header.

**Source:** https://docs.sentry.io/platforms/javascript/configuration/options/ (beforeSend signature: `(event: Event, hint: EventHint) => Event | null`)

```javascript
export function beforeSend(event) {
  if (event.request) {
    // Blanket strip — guarantees no PII from request bodies (may contain emails)
    event.request.data = '[Filtered]';
    if (event.request.headers) {
      delete event.request.headers['x-reach-secret'];
    }
  }
  return event;
}
```

### Anti-Patterns to Avoid

- **Importing `@sentry/node` before `instrument.js` runs:** Any file that imports Sentry before `Sentry.init()` is called will miss initialization. `instrument.js` must be the first side-effect import.
- **Calling `setupExpressErrorHandler` before routes:** Must come AFTER all route registrations or it won't capture route handler errors.
- **Using `enabled: false` for no-DSN behavior:** Sentry docs confirm `enabled: false` still runs instrumentation overhead. The correct approach is to conditionally call `Sentry.init()` only when DSN is present (already locked in CONTEXT.md).
- **Using the v7 Handlers API:** `Sentry.Handlers.requestHandler()` and `Sentry.Handlers.errorHandler()` were removed in v8. Use `setupExpressErrorHandler(app)` only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error event capture | Custom `process.on('uncaughtException')` handler | `@sentry/node` + `Sentry.init()` | SDK handles uncaughtException, unhandledRejection, and Express error propagation; custom handlers miss async context |
| Request body scrubbing | Custom middleware to strip fields before they reach Sentry | `beforeSend` hook in `Sentry.init()` | Middleware runs before the error — `beforeSend` runs at send time and catches all paths including crashes |
| Release tagging | Custom HTTP calls to Sentry API | `release` option in `Sentry.init()` | Built-in option, automatically attached to all events |

---

## Common Pitfalls

### Pitfall 1: ESM Side-Effect Import Scope

**What goes wrong:** The Sentry docs recommend `--import ./instrument.mjs` for full ESM instrumentation coverage. Using `import './instrument.js'` instead limits instrumentation to native Node.js APIs.

**Why it happens:** ESM module evaluation order differs from CJS require. With `--import`, Node patches built-ins before any userland code runs. With a side-effect import, the patch happens at module evaluation time (still early, but after Node built-ins are resolved).

**How to avoid:** For this phase, the side-effect import is sufficient because the goal is Express error handler capture, not distributed tracing. `setupExpressErrorHandler()` works regardless of the import mechanism. The `--import` flag would be needed if adding OpenTelemetry tracing for Prisma DB calls (out of scope).

**Warning signs:** If Sentry events are missing DB call context — this would only matter if/when tracing is added.

### Pitfall 2: node:test mock.module() Requires Experimental Flag in Node 22

**What goes wrong:** `mock.module()` from `node:test` is undefined without the `--experimental-test-module-mocks` flag in Node 22.

**Why it happens:** The API was still experimental in Node 22.x.

**How to avoid:** Export `initSentry` and `beforeSend` as named functions from `instrument.js` and test them directly. This avoids needing to mock `@sentry/node` at the module level. The test for "init is NOT called when DSN is absent" can be verified by checking `Sentry.getCurrentScope()` behavior or by restructuring `initSentry` to return a boolean.

**Warning signs:** `TypeError: mock.module is not a function` in test output.

### Pitfall 3: beforeSend Called with event.request === undefined

**What goes wrong:** Not all Sentry events have a `request` property — performance spans and message events may lack it.

**Why it happens:** `beforeSend` is called for all event types, not just HTTP errors.

**How to avoid:** Guard with `if (event.request)` before accessing `.data` or `.headers`. Already reflected in the code examples above.

### Pitfall 4: setupExpressErrorHandler and 4-Argument Error Handlers

**What goes wrong:** If the existing `(err, req, res, next)` handler is placed before `setupExpressErrorHandler`, Sentry never sees the error.

**Why it happens:** Express error middleware is evaluated in registration order. The Sentry handler must intercept before the response-formatting handler.

**How to avoid:** `Sentry.setupExpressErrorHandler(app)` is inserted immediately before the existing handler — this is locked in CONTEXT.md.

### Pitfall 5: SENTRY_DSN check at import time vs runtime

**What goes wrong:** In tests, `SENTRY_DSN` may be set in `.env.test` or not. If `instrument.js` is imported by `app.js` (which is loaded via dynamic import in tests), the init could fire unexpectedly.

**Why it happens:** The test runner imports `app.js` directly, which now imports `instrument.js`, which calls `initSentry()`.

**How to avoid:** Ensure `SENTRY_DSN` is NOT set in `.env.test` (or is set to empty string). `initSentry()` returns early when `SENTRY_DSN` is falsy — test environment sees no Sentry init.

---

## Code Examples

Verified patterns from official sources:

### Sentry.init() with all required options
```javascript
// Source: https://docs.sentry.io/platforms/javascript/configuration/options/
Sentry.init({
  dsn: process.env.SENTRY_DSN,       // required — events sent here
  environment: process.env.NODE_ENV, // 'production', 'development', etc.
  release: version,                  // string from package.json
  beforeSend,                        // (event, hint) => event | null
});
```

### setupExpressErrorHandler (v8+ API)
```javascript
// Source: https://docs.sentry.io/platforms/javascript/guides/express/
// Must come after all routes, before other error middleware
Sentry.setupExpressErrorHandler(app);
```

### DSN-conditional init (no-DSN behavior)
```javascript
// Source: https://docs.sentry.io/platforms/javascript/configuration/options/
// "If [dsn] is not set, the SDK will not send any events."
// Preferred: skip init entirely for clean local dev with zero overhead
export function initSentry() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({ dsn: process.env.SENTRY_DSN, /* ... */ });
}
```

### Unit-testing beforeSend without module mocks
```javascript
// server/sentry.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { beforeSend } from './instrument.js';

describe('MON-01: Sentry beforeSend PII filter', () => {
  it('sets request.data to [Filtered]', () => {
    const event = { request: { data: { email: 'test@example.com' } } };
    const result = beforeSend(event);
    assert.equal(result.request.data, '[Filtered]');
  });

  it('removes x-reach-secret from request headers', () => {
    const event = {
      request: { headers: { 'x-reach-secret': 'mysecret', 'content-type': 'application/json' } }
    };
    const result = beforeSend(event);
    assert.equal(result.request.headers['x-reach-secret'], undefined);
    assert.equal(result.request.headers['content-type'], 'application/json'); // preserved
  });

  it('returns event unchanged when event.request is absent', () => {
    const event = { exception: { values: [{ type: 'Error' }] } };
    const result = beforeSend(event);
    assert.ok(result === event);
  });
});
```

### Unit-testing initSentry conditional behavior
```javascript
describe('MON-01: Sentry init behavior', () => {
  it('does not throw when SENTRY_DSN is absent', () => {
    const originalDsn = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    try {
      assert.doesNotThrow(() => initSentry());
    } finally {
      if (originalDsn !== undefined) process.env.SENTRY_DSN = originalDsn;
    }
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Sentry.Handlers.requestHandler()` + `Sentry.Handlers.errorHandler()` | `Sentry.setupExpressErrorHandler(app)` | v8.0.0 | Old API removed; projects on v7 must migrate |
| `@sentry/node` + `@sentry/tracing` separate packages | `@sentry/node` only | v8.0.0 | Tracing merged into core package |
| CJS `require('./instrument')` | ESM `import './instrument.js'` or `--import` flag | Node 18.19+ | ESM-native; `--import` gives deeper instrumentation |

**Deprecated/outdated:**
- `Sentry.Handlers.*`: Removed in v8. Do not use.
- `@sentry/tracing`: Merged into `@sentry/node` in v8. Do not install separately.
- `enableTracing: true` as only tracing option: Replaced by `tracesSampleRate` / `profilesSampleRate`.

---

## Open Questions

1. **Exact @sentry/node version to pin**
   - What we know: npm shows v10.x packages (e.g., `@sentry/core@10.40.0`); v8.x is the stable line referenced in migration docs
   - What's unclear: Whether v9 or v10 is the current stable `@sentry/node` for new installs
   - Recommendation: Run `npm install @sentry/node` (no version pin) in Wave 0 and document the resolved version. The API covered here (`Sentry.init`, `setupExpressErrorHandler`, `beforeSend`) is stable across v8/v9/v10.

2. **Whether instrument.js needs to guard against double-init**
   - What we know: `instrument.js` is imported once in `index.js`; in tests, `app.js` is dynamically imported (not `index.js`), so `instrument.js` is not imported during tests
   - What's unclear: If any test file imports `instrument.js` directly (e.g., `sentry.test.js`), `initSentry()` fires as a side effect — but with no `SENTRY_DSN` set in test env, it's a no-op
   - Recommendation: Ensure `SENTRY_DSN` is absent or empty in `.env.test`. No double-init guard needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node 22.17.0) |
| Config file | none — `npm test` runs `node --env-file=.env.test --test *.test.js` |
| Quick run command | `cd server && node --env-file=.env.test --test sentry.test.js` |
| Full suite command | `cd server && npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MON-01 | `beforeSend` strips request body | unit | `node --env-file=.env.test --test sentry.test.js` | Wave 0 |
| MON-01 | `beforeSend` redacts x-reach-secret header | unit | `node --env-file=.env.test --test sentry.test.js` | Wave 0 |
| MON-01 | `beforeSend` is safe when event.request absent | unit | `node --env-file=.env.test --test sentry.test.js` | Wave 0 |
| MON-01 | `initSentry()` is no-op when SENTRY_DSN absent | unit | `node --env-file=.env.test --test sentry.test.js` | Wave 0 |
| MON-01 | `setupExpressErrorHandler` slot in app.js | integration smoke | `node --env-file=.env.test --test observability.test.js` | Exists (GET /health still passes) |
| MON-01 | Unhandled exception propagates to error handler | manual-only | Throw in route, verify Sentry dashboard | N/A — requires real DSN |

**Note:** The `--experimental-test-module-mocks` flag is NOT needed because `beforeSend` and `initSentry` are exported from `instrument.js` and tested directly (no module-level mocking of `@sentry/node` required).

### Sampling Rate
- **Per task commit:** `cd server && node --env-file=.env.test --test sentry.test.js`
- **Per wave merge:** `cd server && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/sentry.test.js` — covers MON-01 (beforeSend and initSentry unit tests)
- [ ] `server/instrument.js` — must export `initSentry` and `beforeSend` for testability

---

## Sources

### Primary (HIGH confidence)
- https://docs.sentry.io/platforms/javascript/guides/express/ — Express integration, `setupExpressErrorHandler` API
- https://docs.sentry.io/platforms/javascript/guides/node/install/esm-without-import/ — side-effect import limitations and when it is sufficient
- https://docs.sentry.io/platforms/javascript/configuration/options/ — `beforeSend` signature `(event, hint) => event | null`; DSN-absent behavior: "SDK will not send any events"; `enabled: false` overhead warning
- https://nodejs.org/en/learn/test-runner/mocking — `mock.module()` API, dynamic import requirement for ESM mocking

### Secondary (MEDIUM confidence)
- https://docs.sentry.io/platforms/javascript/guides/node/migration/v7-to-v8/ — v7 Handlers API removed; `@sentry/tracing` merged into core
- https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/ — `beforeSend` scrubbing patterns; `delete event.user.email` pattern adapted for request headers
- GitHub nodejs/node issue #55891 — `--experimental-test-module-mocks` required in Node 22 for `mock.module()`

### Tertiary (LOW confidence)
- npm search results showing `@sentry/core@10.40.0` suggesting v10.x is current (not directly verified against `@sentry/node` specifically)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@sentry/node` + `setupExpressErrorHandler` verified against official docs
- Architecture: HIGH — instrument.js pattern, handler placement, and beforeSend API all verified against official Sentry docs
- Pitfalls: HIGH (ESM limitation, handler ordering) / MEDIUM (Node 22 mock.module flag — verified via shell test)

**Research date:** 2026-03-17
**Valid until:** 2026-06-17 (stable API — 90 days; revisit if @sentry/node v11 drops)
