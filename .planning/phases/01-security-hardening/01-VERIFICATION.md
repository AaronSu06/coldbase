---
phase: 01-security-hardening
verified: 2026-03-16T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 9/9
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 01: Security Hardening Verification Report

**Phase Goal:** The codebase contains no hardcoded secrets or endpoints; all sensitive values read from environment; server enforces CORS and rate limits; REACH_SECRET validated consistently
**Verified:** 2026-03-16
**Status:** PASSED
**Re-verification:** Yes — re-verification after phases 03 and 04 modified key files (`server/index.js`, `extension/background.js`)

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                               | Status     | Evidence                                                                                                                                                                                              |
|----|-----------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | No hardcoded REACH_SECRET appears anywhere in extension or web source files                         | VERIFIED   | `grep -rn "f824a42..."` across extension/ and web/ returns zero matches                                                                                                                               |
| 2  | extension/config.js exports SERVER_URL, DASH_URL, REACH_SECRET; background.js imports SERVER_URL and DASH_URL; api-client.js imports SERVER_URL and REACH_SECRET | VERIFIED | background.js line 2: `import { SERVER_URL, DASH_URL } from './config.js'`; api-client.js line 5: `import { SERVER_URL, REACH_SECRET } from './config.js'` — REACH_SECRET moved to api-client.js after phase 04 background.js split |
| 3  | panel.js, sidebar.js, and popup.js retrieve server config via chrome.runtime.sendMessage GET_RUNTIME_CONFIG | VERIFIED | panel.js line 22, sidebar.js line 17, popup.js line 21 all send `{ type: 'GET_RUNTIME_CONFIG' }`; background.js line 82 handles it returning `{ serverApiBase: SERVER_URL, dashboardUrl: DASH_URL }` |
| 4  | web dashboard reads API base URL from import.meta.env.VITE_API_URL                                  | VERIFIED   | `web/src/lib/api.js` line 1: `const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'`                                                                                              |
| 5  | A generate-secret npm script exists at root and prints a fresh 64-char hex secret                   | VERIFIED   | Root `package.json` has `generate-secret` script; running it produced `2d646a563862f581d685f2dc9b0703243399046c7fd8da9e288ec3c1b898463c` — 64 characters confirmed                                   |
| 6  | extension/config.js is git-ignored; extension/config.example.js with CHANGE_ME values is committed  | VERIFIED   | `.gitignore` line 4 ignores `extension/config.js` (confirmed via `git check-ignore -v`); `git ls-files extension/config.example.js` confirms it is tracked; both files export `REACH_SECRET = 'CHANGE_ME'` |
| 7  | Server rejects requests from unlisted origins with CORS 403; ALLOWED_ORIGINS env var controls the allowlist | VERIFIED | `server/index.js` lines 13–27: origin-allowlist CORS using `process.env.ALLOWED_ORIGINS`; unlisted origins trigger `callback(new Error('CORS: origin not allowed'))`; chrome-extension:// always permitted |
| 8  | Repeated calls to /api/find-email, /api/draft-email, /api/suggest-domains return 429 after 10 requests per 15 minutes | VERIFIED | `expensiveRateLimit` (`max: 10`, `windowMs: 15 * 60 * 1000`) applied as inline middleware on all three routes at lines 59–61 of server/index.js |
| 9  | Any /api/* endpoint called without a valid x-reach-secret header returns 401; GET /track/:trackingId remains public | VERIFIED | `app.use('/api', requireSecret)` at line 43; `requireSecret` returns 500 when REACH_SECRET env absent, 401 on header mismatch; tracking routes mounted at `app.use('/', ...)` so `GET /track/:trackingId` is not covered by requireSecret |

**Score:** 9/9 truths verified

### Post-refactor Notes

Phase 03 refactored `server/index.js` from a monolith to a mounting orchestrator (commit `f2b6bf9`). All security middleware (CORS allowlist, `requireSecret`, `expensiveRateLimit`) survived the refactor intact and appear at the correct positions in the file.

Phase 04 split `extension/background.js` into modules (commit `2804772`). The REACH_SECRET import moved from `background.js` to `extension/api-client.js`, which is the correct location since api-client.js is where all server fetches originate. The secret is still read from `extension/config.js` (not hardcoded), so Truth 2 still holds.

No hardcoded localhost URLs remain in extension source files other than the intentional fallback defaults in `panel.js` / `sidebar.js` DEFAULT_CONFIG blocks (acceptable per Plan 01-01 design).

---

### Required Artifacts

| Artifact                    | Expected                                                   | Status   | Details                                                                                                           |
|-----------------------------|------------------------------------------------------------|----------|-------------------------------------------------------------------------------------------------------------------|
| `extension/config.js`       | Runtime secrets for extension (git-ignored)                | VERIFIED | Exists; exports `SERVER_URL`, `DASH_URL`, `REACH_SECRET`, `DEBUG`; confirmed git-ignored via `git check-ignore`  |
| `extension/config.example.js` | Setup template committed to git                          | VERIFIED | Exists; all sensitive exports set to `'CHANGE_ME'`; confirmed tracked via `git ls-files`                         |
| `web/.env.example`          | Vite env template                                          | VERIFIED | Exists; line 1: `VITE_API_URL=http://localhost:3001/api`                                                          |
| `package.json` (root)       | Root package.json with generate-secret script              | VERIFIED | Exists; `generate-secret` script present; produces 64-char hex string                                            |
| `server/index.js`           | Express server with CORS allowlist, requireSecret, rate limiting | VERIFIED | Contains `ALLOWED_ORIGINS` CORS (lines 13–27), `requireSecret` middleware (lines 32–41), `app.use('/api', requireSecret)` (line 43), `expensiveRateLimit` on three routes (lines 59–61) |
| `server/.env.example`       | Complete env template with ALLOWED_ORIGINS and REACH_SECRET | VERIFIED | Contains `REACH_SECRET=`, `GEMINI_KEY=`, `ALLOWED_ORIGINS=http://localhost:5173` with comments                   |
| `server/package.json`       | express-rate-limit dependency                              | VERIFIED | `"express-rate-limit": "^8.3.1"` in dependencies                                                                 |

---

### Key Link Verification

| From                              | To                                               | Via                                                        | Status   | Details                                                                                                                   |
|-----------------------------------|--------------------------------------------------|------------------------------------------------------------|----------|---------------------------------------------------------------------------------------------------------------------------|
| `extension/background.js`        | `extension/config.js`                            | ES module import                                           | WIRED    | Line 2: `import { SERVER_URL, DASH_URL } from './config.js'`                                                             |
| `extension/api-client.js`        | `extension/config.js`                            | ES module import                                           | WIRED    | Line 5: `import { SERVER_URL, REACH_SECRET } from './config.js'`; used in serverFetch headers at line 68                 |
| `extension/panel.js`             | background.js GET_RUNTIME_CONFIG handler         | `chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' })` | WIRED | panel.js line 22, sidebar.js line 17, popup.js line 21 all send GET_RUNTIME_CONFIG; background.js returns SERVER_URL/DASH_URL |
| `web/src/lib/api.js`             | `import.meta.env.VITE_API_URL`                  | Vite env var                                               | WIRED    | Line 1: `import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'`                                                    |
| `server/index.js` CORS config    | `process.env.ALLOWED_ORIGINS`                   | `cors({ origin })` option                                  | WIRED    | Lines 13–15: reads `process.env.ALLOWED_ORIGINS`, splits on comma; applied via `app.use(cors({...}))`                    |
| `server/index.js` requireSecret  | `app.use('/api', requireSecret)`                | Express middleware chain                                   | WIRED    | Line 43: `app.use('/api', requireSecret)` before all route definitions                                                   |
| `server/index.js` rate limiter   | `/api/find-email`, `/api/draft-email`, `/api/suggest-domains` | express-rate-limit per-route               | WIRED    | Lines 59–61: `expensiveRateLimit` as inline middleware on each app.post() call                                            |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                      | Status    | Evidence                                                                                                         |
|-------------|-------------|--------------------------------------------------------------------------------------------------|-----------|------------------------------------------------------------------------------------------------------------------|
| SEC-01      | Plan 01-01  | Hardcoded localhost endpoints and REACH_SECRET removed from extension source                     | SATISFIED | No hardcoded secret in extension/ or web/; `config.js` pattern in place; REACH_SECRET in api-client.js via import |
| SEC-02      | Plan 01-02  | CORS configured with explicit allowed origins via ALLOWED_ORIGINS env var; wildcard disabled     | SATISFIED | `server/index.js` origin-allowlist CORS using `process.env.ALLOWED_ORIGINS`; unlisted origins rejected          |
| SEC-03      | Plan 01-02  | Rate limiting applied to expensive endpoints                                                     | SATISFIED | `expensiveRateLimit` (10 req/15 min) on `/api/find-email`, `/api/draft-email`, `/api/suggest-domains`           |
| SEC-04      | Plan 01-02  | REACH_SECRET validated consistently on every protected server endpoint; missing/invalid returns 401 | SATISFIED | `requireSecret` returns 500 when env absent, 401 on header mismatch; applied globally via `app.use('/api', requireSecret)` |

All four requirements marked `[x]` in REQUIREMENTS.md. No orphaned requirements found for Phase 1.

---

### Anti-Patterns Found

No TODO, FIXME, HACK, PLACEHOLDER, or XXX comments found in any phase 01 modified files. No empty implementations or stub returns detected.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| —    | —    | —       | —        | No anti-patterns found |

---

### Human Verification Required

No automated checks are uncertain. The following items would benefit from a live integration test but are not blockers for phase goal verification:

1. **CORS rejection of unlisted origin**
   **Test:** Start the server with a known REACH_SECRET; send `curl -X POST http://localhost:3001/api/outreach -H "Origin: https://evil.com" -H "x-reach-secret: <secret>"` and inspect response headers.
   **Expected:** No `Access-Control-Allow-Origin` header; request rejected.
   **Why human:** Cannot start the server in this verification context.

2. **Rate limit 429 fires after 10 requests**
   **Test:** Send 11 POST requests to `/api/find-email` with valid headers within 15 minutes.
   **Expected:** First 10 return 400 or 200; 11th returns 429 with `{ "error": "Too many requests" }`.
   **Why human:** Requires a running server instance.

3. **Secret rotation end-to-end**
   **Test:** Run `npm run generate-secret`, paste output into `extension/config.js` and `server/.env`, restart extension and server, confirm requests succeed.
   **Expected:** Extension communicates successfully with server using the new secret.
   **Why human:** Multi-step manual process spanning extension reload and server restart.

---

### Gaps Summary

No gaps found. All must-haves are verified at all three levels (exists, substantive, wired).

Post-refactor regression check passed: phases 03 and 04 modified `server/index.js` and `extension/background.js` respectively, but did not break any security properties. Security middleware order in server/index.js is intact. REACH_SECRET is correctly sourced from `extension/config.js` via `api-client.js` (the module that issues all server requests) rather than `background.js` (which no longer makes server calls directly).

**Phase goal achieved:** The codebase contains no hardcoded secrets or endpoints. All sensitive values are read from environment (extension/config.js for the extension, Vite env vars for the web dashboard, process.env for the server). The server enforces origin-allowlist CORS, rejects all `/api/*` requests without a valid `x-reach-secret` header, and rate-limits the three AI/DNS-intensive endpoints at 10 requests per 15 minutes. A rotation path for the REACH_SECRET is in place via `npm run generate-secret`.

---

**Commits verified (phase 01 original commits, all present in git history):**
- `5f305fb` — feat(01-01): add extension config template and generate-secret script
- `44e09a8` — feat(01-01): remove hardcoded secrets; wire config.js and Vite env vars
- `d2b323c` — chore(01-02): install express-rate-limit
- `820f879` — feat(01-02): harden Express with CORS allowlist, requireSecret, rate limiting

---

_Verified: 2026-03-16_
_Verifier: Claude (gsd-verifier)_
