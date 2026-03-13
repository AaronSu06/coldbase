# Phase 1: Security Hardening - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all hardcoded secrets and endpoints from extension and server source code. Lock down CORS, add rate limiting on expensive endpoints, and enforce consistent REACH_SECRET validation across all API routes. No UI changes. No refactoring. Requirements: SEC-01, SEC-02, SEC-03, SEC-04.

</domain>

<decisions>
## Implementation Decisions

### Extension config mechanism
- Use a build-time config file: `extension/config.js` (git-ignored, contains real values)
- Committed counterpart: `extension/config.example.js` with `CHANGE_ME` placeholders
- `config.js` exports `SERVER_URL` and `REACH_SECRET` constants; `background.js` imports them
- `panel.js`, `sidebar.js`, `popup.js` are plain scripts that can't `import` ES modules — they get config by messaging background.js via `chrome.runtime.sendMessage({ type: 'GET_CONFIG' })`. Background already has a GET_CONFIG handler at line 438.
- The web dashboard uses its own `.env` / `.env.example` via Vite (standard practice) — separate concern from the extension config

### REACH_SECRET rotation
- Current secret (`f824a42ea02d149b28f96141068bc71538e3321f18b2c4cc`) is compromised in git history — rotate, don't scrub history
- Add an npm script (`generate-secret`) that runs `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` to produce a new 64-char hex secret
- User runs the script once, pastes output into `extension/config.js` and `server/.env`
- Old secret in git history is invalidated because server stops accepting it

### CORS configuration
- Replace `cors()` (wildcard) with explicit allowed origins via `ALLOWED_ORIGINS` environment variable in `server/.env`
- Default allowed origins: `chrome-extension://*` and `http://localhost:5173`
- Parse as comma-separated list: `process.env.ALLOWED_ORIGINS?.split(',')`

### Rate limiting
- Install `express-rate-limit`
- Single shared limiter: **10 requests per 15 minutes** per IP
- Applied to all three endpoints: `/api/find-email`, `/api/draft-email`, `/api/suggest-domains`
- Same limiter for all three (same cost profile)
- Response on limit hit: `{ error: 'Too many requests' }`

### Protected endpoint scope
- All `/api/*` routes require `x-reach-secret` header matching `process.env.REACH_SECRET` — return 401 if missing or invalid
- Implemented as a single `requireSecret` middleware applied via `app.use('/api', requireSecret)`
- Exception: `GET /track/:trackingId` stays completely open — email clients load the pixel and cannot send custom headers; intentionally public by design

### Claude's Discretion
- Exact `.env.example` variable names and comments
- Middleware ordering within index.js (cors → requireSecret → rateLimiter → routes)
- Error response format for 401 (consistent with existing `{ error, message }` shape)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `background.js` GET_CONFIG handler (line 438): already returns `RUNTIME_CONFIG` — just needs to import from `config.js` instead of using hardcoded object
- `RUNTIME_CONFIG` object (lines 4-7): already structures `serverApiBase` and `dashboardUrl` — direct target for replacement
- `cors` package: already installed and imported in `server/index.js` line 13

### Established Patterns
- Secret header: extension already sends `x-reach-secret` header on API calls (lines 505, 523, 548) — no change to call sites needed once config.js is wired up
- Server validation pattern: `server/index.js` already does basic secret checking on some routes — `requireSecret` middleware formalizes this into one place
- `.env` for server: `server/` likely already has env setup via dotenv — check if dotenv is loaded in index.js

### Integration Points
- `extension/background.js` lines 4-9: `RUNTIME_CONFIG` and `REACH_SECRET` constants — replace with `import { SERVER_URL, REACH_SECRET } from './config.js'`
- `extension/panel.js` lines 11-12, `extension/popup.js` line 1, `extension/sidebar.js` lines 5-6: hardcoded localhost — update to use GET_CONFIG message pattern
- `server/index.js` line 13: `app.use(cors())` — replace with configured cors
- `web/src/lib/api.js` line 1: hardcoded `http://localhost:3001` — move to `VITE_API_URL` env var

</code_context>

<specifics>
## Specific Ideas

- The `generate-secret` npm script should live at the root `package.json` level (or in `server/package.json`) so it's easy to find
- `config.example.js` should include a comment pointing to the generate-secret script so setup is self-documenting
- `requireSecret` middleware should be clearly named and defined before routes in `index.js` for readability

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-security-hardening*
*Context gathered: 2026-03-12*
