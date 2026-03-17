# Phase 6: Integration Fixes - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three cross-phase integration breaks that make the app non-functional at runtime:
1. `web/src/lib/api.js` — all 4 fetch calls missing `x-reach-secret` header → 401 on every web dashboard request
2. `extension/api-client.js` `fetchOutreach()` — bare fetch missing secret header → 401 from extension background handlers
3. `extension/background.js` + `extension/reply-checker.js` — consumers treat `{data, total}` paginated response as a flat array → TypeError

No new features. No new routes. No UI redesign. Just wiring fixes and error surface improvements.

</domain>

<decisions>
## Implementation Decisions

### Web API auth pattern
- Create a private `apiFetch(url, opts)` helper inside `web/src/lib/api.js` that injects `import.meta.env.VITE_REACH_SECRET` as `x-reach-secret` header automatically
- All 4 existing functions (`fetchOutreach`, `patchOutreach`, `deleteOutreach`, `fetchBestTime`) call this helper instead of bare `fetch`
- All 4 functions throw on `!res.ok` — consistent error behavior (aligning with what `patchOutreach` already does)

### Extension fetchOutreach fix
- Refactor `fetchOutreach()` in `api-client.js` to use `serverFetch('/outreach')` instead of bare `fetch` — adds secret header and aligns with existing server call patterns (`SUGGEST_DOMAINS`, `FIND_CONTACT`, etc.)
- Keep `fetchOutreach()` returning the raw Response (not parsed JSON) — consumers in `background.js` call `.json()` themselves; this contract stays
- Fix consumers: destructure `.data` from parsed response in `background.js` GET_STATS and GET_RECENT handlers, and in `reply-checker.js` `checkReplies()`

### Error visibility
- Web dashboard: when API calls fail, surface a visible error state to the user (not just an empty table or silent failure)
- Extension sidebar: when GET_STATS or GET_RECENT returns `{ok: false}`, surface a visible error indicator in the sidebar — don't just show dashes silently

### Claude's Discretion
- Exact error message copy and styling in web dashboard error state
- Exact error indicator placement and style in extension sidebar
- Whether web error state is inline (per-component) or a banner

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/api-client.js` `serverFetch()`: established helper that attaches secret header — `fetchOutreach` should delegate to it
- `patchOutreach` in `web/src/lib/api.js`: already throws on `!res.ok` — pattern to follow for other functions

### Established Patterns
- Extension server calls use `serverFetch(path, opts)` (SUGGEST_DOMAINS, FIND_CONTACT, DRAFT_EMAIL, etc.) — fetchOutreach is the outlier
- Web dashboard reads `import.meta.env.VITE_REACH_SECRET` already established in Phase 1 (web/.env.example exists)
- `background.js` async message handlers already return true and use `.catch((e) => { log.error(...); sendResponse({ ok: false }); })` pattern

### Integration Points
- `background.js` GET_STATS (line 87): `fetchOutreach().then(r => r.json()).then(records => ...)` — needs `.data` destructure
- `background.js` GET_RECENT (line 130): same pattern — needs `.data` destructure
- `reply-checker.js` `checkReplies()` (line 252): `records = await res.json()` — needs `records = (await res.json()).data`
- `web/src/lib/api.js`: 4 bare fetch calls with no headers — all need the shared helper

</code_context>

<specifics>
## Specific Ideas

- The shared `apiFetch` wrapper in `web/src/lib/api.js` should follow the same pattern as `serverFetch` in the extension: build headers object, spread options
- Error visibility in the web dashboard matters because this is being built into a real product — users need to know when the server is unreachable or misconfigured

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-integration-fixes*
*Context gathered: 2026-03-17*
