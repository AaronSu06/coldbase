# Phase 3: Server Restructure - Research

**Researched:** 2026-03-15
**Domain:** Express.js route decomposition, Zod validation middleware, global error handling, pagination, Promise.allSettled parallelism
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pagination response shape**
- Change GET /api/outreach response from plain array to `{ data: [], total: N }`
- Default limit: 100 records when `limit` param is omitted
- Update `web/src/hooks/useOutreach.js` in this phase to destructure `{ data, total }` correctly — not deferred to Phase 5

**Zod schema placement**
- Schemas defined inline in each route file, directly above the handler that uses them
- No separate `server/schemas/` directory
- POST /api/outreach: validate required fields only (threadId, companyName, contactEmail) — pass-through unknown fields; don't break if extension sends extra keys
- PATCH /api/outreach/:threadId: use `.partial()` version of the POST schema — validates types of present fields, ignores absent ones

**Shared helper placement**
- `buildDraftPrompt()` moves into `routes/email.js` (co-located with the route that uses it)
- Prisma client extracted to `server/lib/prisma.js` — exports the singleton; all route files import from there
- Middleware (requireSecret, CORS, rate limiter) stays in `server/index.js` — index.js is the app-level orchestrator; route files stay clean

**Route decomposition**
- `routes/outreach.js`: GET /api/outreach, POST /api/outreach, PATCH /api/outreach/:threadId, DELETE /api/outreach/:threadId
- `routes/tracking.js`: GET /track/:trackingId, POST /api/track
- `routes/email.js`: POST /api/find-email, POST /api/suggest-domains, POST /api/draft-email, buildDraftPrompt helper
- `routes/analytics.js`: GET /api/insights/best-time
- `server/index.js` becomes mounting orchestrator only — no business logic

### Claude's Discretion
- Exact Zod schema field types and optional fields for POST /api/outreach (infer from Prisma model)
- Error response formatting in global handler (shape is spec'd: `{ error, message, statusCode }`)
- How errors propagate from route handlers to global handler (next(err) pattern)
- SMTP probe timeout handling in emailFinder.js

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-01 | Server routes decomposed into separate files by domain — `routes/outreach.js`, `routes/tracking.js`, `routes/email.js`, `routes/analytics.js`; `index.js` becomes mounting orchestrator | Express Router pattern documented below; route mounting syntax confirmed from index.js analysis |
| SERV-02 | Zod validation middleware applied to all POST and PATCH endpoints with consistent 400 response on invalid input | Zod already in package.json at ^3; inline schema + safeParse pattern confirmed; required fields identified from Prisma schema |
| SERV-03 | Global error handler middleware added; all route errors propagate via `next(err)`; consistent error response shape `{ error, message, statusCode }` across all routes | Express 4-arg error handler pattern documented; all current try/catch patterns identified for conversion |
| PERF-01 | `GET /api/outreach` supports `limit` and `offset` query params; response includes `total` count; default limit of 100 records | Prisma `findMany` + `count` parallel pattern documented; response shape confirmed: `{ data, total }` |
| PERF-02 | SMTP email verification probes in `emailFinder.js` run in parallel using `Promise.allSettled()`; sequential blocking eliminated | Sequential loop in emailFinder.js lines 348-358 identified; Promise.allSettled replacement pattern documented |
</phase_requirements>

---

## Summary

Phase 3 is a pure refactor: no new behaviour, no API URL changes, no new dependencies. The server is already Express 4 with Zod ^3 installed. The entire phase is mechanical transformation — moving existing code into the right files, adding validation at entry points, wiring error propagation, and parallelising an already-understood probe loop.

The riskiest touch point is `useOutreach.js` in the web client. `fetchOutreach()` currently returns a plain array and the hook maps it directly. Changing the response to `{ data, total }` without simultaneously updating the hook will break the web UI. The CONTEXT.md decision locks in updating the hook in this same phase, so this must be treated as a single atomic change.

The SMTP parallelisation in `emailFinder.js` (lines 348-358) is a straightforward sequential `for` loop over `smtpProbe()` calls. Converting to `Promise.allSettled()` is low-risk because `smtpProbe()` never throws — it always resolves. The per-email result shape is unchanged.

**Primary recommendation:** Execute in four logical sub-phases: (1) extract prisma singleton, (2) decompose routes into files, (3) add Zod validation + global error handler, (4) paginate GET /api/outreach with hook update, (5) parallelise SMTP probes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^4 | HTTP server and routing | Already in use; Router is the standard decomposition primitive |
| zod | ^3 | Runtime validation | Already installed in server/; already used in emailFinder.js |
| @prisma/client | ^5 | Database ORM | Already in use; singleton pattern is required to avoid connection pool exhaustion |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| express-rate-limit | ^8.3.1 | Rate limiting middleware | Already applied to expensive routes; stays in index.js |
| dotenv | ^16 | Environment variable loading | Already in use at top of index.js |

### Alternatives Considered
None — all decisions locked. No new dependencies required.

**Installation:**
No new packages needed. All required libraries are already in `server/package.json`.

---

## Architecture Patterns

### Recommended Project Structure
```
server/
├── index.js           # App-level orchestrator: CORS, auth, rate limit, route mounting, start
├── emailFinder.js     # Email discovery logic (SMTP parallelisation updated here)
├── lib/
│   └── prisma.js      # Prisma singleton export
├── routes/
│   ├── outreach.js    # GET/POST/PATCH/DELETE /api/outreach
│   ├── tracking.js    # GET /track/:trackingId, POST /api/track
│   ├── email.js       # POST /api/find-email, /suggest-domains, /draft-email + buildDraftPrompt
│   └── analytics.js   # GET /api/insights/best-time
└── prisma/
    └── schema.prisma
```

### Pattern 1: Express Router Module
**What:** Each route file creates a `Router` instance, registers routes on it, and exports the router. `index.js` imports and mounts each router.
**When to use:** Always — this is the Express-prescribed decomposition pattern.
**Example:**
```javascript
// server/routes/outreach.js
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res, next) => {
  // ...
});

export default router;
```

```javascript
// server/index.js (mounting)
import outreachRoutes from './routes/outreach.js';
import trackingRoutes from './routes/tracking.js';
import emailRoutes from './routes/email.js';
import analyticsRoutes from './routes/analytics.js';

app.use('/api/outreach', outreachRoutes);
app.use('/', trackingRoutes);          // tracking.js has both /track/:id and /api/track
app.use('/api', emailRoutes);          // email.js handles /find-email, /suggest-domains, /draft-email
app.use('/api/insights', analyticsRoutes);
```

**Important:** `routes/tracking.js` must be mounted at `/` (not `/api`) because it contains `GET /track/:trackingId` which has no `/api` prefix. Alternatively, mount tracking routes at `/api` and `/` separately, or keep `/track/:trackingId` in `routes/tracking.js` with the router handling the full path internally.

The cleanest approach: mount tracking at `/` and define routes as `/track/:trackingId` and `/api/track` internally, OR split the two tracking routes and mount them separately. Given the CONTEXT.md groups both in `routes/tracking.js`, use internal full paths on the router:

```javascript
// routes/tracking.js — uses full paths since mount point is '/'
router.get('/track/:trackingId', ...);
router.post('/api/track', ...);
```
Mount: `app.use('/', trackingRoutes);`

### Pattern 2: Prisma Singleton
**What:** One shared PrismaClient instance across all modules.
**When to use:** Required — multiple PrismaClient instances exhaust the SQLite connection pool.
**Example:**
```javascript
// server/lib/prisma.js
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
```

### Pattern 3: Zod Inline Validation — POST (strict required, passthrough unknown)
**What:** Define schema inline above the handler. Use `.strict()` would reject unknown fields — instead use `.passthrough()` or just leave `z.object()` default (which strips unknown by default). The CONTEXT decision says "pass-through unknown fields", so use `.passthrough()`.
**Example:**
```javascript
// routes/outreach.js
import { z } from 'zod';

const CreateOutreachSchema = z.object({
  threadId:     z.string().min(1),
  companyName:  z.string().min(1),   // Prisma field is 'company' — note mapping
  contactEmail: z.string().email(),
}).passthrough();  // unknown fields pass through to Prisma

router.post('/', async (req, res, next) => {
  const parsed = CreateOutreachSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }
  try {
    const record = await prisma.outreach.create({ data: parsed.data });
    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
});
```

**Schema field note:** The Prisma schema has `company String`, `contactName String`, `contactEmail String`. The CONTEXT.md says validate `threadId`, `companyName`, `contactEmail`. The extension sends `companyName` as the field name (which maps to `company` in Prisma via create). Verify by checking the extension's POST body shape — if it sends `company` not `companyName`, the schema field name changes. Use the actual field names from the extension's request body, then pass through to Prisma (which expects its own field names). This is a Claude's Discretion area — infer from the Prisma model.

Looking at the Prisma model: field is `company`, not `companyName`. The CONTEXT says "validate required fields only (threadId, companyName, contactEmail)" — `companyName` here is likely describing the concept, not the exact JSON key. The actual Prisma field is `company`. Since current code does `prisma.outreach.create({ data: req.body })` and it works, the extension sends field names matching the Prisma schema. Use `company` in the Zod schema.

### Pattern 4: Zod PATCH — Partial Validation
**What:** PATCH accepts any subset of fields. Use `.partial()` on the POST schema.
**Example:**
```javascript
const PatchOutreachSchema = CreateOutreachSchema.partial();

router.patch('/:threadId', async (req, res, next) => {
  const parsed = PatchOutreachSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }
  try {
    const record = await prisma.outreach.update({
      where: { threadId: req.params.threadId },
      data: parsed.data,
    });
    res.json(record);
  } catch (e) {
    next(e);
  }
});
```

### Pattern 5: Global Error Handler
**What:** Express 4-argument middleware registered AFTER all routes. Catches anything passed to `next(err)`.
**When to use:** One per app, registered last in `index.js`.
**Example:**
```javascript
// server/index.js — registered after all app.use() route mounts
app.use((err, req, res, next) => {
  // Handle known Prisma errors with specific status codes
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Conflict', message: 'Record already exists', statusCode: 409 });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not Found', message: 'Record not found', statusCode: 404 });
  }
  // CORS errors
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Forbidden', message: err.message, statusCode: 403 });
  }
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    statusCode,
  });
});
```

**Critical:** Express identifies error handlers by their 4-argument signature `(err, req, res, next)`. The `next` parameter MUST be present even if unused, or Express treats it as a regular route handler.

### Pattern 6: Pagination — Prisma findMany + count
**What:** Run `findMany` with `skip`/`take` and `count()` in parallel. Return `{ data, total }`.
**Example:**
```javascript
router.get('/', async (req, res, next) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500); // cap at 500
  const offset = parseInt(req.query.offset) || 0;

  try {
    const [records, total] = await Promise.all([
      prisma.outreach.findMany({
        orderBy: { sentDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.outreach.count(),
    ]);
    res.json({ data: records, total });
  } catch (e) {
    next(e);
  }
});
```

### Pattern 7: Promise.allSettled for SMTP Probes
**What:** Convert sequential `for` loop in `emailFinder.js` to parallel execution.
**Where:** Lines 348-358 in `server/emailFinder.js` — the per-candidate probe loop.
**Example:**
```javascript
// Current (sequential):
const probed = [];
for (const candidate of candidates) {
  let smtpResult;
  if (probedEmails.has(candidate.email)) {
    smtpResult = probedEmails.get(candidate.email);
  } else {
    smtpResult = await smtpProbe(mxHost, candidate.email);
    probedEmails.set(candidate.email, smtpResult);
  }
  probed.push({ ...candidate, smtpResult });
}

// Replacement (parallel):
const probeResults = await Promise.allSettled(
  candidates.map(async (candidate) => {
    let smtpResult;
    if (probedEmails.has(candidate.email)) {
      smtpResult = probedEmails.get(candidate.email);
    } else {
      smtpResult = await smtpProbe(mxHost, candidate.email);
      probedEmails.set(candidate.email, smtpResult);
    }
    return { ...candidate, smtpResult };
  })
);
const probed = probeResults
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);
```

`smtpProbe()` always resolves (never rejects), so `.filter(r => r.status === 'fulfilled')` is defensive but safe. The catch-all probe just above the loop (lines 337-345) can also be left sequential since it's a single probe.

### Pattern 8: useOutreach.js Hook Update
**What:** `fetchOutreach()` now returns `{ data: [], total: N }` instead of a plain array.
**Where:** `web/src/hooks/useOutreach.js` line 24.
**Current:**
```javascript
.then(data => setRecords(normalizeRecords(data)))
```
**Updated:**
```javascript
.then(({ data }) => setRecords(normalizeRecords(data)))
```
The `total` field is not currently used in the hook — store it only if needed (the requirement says the response includes `total`, not that the hook must expose it). For now, destructure only `data`.

### Anti-Patterns to Avoid
- **Throwing inside route handlers without `next(err)`:** All `catch (e)` blocks must call `next(e)`, not `res.status(500).json(...)`. Direct 500 responses bypass the global handler and produce inconsistent error shapes.
- **Multiple PrismaClient instances:** Each `new PrismaClient()` in different route files will create separate connection pools. Always import from `server/lib/prisma.js`.
- **Registering global error handler before routes:** The 4-arg error handler must be the LAST `app.use()` call. If registered before routes, it will never be reached.
- **Using `.strict()` on POST schema:** `.strict()` rejects unknown fields and will break when the extension sends extra keys. Use `.passthrough()`.
- **Forgetting `next` parameter in error handler:** `(err, req, res)` with 3 args is treated as a regular route handler by Express — the error will not be caught.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime request validation | Custom type-checking if/else chains | Zod `.safeParse()` | Already installed; handles type coercion, nested errors, partial schemas |
| Error normalization | Manually map every error type | Prisma error codes in global handler | P2002/P2025 are already handled in current code — consolidate there |
| Pagination math | Custom offset calculation | Prisma `skip`/`take` | Native ORM support; no SQL injection risk |
| Parallel async | Custom Promise queue | `Promise.allSettled()` | Built-in; handles mixed resolve/reject; no dependencies |

**Key insight:** Every pattern in this phase is a standard Express/Zod/Prisma primitive. The risk is in the migration details (route mounting paths, error handler registration order) not in the patterns themselves.

---

## Common Pitfalls

### Pitfall 1: Tracking Route Mounting Conflict
**What goes wrong:** If `routes/tracking.js` is mounted at `/api`, then `GET /track/:trackingId` would need to be at `/api/track/:trackingId` — but the tracking pixel URLs embedded in emails point to `/track/:trackingId`. Changing the URL breaks all existing open-tracking pixels in already-sent emails.
**Why it happens:** Assuming all routes should be mounted under `/api`.
**How to avoid:** Mount tracking router at `/` (root), define `router.get('/track/:trackingId', ...)` and `router.post('/api/track', ...)` with their full paths. Or mount at `/` and keep path prefix logic inside the router.
**Warning signs:** Tracking pixel returns 404 in testing after decomposition.

### Pitfall 2: expensiveRateLimit Not Passed to Route Files
**What goes wrong:** After moving email routes to `routes/email.js`, the `expensiveRateLimit` middleware defined in `index.js` is not accessible in the route file.
**Why it happens:** Forgetting that `const expensiveRateLimit` is a local variable in index.js scope.
**How to avoid:** Either (a) import and apply `expensiveRateLimit` in `index.js` when mounting, or (b) move `expensiveRateLimit` definition to `routes/email.js` (safe since it's only used there). Option (b) is cleaner — rate limiter co-located with the routes it protects.
**Warning signs:** `/api/find-email` accepts unlimited requests after refactor.

### Pitfall 3: Error Handler Not Catching Errors from Async Route Handlers
**What goes wrong:** In Express 4 (not Express 5), errors thrown inside `async` route handlers are NOT automatically forwarded to the error handler. They result in unhandled promise rejections.
**Why it happens:** Express 4 does not wrap async handlers. Express 5 does, but the server uses Express 4 (`"express": "^4"` in package.json).
**How to avoid:** All `async` route handlers MUST use explicit `try/catch` and call `next(err)` in the catch. Never use `throw` in route handlers without a catch.
**Warning signs:** Server crashes with "UnhandledPromiseRejection" instead of returning a JSON error.

### Pitfall 4: Zod passthrough + Prisma create accepting unvalidated fields
**What goes wrong:** `.passthrough()` lets unknown fields through to `parsed.data`. If malicious input includes a field like `id` or `createdAt`, Prisma may reject it or silently override it.
**Why it happens:** `.passthrough()` is too permissive for creation.
**How to avoid:** For POST, pass `parsed.data` to `prisma.outreach.create({ data: parsed.data })` — Prisma will reject fields that aren't in the schema. This is fine. The "pass-through" intent is that Zod validation doesn't error on extra fields; Prisma acts as the second line of defence. The current code already does `create({ data: req.body })` so behaviour is unchanged.

### Pitfall 5: SMTP probedEmails Map is Process-Level State
**What goes wrong:** The `probedEmails` Map in `emailFinder.js` is module-level state. Parallelising probes across multiple concurrent requests could cause a race condition where two concurrent requests both miss the cache and launch duplicate probes for the same email.
**Why it happens:** Cache is checked and set in separate async operations — not atomic.
**How to avoid:** For this phase, the impact is minor (duplicate probe, not incorrect result). The existing code already had this theoretical race. `Promise.allSettled()` within a single request is safe. Cross-request deduplication is out of scope.

---

## Code Examples

### Global Error Handler Registration (correct position)
```javascript
// server/index.js — AFTER all route mounts
app.use('/api/outreach', outreachRoutes);
app.use('/', trackingRoutes);
app.use('/api', emailRoutes);
app.use('/api/insights', analyticsRoutes);

// Global error handler — MUST be last, MUST have 4 args
app.use((err, req, res, next) => {
  if (err.code === 'P2002') return res.status(409).json({ error: 'Conflict', message: 'Record already exists', statusCode: 409 });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Not Found', message: 'Record not found', statusCode: 404 });
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({ error: err.name || 'Internal Server Error', message: err.message || 'Unknown error', statusCode });
});
```

### Route Handler — Converting try/catch to next(err)
```javascript
// Before (current pattern):
app.patch('/api/outreach/:threadId', async (req, res) => {
  try {
    const record = await prisma.outreach.update({ where: { threadId: req.params.threadId }, data: req.body });
    res.json(record);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    res.status(500).json({ error: e.message });
  }
});

// After (global error handler pattern):
router.patch('/:threadId', async (req, res, next) => {
  const parsed = PatchOutreachSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation Error', message: parsed.error.issues.map(i => i.message).join('; '), statusCode: 400 });
  }
  try {
    const record = await prisma.outreach.update({ where: { threadId: req.params.threadId }, data: parsed.data });
    res.json(record);
  } catch (e) {
    next(e);  // P2025 handled in global error handler
  }
});
```

### Prisma Singleton
```javascript
// server/lib/prisma.js
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All routes in index.js | `express.Router()` modules | Express 4.0 (2014) | Standard since Express 4; no library change needed |
| Manual validation if/else | Zod `.safeParse()` | Zod installed per package.json | Already available — just apply to route entry points |
| Per-handler error responses | Global 4-arg error handler | Express 4.0 | Reduces duplication; requires `next(err)` pattern |
| Sequential async loops | `Promise.allSettled()` | ES2020 / Node 12.9+ | Built-in; no polyfill needed for Node 18+ |

**Note on Express 5:** Express 5 is now stable (released October 2024) and adds automatic async error forwarding, making `try/catch/next(err)` less verbose. However, `package.json` pins `"express": "^4"` — do NOT upgrade to Express 5 in this phase. The manual `try/catch/next(err)` pattern is correct for Express 4.

---

## Open Questions

1. **Zod schema field name: `company` vs `companyName`**
   - What we know: Prisma schema has `company String`; CONTEXT.md mentions "companyName" as required field to validate
   - What's unclear: Whether the extension sends `company` or `companyName` in the POST body
   - Recommendation: The current `prisma.outreach.create({ data: req.body })` works today, meaning the extension sends field names matching Prisma (`company`, not `companyName`). Use `company` in the Zod schema. Confidence: HIGH based on code evidence.

2. **`total` exposure in useOutreach hook**
   - What we know: PERF-01 requires `total` in the response; the hook currently ignores the response beyond array content
   - What's unclear: Whether the web UI needs to display total count anywhere currently
   - Recommendation: Destructure `{ data }` only in the hook for now; hook return API is unchanged. `total` is available if UI needs it later. The requirement is server-side — the response MUST include `total`, regardless of whether the hook uses it.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed — Wave 0 must set up |
| Config file | None — Wave 0 creates it |
| Quick run command | `cd /path/to/reach/server && node --test tests/` (Node 18+ built-in test runner) |
| Full suite command | `cd /path/to/reach/server && node --test tests/` |

**Note:** No test framework is installed in `server/package.json`. No test files exist in the project (confirmed by glob scan). Phase 5 owns TEST-02 (integration tests for server routes). Phase 3 is pure refactoring — the validation strategy is manual smoke testing rather than automated tests, unless Wave 0 bootstraps a framework.

Given TEST-02 is a Phase 5 concern, Phase 3 validation is:
- Manual: Start server, issue curl/HTTP requests to each endpoint, verify response shapes
- Automated: None required for this phase (Wave 0 would be premature scope expansion)

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERV-01 | Routes mount correctly, `index.js` has no business logic | manual-only | N/A — structural check | N/A |
| SERV-02 | POST/PATCH with missing required fields returns 400 `{ error, message, statusCode }` | manual-only | `curl -X POST http://localhost:3001/api/outreach -H "Content-Type: application/json" -d '{}'` | N/A |
| SERV-03 | Route errors propagate to consistent error shape | manual-only | N/A | N/A |
| PERF-01 | `GET /api/outreach?limit=20&offset=40` returns `{ data: [], total: N }` | manual-only | `curl "http://localhost:3001/api/outreach?limit=20&offset=40"` | N/A |
| PERF-02 | SMTP probes run in parallel (measurably faster for multi-candidate finds) | manual-only | N/A — timing-based | N/A |

### Sampling Rate
- **Per task commit:** Manual curl smoke test of changed endpoints
- **Per wave merge:** Full endpoint smoke test (all 5 routes)
- **Phase gate:** All curl checks green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/lib/prisma.js` — shared Prisma singleton (infrastructure, not test)
- [ ] `server/routes/` directory — must exist before route files are created

*(No automated test infrastructure required for Phase 3 — TEST-02 is Phase 5's responsibility.)*

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `server/index.js` — all current routes, middleware, error patterns
- Direct code inspection: `server/emailFinder.js` — sequential probe loop at lines 348-358
- Direct code inspection: `server/prisma/schema.prisma` — Outreach model field names
- Direct code inspection: `web/src/hooks/useOutreach.js` — current array assumption at line 24
- Direct code inspection: `web/src/lib/api.js` — `fetchOutreach()` signature
- Direct code inspection: `server/package.json` — Express ^4, Zod ^3 confirmed installed

### Secondary (MEDIUM confidence)
- Express 4 documentation pattern: 4-argument error handler must be registered last; async handlers require explicit try/catch/next(err) in Express 4 (not Express 5)
- Zod v3 documentation: `.passthrough()` for unknown fields, `.partial()` for PATCH schemas
- Prisma documentation: `findMany` with `skip`/`take` for pagination; `count()` for totals

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries directly confirmed in package.json and existing code
- Architecture: HIGH — Express Router, Prisma singleton, Zod patterns are textbook; code inspection confirms current structure to migrate from
- Pitfalls: HIGH — tracking route mounting conflict and async error handling in Express 4 are verified Express 4 behaviours

**Research date:** 2026-03-15
**Valid until:** 2026-06-15 (Express 4 and Zod v3 are stable; no significant churn expected)
