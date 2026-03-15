# Phase 3: Server Restructure - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Decompose `server/index.js` into 4 domain route files; add Zod validation to all POST/PATCH endpoints; wire a global error handler with consistent error shape; add limit/offset pagination to GET /api/outreach (update web client in same phase); parallelize SMTP probes in emailFinder.js. No UI changes, no new endpoints, no URL changes.

</domain>

<decisions>
## Implementation Decisions

### Pagination response shape
- Change GET /api/outreach response from plain array to `{ data: [], total: N }`
- Default limit: 100 records when `limit` param is omitted
- Update `web/src/hooks/useOutreach.js` in this phase to destructure `{ data, total }` correctly — not deferred to Phase 5

### Zod schema placement
- Schemas defined inline in each route file, directly above the handler that uses them
- No separate `server/schemas/` directory
- POST /api/outreach: validate required fields only (threadId, companyName, contactEmail) — pass-through unknown fields; don't break if extension sends extra keys
- PATCH /api/outreach/:threadId: use `.partial()` version of the POST schema — validates types of present fields, ignores absent ones

### Shared helper placement
- `buildDraftPrompt()` moves into `routes/email.js` (co-located with the route that uses it)
- Prisma client extracted to `server/lib/prisma.js` — exports the singleton; all route files import from there
- Middleware (requireSecret, CORS, rate limiter) stays in `server/index.js` — index.js is the app-level orchestrator; route files stay clean

### Route decomposition
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/index.js` requireSecret middleware (lines 34-43): already well-formed — extract to index.js app.use block, stays there
- `server/index.js` expensiveRateLimit (lines 47-54): applied as inline middleware on 3 routes — stays in index.js or passed to route files
- `server/emailFinder.js`: `findEmails()` already imported in index.js — will be imported in routes/email.js instead
- `buildDraftPrompt()` (lines 218-250): 33-line pure function — moves to routes/email.js

### Established Patterns
- Prisma error codes used: `P2002` (unique violation → 409), `P2025` (record not found → 404)
- Error response shape in use today: `{ error: string }` — Phase 3 standardizes to `{ error, message, statusCode }`
- Zod already a `server/` dependency (used in emailFinder.js)
- All routes use `async (req, res)` pattern with try/catch — convert catches to `next(err)`

### Integration Points
- `web/src/hooks/useOutreach.js` calls GET /api/outreach and maps result directly — needs update to `.data` array access and store `.total`
- `server/index.js` route mounting: `app.use('/api/outreach', outreachRoutes)` etc.
- `expensiveRateLimit` middleware applied to find-email, suggest-domains, draft-email — needs to be accessible in routes/email.js (pass from index.js or import from shared location)

</code_context>

<specifics>
## Specific Ideas

- Route files should use `express.Router()` and be mounted in index.js — standard Express pattern
- `server/lib/prisma.js` should be a single-line export: `export const prisma = new PrismaClient()`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-server-restructure*
*Context gathered: 2026-03-15*
