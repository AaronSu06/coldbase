# Phase 9: Observability - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add request/response logging middleware and a public health endpoint to the Express server. Every HTTP request produces a structured JSON log line. GET /health is publicly accessible (no auth required) and reports DB liveness, uptime, version, and DB latency.

</domain>

<decisions>
## Implementation Decisions

### Logging library
- `console.log(JSON.stringify({...}))` — zero new dependencies
- No external logging library (pino, morgan, etc.)
- Synchronous stdout write — acceptable at Reach's current scale

### Logging middleware placement
- Mount **before everything** (before CORS, before requireSecret) so ALL requests are logged — including preflight, 401s, and /health polls
- Use `res.on('finish')` pattern: record start time on request arrival, emit log line after response is sent (captures actual status code and duration)

### Log format
- Fields: `method`, `path`, `status`, `durationMs`, `query` (query parameters)
- `x-reach-secret` header value is redacted (not logged) — per OBS-01
- No IP address logged (PII, no debugging value for single-user app)
- No error message in request log — error handler (and later Sentry) handles error detail separately
- Same format for all status codes (no special treatment for 4xx/5xx — status field distinguishes them)
- /health requests ARE logged like any other request

### Health endpoint
- Route: `GET /health` (no `/api` prefix — naturally bypasses `app.use('/api', requireSecret)`)
- Handler: inline in `app.js`, mounted before `requireSecret`
- DB liveness check: `prisma.$queryRaw\`SELECT 1\`` — minimal, uses existing Prisma client
- `version` field: read from `server/package.json` once at app startup, stored in memory
- `uptime`: `process.uptime()` in seconds
- `dbLatencyMs`: measured duration of the `SELECT 1` query
- **Success response** (200):
  ```json
  { "status": "ok", "uptime": 123.4, "version": "1.1.0", "dbLatencyMs": 5 }
  ```
- **Failure response** (503) when DB is unreachable:
  ```json
  { "status": "error", "uptime": 123.4, "version": "1.1.0", "dbLatencyMs": null, "error": "..." }
  ```

### File organization
- New directory: `server/middleware/`
- Logging middleware: `server/middleware/requestLogger.js` (exported as default, imported in app.js)
- Health route: inline in `app.js` (single short handler, not worth a separate file)
- Establishes `server/middleware/` pattern for Phase 10 (Sentry error handler middleware)

### Claude's Discretion
- Exact log timestamp field (include or omit — `new Date().toISOString()` is obvious if included)
- Whether to include a `type` or `event` field to distinguish request logs from other log types
- Error message format in 503 response (raw err.message vs sanitized string)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/lib/prisma.js`: Prisma client — import and use `prisma.$queryRaw` for DB health check
- `server/app.js`: middleware mounting order — request logger goes at the very top, before `cors()`

### Established Patterns
- `dotenv/config` imported in `app.js` — env vars available at module load time
- `app.use('/api', requireSecret)` guards all `/api/*` routes — `/health` at root bypasses it naturally
- Global error handler is last `app.use()` — request logger does not interfere

### Integration Points
- `app.js`: import `requestLogger` from `./middleware/requestLogger.js`, mount with `app.use(requestLogger)`
- `app.js`: add `GET /health` route between `app.use(express.json())` and `app.use('/api', requireSecret)`
- `server/package.json`: read `version` field at startup for health response

</code_context>

<specifics>
## Specific Ideas

- No specific references — standard Express middleware patterns apply
- User confirmed: logging all requests (including load balancer polls to /health) is intentional

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-observability*
*Context gathered: 2026-03-17*
