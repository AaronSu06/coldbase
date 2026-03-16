# Phase 4: Extension Refactor - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Split `background.js` and `content.js` into focused single-responsibility modules. Add structured logging (`logger.js`) to replace raw `console.log` calls. Replace silent `catch {}` blocks with explicit error handling that logs failures. No behavior changes, no UI changes, no new extension capabilities.

</domain>

<decisions>
## Implementation Decisions

### content.js split strategy
- Modules are delivered by listing them in the `content_scripts` manifest array — no bundler needed
- Load order: `logger.js`, `email-detector.js`, `compose-widget.js`, `tracking.js` first, then `content.js` last (orchestrator)
- Modules expose their API via a global namespace object: `window.ReachDetector = {...}`, `window.ReachWidget = {...}`, `window.ReachTracking = {...}`
- `content.js` calls into these namespaces: `ReachDetector.init()`, `ReachWidget.attach()`, etc.
- Shared state (editor WeakMaps, `lastActiveEditor`, `liveEditors` Set) stays in `content.js` — the orchestrator owns shared state; modules receive it as arguments or via the namespace

### Logger design
- `extension/logger.js` is a module factory: `const log = logger('auth')` → `log.info('...')` outputs `[Reach/auth] ...`
- Production suppression via a `DEBUG` constant in `extension/config.js` (already git-ignored, fits Phase 1 config pattern)
- `debug` and `info` calls suppressed when `DEBUG=false`; `error` calls always output
- `logger.js` added to the content_scripts array (loads first) so content-side modules access it as `window.ReachLogger` or just `ReachLogger`
- `background.js` and other ES modules import logger.js directly via `import { logger } from './logger.js'`

### catch block escalation policy
- **Auth failures** (`getAuthToken`, `TOKEN_EXPIRED`): log + rethrow. Auth failures should be visible — silent auth failures hide real problems. Callers decide what to surface.
- **UI rendering errors** in content scripts (compose widget, pixel injection): log + degrade gracefully. Return `undefined`/`false`, let orchestrator skip the feature. Never rethrow in content scripts — an uncaught error crashes all Reach functionality in Gmail.
- **Server API call failures** (posting outreach, tracking events): log + return structured error result `{ ok: false, error: e.message }`. Matches existing `.catch(() => sendResponse({ ok: false }))` pattern; logging is the only addition.
- Bare `catch {}` and `.catch(() => {})` blocks are replaced — at minimum a `log.error(e)` is added before any fallback return

### background.js module boundaries
- `extension/auth.js`: `getAuthToken()` and token management only
- `extension/api-client.js`: Gmail API helpers (`apiFetch`, `apiFetchRetry`, `getFullMessage`) + server API calls (posting outreach, fetching replies). Gmail helpers move here because apiFetch is core transport for Gmail calls.
- `extension/reply-checker.js`: reply detection logic + reply-parsing helpers (`extractHeader`, `decodeBase64Url`, `parseEmailBody`, reply-specific parsing). Helpers move to the module that uses them most.
- `background.js` stays as orchestrator: owns the `chrome.runtime.onMessage` handler and message dispatcher; each branch calls into the relevant module. Message surface stays visible in one place (consistent with how `server/index.js` works).

### Claude's Discretion
- Exact function signatures for module namespace APIs (e.g., what arguments `ReachDetector.init()` takes)
- Internal organization within each new module file
- Whether `logger.js` uses ES module exports for background.js and sets `window.ReachLogger` for content scripts (dual-mode export)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/config.js`: Already git-ignored, exports `SERVER_URL`, `REACH_SECRET` — add `DEBUG` constant here for logger prod suppression
- `extension/manifest.json` content_scripts array: Already loads `[content.js, sidebar.js]` — extend this pattern with new module files
- `background.js` `chrome.runtime.onMessage` handler: Large switch/if-else — stays in background.js as orchestrator, branches call module functions

### Established Patterns
- `background.js` is `"type": "module"` (can use `import`) — new background modules use ES module exports
- `content.js` is a classic script — new content modules use `window.ReachXxx = {}` namespace pattern
- Phase 1 established `config.js` as the single config source — `DEBUG` flag goes there

### Integration Points
- `manifest.json` content_scripts array needs `logger.js`, `email-detector.js`, `compose-widget.js`, `tracking.js` added before `content.js`
- `background.js` imports (line 1): add `auth.js`, `api-client.js`, `reply-checker.js` imports; remove the functions that move out
- `extension/config.js`: add `export const DEBUG = true;` (set to `false` for production)

</code_context>

<specifics>
## Specific Ideas

- Logger factory pattern: `function logger(module) { return { debug: (...a) => DEBUG && console.debug('[Reach/${module}]', ...a), info: (...a) => DEBUG && console.log('[Reach/${module}]', ...a), error: (...a) => console.error('[Reach/${module}]', ...a) } }`
- `background.js` orchestrator should stay lean: imports, message handler, alarm handler, startup — no business logic

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-extension-refactor*
*Context gathered: 2026-03-16*
