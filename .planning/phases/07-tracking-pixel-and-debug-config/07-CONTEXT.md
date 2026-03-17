# Phase 7: Tracking Pixel URL + Debug Config - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire two hardcoded values to their config sources:
1. Tracking pixel URL in `tracking.js` reads `serverBase` from `GET_RUNTIME_CONFIG` instead of hardcoding `localhost:3001`
2. `background.js` logger respects the `DEBUG` flag from `config.js` instead of hardcoding `true`

No new features, no UI changes, no new API endpoints.

</domain>

<decisions>
## Implementation Decisions

### Tracking URL source
- Add `serverBase` field to `GET_RUNTIME_CONFIG` response in `background.js` — computed as `SERVER_URL.replace(/\/api$/, '')`
- `tracking.js` uses `serverBase` from the config response to build the pixel URL: `serverBase + '/track/' + trackingId + '.gif'`
- No new exports in `config.example.js` — the existing `SERVER_URL` is the source of truth

### Config fetch failure handling
- If `GET_RUNTIME_CONFIG` fails or times out, fall back to `'http://localhost:3001'` as the hardcoded default
- Pixel injection proceeds with the fallback — tracking still works in dev, open events arrive normally

### Config fetch timing
- Pre-fetch config at `init()` via `chrome.runtime.sendMessage GET_RUNTIME_CONFIG` and cache `serverBase`
- Click handler (`watchSendButton`) uses the cached value synchronously — no async in hot path
- If the init fetch fails, fallback value is used for all subsequent pixel injections

### DEBUG wiring approach
- `logger-esm.js` imports `DEBUG` from `./config.js` — replaces its hardcoded `const DEBUG = true`
- `background.js` imports `makeLogger` from `logger-esm.js` — removes its inline `makeLogger` duplicate
- Result: all ES module consumers of `logger-esm.js` automatically pick up `DEBUG` from `config.js`

### Intentional non-changes
- `logger.js` (classic script) keeps its own hardcoded `DEBUG` — cannot import from config.js due to classic script constraint; prior decision from Phase 04-01 stands

### Claude's Discretion
- Exact error logging for config fetch failure (log level, message text)
- Whether to log when fallback URL is used

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GET_RUNTIME_CONFIG` handler in `background.js` (line 81): already returns `{ serverApiBase, dashboardUrl }` — extend with `serverBase`
- `logger-esm.js`: already exports `makeLogger` — only needs `DEBUG` import from config.js
- `config.example.js`: exports `SERVER_URL`, `DASH_URL`, `REACH_SECRET`, `DEBUG` — `DEBUG` exists but unused by logger-esm.js today

### Established Patterns
- Classic scripts (`tracking.js`) communicate with background via `chrome.runtime.sendMessage` — pattern used in `panel.js`, `sidebar.js`, `popup.js` for GET_RUNTIME_CONFIG
- ES modules in extension import directly from `config.js` (e.g., `background.js` already imports `SERVER_URL`, `DASH_URL`)

### Integration Points
- `tracking.js` `init()` function — pre-fetch fires here, result cached in module-local var
- `background.js` `GET_RUNTIME_CONFIG` response object — add `serverBase` field
- `logger-esm.js` top of file — add `import { DEBUG } from './config.js'`
- `background.js` imports — swap inline makeLogger for `import { makeLogger } from './logger-esm.js'`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard config wiring approach.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-tracking-pixel-and-debug-config*
*Context gathered: 2026-03-17*
