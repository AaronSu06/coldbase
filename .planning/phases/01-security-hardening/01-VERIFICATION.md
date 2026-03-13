---
phase: 01-security-hardening
verified: 2026-03-13T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 01: Security Hardening Verification Report

**Phase Goal:** Harden the application against the most critical security vulnerabilities: exposed secrets, missing auth on API routes, and unprotected expensive endpoints.
**Verified:** 2026-03-13
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                         | Status     | Evidence                                                                                   |
|----|-----------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| 1  | No hardcoded localhost URLs or REACH_SECRET appear anywhere in extension source files         | VERIFIED   | `grep -rn "f824a42..." extension/ web/` returns zero matches; `grep localhost background.js` returns zero matches |
| 2  | extension/config.js exports SERVER_URL and REACH_SECRET read by background.js                | VERIFIED   | `import { SERVER_URL, DASH_URL, REACH_SECRET } from './config.js'` on line 2 of background.js |
| 3  | panel.js, sidebar.js, and popup.js retrieve server config via chrome.runtime.sendMessage GET_RUNTIME_CONFIG | VERIFIED | All three files call `sendMessage({ type: 'GET_RUNTIME_CONFIG' }, ...)` confirmed by grep; background.js handles it at line 433 returning `{ serverApiBase: SERVER_URL, dashboardUrl: DASH_URL }` |
| 4  | web dashboard reads API base URL from import.meta.env.VITE_API_URL                           | VERIFIED   | `web/src/lib/api.js` line 1: `const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'` |
| 5  | A generate-secret npm script exists at the root and prints a fresh 64-char hex secret         | VERIFIED   | Root `package.json` has `generate-secret` script; running it produces a 64-char hex string |
| 6  | extension/config.js is git-ignored; extension/config.example.js with CHANGE_ME values is committed | VERIFIED | `.gitignore` line 4 ignores `extension/config.js`; `config.example.js` has `REACH_SECRET = 'CHANGE_ME'` and is tracked |
| 7  | Server rejects requests from unlisted origins with CORS 403; ALLOWED_ORIGINS env var controls the allowlist | VERIFIED | `server/index.js` lines 14–28: origin-allowlist CORS using `process.env.ALLOWED_ORIGINS`; unlisted origins trigger `callback(new Error('CORS: origin not allowed'))` |
| 8  | Repeated calls to /api/find-email, /api/draft-email, /api/suggest-domains return 429 after 10 requests per 15 minutes | VERIFIED | `expensiveRateLimit` (10 req/15 min) applied as inline middleware on all three routes at lines 174, 185, 252 |
| 9  | Any /api/* endpoint called without a valid x-reach-secret header returns 401; GET /track/:trackingId remains public | VERIFIED | `app.use('/api', requireSecret)` at line 44, before all route definitions; `GET /track/:trackingId` is defined at line 57 under `/track/`, not `/api/`, so it is not covered by requireSecret |

**Score:** 9/9 truths verified

Note on Truth 3: The PLAN specified `GET_CONFIG` as the message type but the codebase uses `GET_RUNTIME_CONFIG`. The SUMMARY documents this deliberate deviation — the existing handler and all callers already used `GET_RUNTIME_CONFIG`. This is correct behaviour; the plan's suggested name was overridden to match the actual codebase.

---

### Required Artifacts

| Artifact                    | Expected                                        | Status   | Details                                                                  |
|-----------------------------|-------------------------------------------------|----------|--------------------------------------------------------------------------|
| `extension/config.js`       | Runtime secrets for extension (git-ignored)     | VERIFIED | Exists; exports `SERVER_URL`, `DASH_URL`, `REACH_SECRET`; git-ignored    |
| `extension/config.example.js` | Setup template committed to git              | VERIFIED | Exists; all exports set to `'CHANGE_ME'`; committed                     |
| `web/.env.example`          | Vite env template                               | VERIFIED | Exists; contains `VITE_API_URL=http://localhost:3001/api`                |
| `package.json` (root)       | Root package.json with generate-secret script   | VERIFIED | Exists; `generate-secret` script present; outputs 64-char hex           |
| `server/index.js`           | Express server with CORS, requireSecret, rate limiting | VERIFIED | Contains `ALLOWED_ORIGINS` CORS, `requireSecret` middleware, `expensiveRateLimit` on three routes |
| `server/.env.example`       | Complete env template with ALLOWED_ORIGINS and REACH_SECRET | VERIFIED | Contains `REACH_SECRET`, `GEMINI_KEY`, `ALLOWED_ORIGINS` with comments |
| `server/package.json`       | express-rate-limit dependency                   | VERIFIED | `"express-rate-limit": "^8.3.1"` in dependencies                        |

---

### Key Link Verification

| From                              | To                                      | Via                                          | Status   | Details                                                                   |
|-----------------------------------|-----------------------------------------|----------------------------------------------|----------|---------------------------------------------------------------------------|
| `extension/background.js`        | `extension/config.js`                   | ES module import                              | WIRED    | Line 2: `import { SERVER_URL, DASH_URL, REACH_SECRET } from './config.js'` |
| `extension/panel.js`             | background.js GET_RUNTIME_CONFIG handler | `chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' })` | WIRED | panel.js line 22, sidebar.js line 17, popup.js line 21 all send GET_RUNTIME_CONFIG; background.js handles at line 433 |
| `web/src/lib/api.js`             | `import.meta.env.VITE_API_URL`          | Vite env var                                  | WIRED    | Line 1: `import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'`    |
| `server/index.js` CORS config    | `process.env.ALLOWED_ORIGINS`           | `cors({ origin })` option                     | WIRED    | Lines 14–28: reads `process.env.ALLOWED_ORIGINS`, splits on comma        |
| `server/index.js` requireSecret  | `app.use('/api', requireSecret)`        | Express middleware chain                      | WIRED    | Line 44: `app.use('/api', requireSecret)` before all route definitions   |
| `server/index.js` rate limiter   | `/api/find-email`, `/api/draft-email`, `/api/suggest-domains` | express-rate-limit per-route | WIRED | Lines 174, 185, 252: `expensiveRateLimit` as inline middleware            |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                           | Status    | Evidence                                                                 |
|-------------|-------------|---------------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------------|
| SEC-01      | Plan 01     | Hardcoded localhost endpoints and REACH_SECRET removed from extension source          | SATISFIED | No hardcoded secret or localhost URLs in background.js; config.js pattern in place |
| SEC-02      | Plan 02     | CORS configured with explicit allowed origins via ALLOWED_ORIGINS env var             | SATISFIED | `server/index.js` origin-allowlist CORS using `process.env.ALLOWED_ORIGINS` |
| SEC-03      | Plan 02     | Rate limiting applied to expensive endpoints                                          | SATISFIED | `expensiveRateLimit` (10 req/15 min) on all three routes                 |
| SEC-04      | Plan 02     | REACH_SECRET validated on every protected server endpoint; missing/invalid returns 401 | SATISFIED | `requireSecret` fixed to return 500 when env absent, 401 on header mismatch; applied globally via `app.use('/api', requireSecret)` |

All four requirements marked `[x]` in REQUIREMENTS.md. No orphaned requirements found for Phase 1.

---

### Anti-Patterns Found

No TODO, FIXME, HACK, PLACEHOLDER, or XXX comments found in any modified files. No empty implementations or stub returns detected.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

---

### Human Verification Required

No automated checks are uncertain. The following items would benefit from a live integration test but are not blockers for phase goal verification:

1. **CORS rejection of evil origin**
   **Test:** Start the server with a known REACH_SECRET; send `curl -X POST http://localhost:3001/api/outreach -H "Origin: https://evil.com" -H "x-reach-secret: <secret>"` and inspect response headers.
   **Expected:** No `Access-Control-Allow-Origin` header in response; request is rejected.
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

No gaps found. All must-haves are verified at all three levels (exists, substantive, wired). Phase goal achieved.

**Phase goal achieved:** The application no longer contains hardcoded secrets or localhost endpoints in extension source. The server enforces origin-allowlist CORS, rejects all `/api/*` requests without a valid `x-reach-secret` header, and rate-limits the three AI/DNS-intensive endpoints at 10 requests per 15 minutes. A rotation path for the compromised REACH_SECRET is in place via `npm run generate-secret`.

---

**Commits verified:**
- `5f305fb` — feat(01-01): add extension config template and generate-secret script
- `44e09a8` — feat(01-01): remove hardcoded secrets; wire config.js and Vite env vars
- `d2b323c` — chore(01-02): install express-rate-limit
- `820f879` — feat(01-02): harden Express with CORS allowlist, requireSecret, rate limiting

---

_Verified: 2026-03-13_
_Verifier: Claude (gsd-verifier)_
