# Phase 6: Integration Fixes - Research

**Researched:** 2026-03-17
**Domain:** Cross-component wiring — web API auth, extension fetch auth, response shape destructuring
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Web API auth pattern
- Create a private `apiFetch(url, opts)` helper inside `web/src/lib/api.js` that injects `import.meta.env.VITE_REACH_SECRET` as `x-reach-secret` header automatically
- All 4 existing functions (`fetchOutreach`, `patchOutreach`, `deleteOutreach`, `fetchBestTime`) call this helper instead of bare `fetch`
- All 4 functions throw on `!res.ok` — consistent error behavior (aligning with what `patchOutreach` already does)

#### Extension fetchOutreach fix
- Refactor `fetchOutreach()` in `api-client.js` to use `serverFetch('/outreach')` instead of bare `fetch` — adds secret header and aligns with existing server call patterns (`SUGGEST_DOMAINS`, `FIND_CONTACT`, etc.)
- Keep `fetchOutreach()` returning the raw Response (not parsed JSON) — consumers in `background.js` call `.json()` themselves; this contract stays
- Fix consumers: destructure `.data` from parsed response in `background.js` GET_STATS and GET_RECENT handlers, and in `reply-checker.js` `checkReplies()`

#### Error visibility
- Web dashboard: when API calls fail, surface a visible error state to the user (not just an empty table or silent failure)
- Extension sidebar: when GET_STATS or GET_RECENT returns `{ok: false}`, surface a visible error indicator in the sidebar — don't just show dashes silently

### Claude's Discretion
- Exact error message copy and styling in web dashboard error state
- Exact error indicator placement and style in extension sidebar
- Whether web error state is inline (per-component) or a banner

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-04 | REACH_SECRET validated consistently on every protected server endpoint; missing or invalid secret returns 401 | Server already enforces via `requireSecret` middleware on all `/api` routes. Web dashboard `api.js` and extension `api-client.js::fetchOutreach()` are the two callers missing the header — both fixable with a shared helper pattern already established in each codebase. |
| PERF-01 | `GET /api/outreach` supports `limit` and `offset` query params; response includes `total` count; default limit of 100 records | Phase 3 already implemented this server-side: response shape is `{ data, total }`. The bug is consumers treating it as a flat array. Fix is purely in the clients: destructure `.data` in `background.js` (GET_STATS, GET_RECENT) and `reply-checker.js` (`checkReplies`). The `useOutreach.js` hook already destructures `{ data }` correctly. |
</phase_requirements>

---

## Summary

Phase 6 is a wiring-only phase. All three bugs are integration gaps between code written in separate phases: the server correctly enforces `x-reach-secret` on all `/api` routes (Phase 1), the server correctly returns `{ data, total }` pagination shape (Phase 3), and the extension correctly uses `serverFetch()` for all server calls (Phase 4) — except `fetchOutreach()`, which was missed. The web dashboard was never updated to send the secret header after Phase 1 hardened the server.

The fixes follow patterns already established in the codebase. `serverFetch()` in `extension/api-client.js` is the model for the web dashboard's `apiFetch()` helper. The `patchOutreach` function in `web/src/lib/api.js` is the model for consistent `!res.ok` throwing. The `useOutreach.js` hook already destructures `{ data }` from `fetchOutreach()` correctly, proving the pattern.

Error visibility improvements are the only discretionary surface: the web dashboard needs to propagate thrown errors into visible React state (the `useOutreach` hook currently swallows them into `console.error`), and the extension sidebar currently shows dashes silently on `{ok: false}` instead of a visible indicator.

**Primary recommendation:** Two plans — (1) web `api.js` auth helper + error propagation; (2) extension `fetchOutreach` auth + `.data` destructure in all three consumers.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite `import.meta.env` | Already in use | Inject `VITE_REACH_SECRET` into web dashboard at build time | Established in Phase 1; `web/.env.example` and `web/.env` already exist |
| Browser `fetch` API | Native | HTTP calls from web dashboard and extension | No external library; same as existing code |
| Chrome extension `chrome.runtime.sendMessage` | MV3 | Sidebar requests stats from background | Already wired in `sidebar.js` and `background.js` |

### No new dependencies required
All fixes use language/platform primitives and patterns already in the codebase. Zero new packages.

---

## Architecture Patterns

### Pattern 1: Private `apiFetch` helper in `web/src/lib/api.js`

**What:** A module-private function that wraps `fetch` with the secret header and `!res.ok` throwing. Mirrors `serverFetch()` in `extension/api-client.js`.

**When to use:** Every exported function in `api.js` delegates to it.

```javascript
// Source: modeled on extension/api-client.js::serverFetch()
const SECRET = import.meta.env.VITE_REACH_SECRET;

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-reach-secret': SECRET,
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method ?? 'GET'} ${url} failed (${res.status}): ${body || res.statusText}`);
  }
  return res;
}
```

**Key decisions:**
- `apiFetch` returns the raw Response, not parsed JSON — callers decide when to call `.json()`
- `fetchOutreach()` becomes `() => apiFetch(`${BASE}/outreach`).then(r => r.json())` — the `.json()` parse stays at the call site as now
- `patchOutreach` and `deleteOutreach` use `apiFetch` with appropriate method/body; throwing on `!res.ok` is already in `patchOutreach` so this is alignment, not change in behavior
- `fetchBestTime` needs `!res.ok` protection added

### Pattern 2: `fetchOutreach()` in `extension/api-client.js` delegates to `serverFetch`

**What:** Replace the bare `fetch` call with the established `serverFetch` helper.

**Contract preserved:** The function still returns the raw `Response` object so that `background.js` callers can call `.json()` themselves — this is an explicit decision.

```javascript
// Before (broken):
export async function fetchOutreach() {
  return fetch(`${SERVER_URL}/outreach`);
}

// After (fixed):
export async function fetchOutreach() {
  return serverFetch('/outreach');
}
```

### Pattern 3: `.data` destructure in all three consumers

**What:** The server returns `{ data: [...], total: N }`. Callers that treat the response as a flat array will get `records.length === undefined` errors or iterate on an object's keys.

**Three fix sites:**

```javascript
// background.js GET_STATS (line 87-98) — before:
.then(records => {
  const sent = records.length;
// after:
.then(({ data: records }) => {
  const sent = records.length;

// background.js GET_RECENT (line 130-140) — before:
.then(records => {
  const recent = records.slice(0, 3)
// after:
.then(({ data: records }) => {
  const recent = records.slice(0, 3)

// reply-checker.js checkReplies() (line 251-253) — before:
records = await res.json();
// after:
records = (await res.json()).data;
```

### Pattern 4: Error visibility — web dashboard

**What:** `useOutreach.js::load()` catches errors with `console.error` only — users see an empty board when the server is down or the secret is wrong. The fix adds an `error` state to `useOutreach` and returns it to `App.jsx` to render a visible message.

**Existing model:** `InsightsPanel.jsx` already has a working `error` state pattern:
```javascript
// InsightsPanel.jsx — established pattern to follow
const [error, setError] = useState(null);
// ...
.catch(e => setError(e.message))
// ...
if (error) {
  return <div className="... text-red-400">Failed to load insights: {error}</div>;
}
```

**Application to `useOutreach`:** Add `error` state; expose from hook return; `App.jsx` renders an inline error banner when `error` is truthy and `records.length === 0`.

### Pattern 5: Error visibility — extension sidebar

**What:** `sidebar.js::loadStats()` already has an `if (!response?.ok)` branch that resets stats to `—`. The fix adds a visible text indicator (e.g. "Server unreachable") to the stats area instead of silent dashes.

**Constraint:** `sidebar.js` is a classic content script — no imports, no React, DOM manipulation only. The indicator must be added to the Shadow DOM panel HTML or inserted dynamically.

### Anti-Patterns to Avoid

- **Changing `fetchOutreach()`'s return type in `api-client.js`:** Consumers call `.json()` themselves — do not parse inside `fetchOutreach()`. Keep raw Response return.
- **Adding `VITE_REACH_SECRET` to `web/.env.example` without also noting it must be set in `web/.env`:** The env file already has `VITE_API_URL` but is missing `VITE_REACH_SECRET`. Both files need the key.
- **Forgetting `Content-Type` on requests that don't have a body:** The `apiFetch` helper should default `Content-Type: application/json` but DELETE requests have no body — this is acceptable; the server ignores it for DELETE.
- **Throwing in `apiFetch` for `fetchOutreach` when server returns 409 on POST:** This only affects the outreach-tracking path (not api.js), but the principle: 4xx responses that are expected (409 conflict) should be handled by callers. In the web dashboard case all 4xx are errors to surface to the user, so throwing is correct.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret header injection | Custom fetch override, proxy, interceptor | Simple wrapper function `apiFetch()` | Already established in extension as `serverFetch()`; 10 lines of code; zero dependencies |
| Error state in React | Custom error boundary, error event system | `useState` error pattern | `InsightsPanel.jsx` already demonstrates the exact pattern needed |
| Shadow DOM error element | MutationObserver, dynamic script injection | Direct DOM innerHTML addition in `buildSidebar()` | `sidebar.js` is already imperative DOM; just add an error element to the template |

---

## Common Pitfalls

### Pitfall 1: `VITE_REACH_SECRET` not in `.env.example`
**What goes wrong:** Future developer clones repo, copies `.env.example` to `.env`, starts web dashboard — every API call returns 401 with no obvious explanation because the env file template doesn't show the key.
**Why it happens:** Phase 1 added the key to the extension's `config.example.js` but the web dashboard's `.env.example` was only given `VITE_API_URL`.
**How to avoid:** Add `VITE_REACH_SECRET=` (empty value) to `web/.env.example` as part of this phase.
**Warning signs:** 401 errors on all web dashboard requests after fresh setup.

### Pitfall 2: `import.meta.env` values are strings, not absent
**What goes wrong:** When `VITE_REACH_SECRET` is not set, `import.meta.env.VITE_REACH_SECRET` is `undefined` at runtime (Vite replaces with `undefined` literal). The header becomes `x-reach-secret: undefined` (string), which the server will reject with 401, but the error message will be confusing.
**How to avoid:** `apiFetch` can guard: `if (!SECRET) throw new Error('VITE_REACH_SECRET not configured')` — this surfaces a clearer error before even making the request.
**Warning signs:** Console shows `TypeError: Cannot read properties of undefined` on `SECRET.length` or similar.

### Pitfall 3: Three consumers, easy to miss one
**What goes wrong:** Fixing GET_STATS but not GET_RECENT, or fixing both background.js handlers but not `reply-checker.js::checkReplies()` — leaves one code path still broken.
**Why it happens:** The three consumers are in two different files. `reply-checker.js` is particularly easy to miss because it doesn't go through `background.js`.
**How to avoid:** The plan must explicitly list all three fix sites as separate checklist items.
**Warning signs:** GET_STATS works in sidebar but reply checker logs `records.length` as undefined.

### Pitfall 4: `useOutreach` error state not cleared on successful reload
**What goes wrong:** User sees error banner, server comes back online, user clicks Refresh — if error state is not cleared in `load()` before the new fetch, the banner persists even after success.
**How to avoid:** Clear error state at the start of `load()`: `setError(null)` before `fetchOutreach()`.

### Pitfall 5: `deleteOutreach` response not checked
**What goes wrong:** The current `deleteOutreach` calls `fetch` with no response handling at all. After switching to `apiFetch` which throws on `!res.ok`, callers must handle the rejection. The `useOutreach.js::deleteRecord` currently fire-and-forgets `deleteOutreach(threadId)` with no `.catch()`.
**How to avoid:** Add `.catch()` to `deleteRecord` in `useOutreach.js` — consistent with how `patchOutreach` is handled elsewhere in the hook.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing `serverFetch` in `extension/api-client.js` (the model)
```javascript
// extension/api-client.js lines 65-72
export async function serverFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-reach-secret': REACH_SECRET,
    ...(options.headers || {}),
  };
  return fetch(`${SERVER_URL}${path}`, { ...options, headers });
}
```

### Server `requireSecret` middleware confirming header name (server/app.js lines 32-41)
```javascript
function requireSecret(req, res, next) {
  const secret = process.env.REACH_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server misconfigured: REACH_SECRET not set' });
  }
  if (req.headers['x-reach-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid x-reach-secret header' });
  }
  next();
}
app.use('/api', requireSecret);
```

### `patchOutreach` — existing `!res.ok` throw pattern to follow (web/src/lib/api.js lines 5-16)
```javascript
export const patchOutreach = (threadId, patch) =>
  fetch(`${BASE}/outreach/${threadId}`, { ... }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`PATCH /outreach/${threadId} failed (${res.status}): ${body || res.statusText}`);
    }
    return res.json();
  });
```

### `useOutreach` current error swallowing (hook/useOutreach.js line 25)
```javascript
// Current — swallows to console only:
.catch(e => console.error('[Reach] Failed to fetch records:', e.message));

// After fix — propagates to UI:
.catch(e => setError(e.message));
```

### `InsightsPanel` error state pattern (web/src/components/InsightsPanel.jsx lines 13-34)
```javascript
const [error, setError] = useState(null);
// in useEffect:
.catch(e => setError(e.message))
// in render:
if (error) {
  return (
    <div className="flex items-center justify-center h-full text-red-400 text-sm">
      Failed to load insights: {error}
    </div>
  );
}
```

### Background.js GET_STATS current shape bug (background.js lines 87-98)
```javascript
// Current (broken — treats paginated object as flat array):
.then(records => {
  const sent = records.length;           // undefined
  const replied = records.filter(...)    // TypeError

// Fixed:
.then(({ data: records }) => {
  const sent = records.length;           // correct
  const replied = records.filter(...)    // correct
```

### reply-checker.js checkReplies current shape bug (reply-checker.js lines 251-253)
```javascript
// Current (broken):
const res = await fetchOutreach();
records = await res.json();              // { data: [...], total: N }
log.info(`Reply check: ${records.length} tracked record(s).`);  // undefined

// Fixed:
const res = await fetchOutreach();
records = (await res.json()).data;       // [...]
log.info(`Reply check: ${records.length} tracked record(s).`);  // correct
```

---

## State of the Art

| Area | Current State | Phase 6 Target |
|------|--------------|----------------|
| `web/src/lib/api.js` auth | 4 bare fetch calls, no secret header | All delegate to private `apiFetch()` helper with header |
| `extension/api-client.js::fetchOutreach` | Bare `fetch(SERVER_URL + '/outreach')` | Delegates to `serverFetch('/outreach')` |
| Response shape consumers | `background.js` (2 handlers) + `reply-checker.js` treat response as flat array | All 3 sites destructure `.data` |
| Web dashboard error visibility | Silent `console.error` — empty board on failure | `useOutreach` exposes error state; `App.jsx` renders visible banner |
| Extension sidebar error visibility | Silent dashes (`—`) on `{ok: false}` | Visible "Server unreachable" text in stats area |

---

## Open Questions

1. **`deleteOutreach` 404 behavior**
   - What we know: Currently fire-and-forget; no error handling in `deleteRecord`. After `apiFetch` wraps it, a 404 (record already deleted) will throw.
   - What's unclear: Should the web dashboard show an error on delete-of-already-deleted, or silently treat 404 as success?
   - Recommendation: Log 404 but don't surface to user — optimistic deletion already removed it from UI state.

2. **Web dashboard error banner scope**
   - What we know: CONTEXT.md leaves placement/style to Claude's discretion.
   - What's unclear: Should it be a full-height error state (replace board) or a top banner (overlay)?
   - Recommendation: Follow `InsightsPanel` pattern — full-height centered message when `records.length === 0 && error`; if records loaded then failed (rare), show a dismissable top banner.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (`node:test`) |
| Config file | None — root `package.json` `test` script |
| Quick run command | `node --test --test-concurrency=1 server/outreach.test.js` |
| Full suite command | `node --test --test-concurrency=1 extension/*.test.js web/src/**/*.test.js server/*.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-04 | `GET /api/outreach` returns 401 without `x-reach-secret` header | integration | `node --test --test-concurrency=1 server/outreach.test.js` | ✅ (test helpers already send secret; can add negative test) |
| SEC-04 | `GET /api/outreach` returns 200 with correct `x-reach-secret` header | integration | `node --test --test-concurrency=1 server/outreach.test.js` | ✅ (existing auth-positive test) |
| PERF-01 | `GET /api/outreach` response shape is `{ data: [...], total: N }` | integration | `node --test --test-concurrency=1 server/outreach.test.js` | ✅ (existing test asserts `body.data` and `body.total`) |
| PERF-01 | `background.js` GET_STATS returns correct counts from paginated response | manual | Open extension sidebar on Gmail | N/A — extension background runs in MV3 SW |
| PERF-01 | `reply-checker.js checkReplies` iterates `.data` array without TypeError | manual | Trigger RECHECK_REPLIES, observe console | N/A — requires Gmail OAuth token |

### Sampling Rate
- **Per task commit:** `node --test --test-concurrency=1 server/outreach.test.js`
- **Per wave merge:** `node --test --test-concurrency=1 extension/*.test.js web/src/**/*.test.js server/*.test.js`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/outreach.test.js` — add negative test: `GET /api/outreach` without secret header returns 401 (covers SEC-04 explicitly)

*(Existing test infrastructure covers all other phase requirements. No new test files needed.)*

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `web/src/lib/api.js` — confirmed 4 bare fetch calls, no headers
- Direct code inspection: `extension/api-client.js` lines 100-102 — confirmed bare `fetch` in `fetchOutreach()`
- Direct code inspection: `extension/background.js` lines 87-98, 130-140 — confirmed flat-array consumption of paginated response
- Direct code inspection: `extension/reply-checker.js` lines 251-253 — confirmed flat-array consumption
- Direct code inspection: `server/app.js` lines 32-43 — confirmed `requireSecret` middleware on all `/api` routes, header name `x-reach-secret`
- Direct code inspection: `web/src/hooks/useOutreach.js` line 24 — confirmed `{ data }` destructure already in place (hook correct; api.js missing header)
- Direct code inspection: `web/src/components/InsightsPanel.jsx` — confirmed error state pattern
- Direct code inspection: `extension/sidebar.js` lines 223-235 — confirmed silent dash behavior on `{ok: false}`

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` accumulated decisions — confirms Phase 3 decision: "GET /api/outreach returns { data, total } pagination shape (not flat array)"
- `.planning/STATE.md` — confirms Phase 3 decision: "useOutreach.js destructures only { data } from fetchOutreach() response"

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH — all three bugs verified by reading the actual source code
- Fix patterns: HIGH — all patterns are already proven in the existing codebase, not speculative
- Error visibility approach: HIGH — InsightsPanel and sidebar.js provide exact templates to follow
- Test coverage: MEDIUM — integration tests cover server behavior; extension behavior is manual-only (no test harness for MV3 service workers)

**Research date:** 2026-03-17
**Valid until:** Stable indefinitely — no external dependencies; all findings are from local source inspection
