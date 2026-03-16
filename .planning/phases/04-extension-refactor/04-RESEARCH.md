# Phase 4: Extension Refactor - Research

**Researched:** 2026-03-16
**Domain:** Chrome Extension Manifest V3 — module splitting, classic script namespacing, structured logging, error handling policy
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**content.js split strategy**
- Modules are delivered by listing them in the `content_scripts` manifest array — no bundler needed
- Load order: `logger.js`, `email-detector.js`, `compose-widget.js`, `tracking.js` first, then `content.js` last (orchestrator)
- Modules expose their API via a global namespace object: `window.ReachDetector = {...}`, `window.ReachWidget = {...}`, `window.ReachTracking = {...}`
- `content.js` calls into these namespaces: `ReachDetector.init()`, `ReachWidget.attach()`, etc.
- Shared state (editor WeakMaps, `lastActiveEditor`, `liveEditors` Set) stays in `content.js` — the orchestrator owns shared state; modules receive it as arguments or via the namespace

**Logger design**
- `extension/logger.js` is a module factory: `const log = logger('auth')` → `log.info('...')` outputs `[Reach/auth] ...`
- Production suppression via a `DEBUG` constant in `extension/config.js` (already git-ignored, fits Phase 1 config pattern)
- `debug` and `info` calls suppressed when `DEBUG=false`; `error` calls always output
- `logger.js` added to the content_scripts array (loads first) so content-side modules access it as `window.ReachLogger` or just `ReachLogger`
- `background.js` and other ES modules import logger.js directly via `import { logger } from './logger.js'`

**catch block escalation policy**
- **Auth failures** (`getAuthToken`, `TOKEN_EXPIRED`): log + rethrow. Auth failures should be visible — silent auth failures hide real problems. Callers decide what to surface.
- **UI rendering errors** in content scripts (compose widget, pixel injection): log + degrade gracefully. Return `undefined`/`false`, let orchestrator skip the feature. Never rethrow in content scripts — an uncaught error crashes all Reach functionality in Gmail.
- **Server API call failures** (posting outreach, tracking events): log + return structured error result `{ ok: false, error: e.message }`. Matches existing `.catch(() => sendResponse({ ok: false }))` pattern; logging is the only addition.
- Bare `catch {}` and `.catch(() => {})` blocks are replaced — at minimum a `log.error(e)` is added before any fallback return

**background.js module boundaries**
- `extension/auth.js`: `getAuthToken()` and token management only
- `extension/api-client.js`: Gmail API helpers (`apiFetch`, `apiFetchRetry`, `getFullMessage`) + server API calls (posting outreach, fetching replies). Gmail helpers move here because apiFetch is core transport for Gmail calls.
- `extension/reply-checker.js`: reply detection logic + reply-parsing helpers (`extractHeader`, `decodeBase64Url`, `parseEmailBody`, reply-specific parsing). Helpers move to the module that uses them most.
- `background.js` stays as orchestrator: owns the `chrome.runtime.onMessage` handler and message dispatcher; each branch calls into the relevant module. Message surface stays visible in one place.

### Claude's Discretion
- Exact function signatures for module namespace APIs (e.g., what arguments `ReachDetector.init()` takes)
- Internal organization within each new module file
- Whether `logger.js` uses ES module exports for background.js and sets `window.ReachLogger` for content scripts (dual-mode export)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXT-01 | `background.js` split into `auth.js`, `api-client.js`, `reply-checker.js`; `background.js` becomes orchestrator | Function inventory below identifies exact split boundaries; ES module export pattern confirmed |
| EXT-02 | `content.js` split into `email-detector.js`, `compose-widget.js`, `tracking.js`; `content.js` becomes orchestrator | Classic script namespace pattern documented; content_scripts load order confirmed |
| EXT-03 | `logger.js` with debug/info/error levels; verbose logs suppressed in production; raw console.log eliminated | Logger factory pattern verified; dual-mode export strategy documented |
| EXT-04 | All silent `catch {}` and `.catch(() => {})` replaced with logging; propagation policy varies by context | All silent catch locations catalogued below with per-site escalation policy |
</phase_requirements>

---

## Summary

Phase 4 is a pure structural refactor — no behavior changes, no new chrome APIs, no new permissions. The work is splitting two large files (background.js at 563 lines, content.js at 1414 lines) into focused single-responsibility modules, then wiring them together through existing platform mechanisms: ES module imports for background scripts and `window.Namespace` globals for classic content scripts.

The key technical constraint is that content scripts in Manifest V3 cannot use ES module imports (the `type: "module"` attribute is not available on content_scripts entries). This means content-side modules must communicate through the window global namespace and must be listed explicitly in the `content_scripts` manifest array in dependency order. Background.js already uses `"type": "module"` and can use standard ES module `import/export` for its split modules.

The codebase has 39 raw `console.log/warn/error` calls in background.js and 6 in content.js. Four silent catch patterns exist that need escalation: two bare `catch {}` blocks and two `.catch(() => sendResponse({ ok: false }))` chains. The logger factory pattern is straightforward to implement; the main subtlety is the dual-mode export so `logger.js` works as both an ES module (for background scripts) and as a global-setting script (for content scripts).

**Primary recommendation:** Implement in four sequential waves — (1) logger.js + config.js update, (2) background module split, (3) content module split, (4) catch escalation sweep — so each wave is independently verifiable by reloading the extension and confirming Gmail tracking still works.

---

## Standard Stack

### Core (all already present — no new dependencies)

| File | Role | Pattern |
|------|------|---------|
| `extension/config.js` | Single config source, git-ignored | Add `export const DEBUG = true;` |
| `manifest.json` `content_scripts` | Delivery mechanism for content modules | Extend `js` array in load order |
| `background.js` `"type": "module"` | Already enables ES module imports | New modules use `export function` |
| `window.Reach*` namespace | IPC between content script files | No bundler; classic script globals |

### No New Libraries
This phase requires zero new npm packages or third-party dependencies. All patterns are vanilla JavaScript + Chrome extension platform features already in use.

---

## Architecture Patterns

### Existing File Map (pre-refactor)

```
extension/
├── background.js      (563 lines — ES module, service worker)
├── content.js         (1414 lines — classic script, injected into Gmail)
├── config.js          (6 lines — git-ignored, exports SERVER_URL, DASH_URL, REACH_SECRET)
├── classifier.js      (unchanged)
├── manifest.json      (content_scripts: [content.js, sidebar.js])
├── sidebar.js         (unchanged)
├── panel.js           (unchanged)
├── relay.js           (unchanged)
└── popup.js           (unchanged)
```

### Target File Map (post-refactor)

```
extension/
├── background.js      (orchestrator — imports, message handler, alarm handler, startup)
├── auth.js            (ES module — getAuthToken() only)
├── api-client.js      (ES module — apiFetch, apiFetchRetry, getFullMessage, server POST/PATCH calls)
├── reply-checker.js   (ES module — checkReplies(), parsing helpers: extractHeader, decodeBase64Url,
│                        findPart, extractBody, extractEmailAddress, shortFrom, stripQuotedText,
│                        normalizeForMatch, buildConversationPreview)
├── logger.js          (dual-mode — ES export for background, window.ReachLogger for content scripts)
├── content.js         (orchestrator — shared state, message listener, boot sequence)
├── email-detector.js  (classic script — attachToEditor, scanForEditors, DOM observer logic)
├── compose-widget.js  (classic script — injectStyles, getOrCreateWidget, updateWidget, panel HTML/tabs)
├── tracking.js        (classic script — generateTrackingId, injectTrackingPixel, watchSendButton,
│                        fireSendToast, showReloadBanner, checkForSendToast, scanForSendToast)
├── config.js          (add: export const DEBUG = true;)
└── manifest.json      (content_scripts js array extended)
```

### Pattern 1: ES Module Split (background-side)

**What:** New modules use standard `export function` syntax. background.js imports them at the top.

**When to use:** Any file listed as `"service_worker"` with `"type": "module"`.

```javascript
// extension/auth.js
import { logger } from './logger.js';
const log = logger('auth');

export async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(token);
    });
  });
}
```

```javascript
// extension/background.js (orchestrator top)
import { SERVER_URL, DASH_URL, REACH_SECRET } from './config.js';
import { logger } from './logger.js';
import { getAuthToken } from './auth.js';
import { apiFetch, apiFetchRetry, getFullMessage, postOutreach, postTrackingPixel, fetchOutreach, serverFetch } from './api-client.js';
import { checkReplies } from './reply-checker.js';
import { isColdOutreach, countKeywordMatches, ... } from './classifier.js';
```

### Pattern 2: Classic Script Namespace (content-side)

**What:** Each content module sets a property on `window`. The orchestrator calls through that property. Modules must not assume execution order beyond what manifest load order guarantees.

**When to use:** Any script listed in the `content_scripts` `"js"` array (cannot use ES module imports).

```javascript
// extension/tracking.js
// window.ReachTracking is available to content.js (loaded after this file)
window.ReachTracking = (function() {
  const log = window.ReachLogger ? window.ReachLogger('tracking') : { debug: ()=>{}, info: ()=>{}, error: console.error };

  function generateTrackingId() { ... }
  function injectTrackingPixel(editorEl, trackingId) { ... }
  function watchSendButton(editorEl, state) { ... }  // receives shared state
  function fireSendToast(state) { ... }              // receives shared state

  return { watchSendButton, fireSendToast, generateTrackingId };
})();
```

```javascript
// extension/content.js (orchestrator)
// Shared state owned here
const editorWidgets    = new WeakMap();
const editorManualModes = new WeakMap();
const liveEditors       = new Set();
let lastActiveEditor    = null;

const state = { editorWidgets, editorManualModes, liveEditors, get lastActiveEditor() { return lastActiveEditor; } };

ReachDetector.init(state);
ReachWidget.init(state);
ReachTracking.init(state);  // or pass state per-call
```

### Pattern 3: Dual-Mode Logger Export

**What:** `logger.js` works both as an ES module (for background.js) and as a plain script setting `window.ReachLogger` (for content scripts). This avoids maintaining two separate logger implementations.

```javascript
// extension/logger.js
// Works as: import { logger } from './logger.js'  (ES module context)
// Works as: <script src="logger.js"> → window.ReachLogger  (classic script context)

import { DEBUG } from './config.js';  // ES module import

function makeLogger(module) {
  return {
    debug: (...a) => DEBUG && console.debug(`[Reach/${module}]`, ...a),
    info:  (...a) => DEBUG && console.log(`[Reach/${module}]`, ...a),
    error: (...a) => console.error(`[Reach/${module}]`, ...a),
  };
}

export { makeLogger as logger };  // for ES module importers

// Also set global for classic script consumers
if (typeof window !== 'undefined') {
  window.ReachLogger = makeLogger;
}
```

**Caveat:** If `logger.js` uses `import { DEBUG } from './config.js'`, it cannot be loaded as a plain `<script>` tag (content scripts don't support ES module imports). The dual-mode approach requires either: (a) reading DEBUG from a global set by `config.js` in content script context, or (b) having `logger.js` self-contain the DEBUG default and not import config.js. See Open Questions #1.

### Pattern 4: manifest.json content_scripts Load Order

```json
{
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*"],
      "js": [
        "logger.js",
        "email-detector.js",
        "compose-widget.js",
        "tracking.js",
        "content.js",
        "sidebar.js"
      ],
      "run_at": "document_idle",
      "all_frames": false
    }
  ]
}
```

Chrome guarantees scripts in the `js` array execute in listed order within the same content script group. Modules can safely assume earlier entries have run.

### Anti-Patterns to Avoid

- **Circular namespace dependencies:** `email-detector.js` must not call `window.ReachWidget` (loaded after it). Data flows one way: modules → orchestrator, not module → module.
- **Catching errors silently in content modules:** Content modules should log + return null/false; the orchestrator (`content.js`) decides whether to skip a feature. Never swallow without logging.
- **Auth rethrow in content scripts:** Auth token calls happen in background.js only. If a content script needs auth state, it sends a message to background. Never catch + swallow auth errors in background.js.
- **Using `window.ReachLogger` before logger.js loads:** Only safe after manifest load order guarantees it. Don't call `window.ReachLogger?.('x')` with optional chaining as a workaround — fix the load order instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Module loading / bundling | Custom loader, dynamic import chains | Chrome manifest `content_scripts` array | Platform-native, no build step, guaranteed load order |
| Logger namespacing | Custom prefix system | `logger('module-name')` factory | Consistent prefix `[Reach/module]`, one implementation |
| Production log suppression | Per-file `if (DEBUG)` guards | `DEBUG` check inside logger factory | Centralised — one place to toggle |
| Content script inter-file communication | `chrome.runtime.sendMessage` between content scripts | `window.ReachNamespace` globals | sendMessage is for content↔background; globals are correct for content↔content |

---

## Common Pitfalls

### Pitfall 1: content_scripts ES module misconception
**What goes wrong:** Developer tries `import { x } from './module.js'` inside a content script file. Chrome throws a syntax error because content scripts run as classic scripts, not ES modules.
**Why it happens:** `background.js` uses `"type": "module"` and ES imports work there, creating a false expectation.
**How to avoid:** Only files declared as `"service_worker"` (or `"type": "module"` web page scripts) can use ES module syntax. Content scripts must use the `window.Namespace` pattern.
**Warning signs:** Chrome DevTools shows "SyntaxError: import declarations may only appear at top level of a module" in the content script context.

### Pitfall 2: Shared state ownership confusion
**What goes wrong:** A content module (e.g., `email-detector.js`) stores editor state in its own closure. Another module (`compose-widget.js`) can't see that state. Orchestrator can't clean up consistently.
**Why it happens:** Naive split puts state near the code that uses it.
**How to avoid:** Per CONTEXT.md decision: shared state (WeakMaps, `liveEditors`, `lastActiveEditor`) lives in `content.js`. Modules receive state as constructor/init arguments. `clearEditorMaps(el)` stays in content.js as the single cleanup point.
**Warning signs:** After refactor, detached editors accumulate in memory or widget state goes stale on re-attach.

### Pitfall 3: Silent catch in reply-checker loop
**What goes wrong:** The `checkReplies` per-thread `catch {}` at line 370 is currently silent. After refactor, thread fetch errors are invisible — a broken thread silently skips with no diagnostic.
**Why it happens:** The intent was "don't abort the whole loop for one bad thread" — correct behavior, wrong implementation.
**How to avoid:** Replace `catch {}` with `catch (e) { log.error('Reply check failed for thread', record.threadId, e); }`. The loop continues; the error is now visible.

### Pitfall 4: decodeBase64Url silent catch
**What goes wrong:** Line 70 `catch { return ''; }` loses any malformed base64 error entirely.
**Why it happens:** Fallback behavior (`return ''`) is correct; logging was omitted.
**How to avoid:** Add `log.debug('decodeBase64Url failed:', e?.message)` before `return ''`. Use `debug` level because this can be frequent with malformed MIME parts; we want it suppressible.

### Pitfall 5: logger.js loaded but DEBUG not available
**What goes wrong:** If `logger.js` tries to `import { DEBUG }` from `config.js` but is loaded as a classic content script, the import statement throws.
**Why it happens:** Content scripts don't support ES module syntax.
**How to avoid:** See Open Questions #1. Recommended approach: logger.js reads `window.ReachConfig?.DEBUG` when running as a classic script, with a safe default of `false` (production-safe).

### Pitfall 6: Missing `return true` in async message handlers
**What goes wrong:** Message handler branches that call async module functions must `return true` to keep the message channel open. Moving logic into modules can accidentally hide this requirement.
**Why it happens:** Refactoring extracts the async logic but the `return true` must remain in the onMessage handler in background.js.
**How to avoid:** background.js orchestrator keeps all `return true` statements. Never move them into imported modules.

---

## Code Examples

### Silent Catch Inventory (all locations requiring EXT-04 fixes)

**background.js — 4 locations:**

```javascript
// Line 70: decodeBase64Url — add debug log, keep return ''
} catch (e) {
  log.debug('decodeBase64Url: malformed input', e?.message);
  return '';
}

// Line 370: checkReplies per-thread loop — add error log, keep skip behavior
} catch (e) {
  log.error('Reply check failed for thread', record.threadId, e);
}

// Line 449: GET_STATS .catch — add error log
.catch((e) => { log.error('GET_STATS fetch failed:', e); sendResponse({ ok: false }); });

// Line 492: GET_RECENT .catch — add error log
.catch((e) => { log.error('GET_RECENT fetch failed:', e); sendResponse({ ok: false }); });
```

**content.js — 1 location:**

```javascript
// Line 48: _cpRelativeDate — add debug log, keep return ''
} catch (e) {
  log.debug('_cpRelativeDate parse error:', e?.message);
  return '';
}
```

### background.js Message Handler Structure (post-refactor)

```javascript
// background.js — orchestrator shape after split
import { SERVER_URL, DASH_URL, REACH_SECRET } from './config.js';
import { logger } from './logger.js';
import { getAuthToken } from './auth.js';
import { postOutreach, postTrackingPixel, serverFetch } from './api-client.js';
import { checkReplies, trackLatestSent } from './reply-checker.js';
import { isColdOutreach, countKeywordMatches } from './classifier.js';

const log = logger('background');

// All chrome.* event listeners stay here
chrome.storage.onChanged.addListener(...);
chrome.runtime.onInstalled.addListener(...);
chrome.alarms.onAlarm.addListener(...);
chrome.action.onClicked.addListener(...);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Each branch delegates to imported module functions
  if (message.type === 'GET_RUNTIME_CONFIG') { ... return; }
  if (message.type === 'GET_STATS') { serverFetch(...).then(...); return true; }
  // etc.
});
```

### Logger Factory Pattern

```javascript
// extension/logger.js — exact implementation per CONTEXT.md specifics section
function makeLogger(module) {
  const prefix = `[Reach/${module}]`;
  return {
    debug: (...a) => DEBUG && console.debug(prefix, ...a),
    info:  (...a) => DEBUG && console.log(prefix, ...a),
    error: (...a) => console.error(prefix, ...a),
  };
}
```

---

## Function-to-Module Assignment

### background.js split

| Function | Destination | Lines |
|----------|-------------|-------|
| `getAuthToken()` | `auth.js` | 9–18 |
| `apiFetch()` | `api-client.js` | 22–34 |
| `getFullMessage()` | `api-client.js` | 36–38 |
| `apiFetchRetry()` | `api-client.js` | 42–51 |
| `extractHeader()` | `reply-checker.js` | 55–58 |
| `decodeBase64Url()` | `reply-checker.js` | 60–73 |
| `findPart()` | `reply-checker.js` | 75–84 |
| `extractBody()` | `reply-checker.js` | 86–98 |
| `extractEmailAddress()` | `reply-checker.js` | 100–103 |
| `shortFrom()` | `reply-checker.js` | 105–109 |
| `stripQuotedText()` | `reply-checker.js` | 111–114 |
| `normalizeForMatch()` | `reply-checker.js` | 116–123 |
| `buildConversationPreview()` | `reply-checker.js` | 125–141 |
| `scanInProgress` (let) | `reply-checker.js` or `background.js` | — |
| `trackLatestSent()` + `_trackLatestSent()` | `reply-checker.js` | 147–302 (calls api-client, auth) |
| `checkReplies()` | `reply-checker.js` | 306–374 |
| All `chrome.*` listeners | `background.js` (stays) | 383–563 |
| `chrome.runtime.onMessage` handler | `background.js` (stays) | 432–563 |

**Note:** `trackLatestSent` calls `getAuthToken`, `apiFetch*`, and server fetch functions. After split, `reply-checker.js` imports from `auth.js` and `api-client.js`. This creates an import chain: `background.js` → `reply-checker.js` → `auth.js` + `api-client.js`. No circular dependency.

### content.js split (line ranges approximate)

| Function/Block | Destination | Notes |
|----------------|-------------|-------|
| `normalizeHint()` | `email-detector.js` | Used by fireSendToast metadata normalization |
| `requestKeywordScore()` | `email-detector.js` | Sends message to background for scoring |
| `_cpEscapeHtml()`, `_cpRelativeDate()` | `compose-widget.js` | Widget rendering helpers (`_cp` prefix = compose panel) |
| Editor state WeakMaps, `liveEditors`, `lastActiveEditor` | `content.js` (stays) | Orchestrator owns shared state |
| `generateTrackingId()` | `tracking.js` | |
| `injectTrackingPixel()` | `tracking.js` | |
| `watchSendButton()` | `tracking.js` | Needs `editorManualModes`, `pendingTrackingId` from state |
| `clearEditorMaps()` | `content.js` (stays) | Touches all shared WeakMaps — orchestrator owns cleanup |
| `injectStyles()` | `compose-widget.js` | |
| `getComposeContainer()`, `getComposeMetadata()` | `compose-widget.js` | |
| `detectNeighborRect()`, `placeWidget()` | `compose-widget.js` | |
| `getOrCreateWidget()`, `updateWidget()` | `compose-widget.js` | |
| `attachToEditor()`, `scanForEditors()` | `email-detector.js` | Calls back into widget + tracking via state |
| `showReloadBanner()`, `fireSendToast()` | `tracking.js` | `fireSendToast` uses shared state |
| `checkForSendToast()`, `scanForSendToast()` | `email-detector.js` | Observes DOM, calls `fireSendToast` |
| `domObserver`, periodic scan, resize handler | `email-detector.js` | All DOM observation wiring |
| Extension context health check (`setInterval`) | `email-detector.js` | |
| Compose panel HTML/CSS (lines 519–1347) | `compose-widget.js` | Largest section |
| `getPanelHTML()`, `setupOverviewTab()`, etc. | `compose-widget.js` | |
| `buildComposePanel()`, `openComposePanel()` | `compose-widget.js` | |
| `initStorageListeners()` | `content.js` (stays) | Touches shared state + panel sync |
| Boot sequence + `onMessage` listener | `content.js` (stays) | Orchestrator wiring |

---

## State of the Art

| Old Approach | Current Approach | Impact on This Phase |
|--------------|------------------|---------------------|
| Manifest V2 background pages | MV3 service workers with `"type": "module"` | background.js already ES module — no change needed |
| MV2 content scripts with `<all_frames>` implicit globals | MV3 explicit `content_scripts` with ordered `js` array | Load order is reliable; namespace pattern works |
| Build tool required for multi-file extensions | Direct manifest listing of multiple scripts | No bundler needed for this refactor |

---

## Open Questions

1. **logger.js dual-mode: how to access DEBUG in content script context**
   - What we know: `logger.js` as an ES module can `import { DEBUG } from './config.js'`. But when loaded as a content script classic file, `import` is unavailable.
   - What's unclear: Whether to (a) hardcode `DEBUG = true` in logger.js and update manually for production, (b) read `window.ReachConfig.DEBUG` if set by a classic `config.js` loader, or (c) keep it simple and use a top-of-file `const DEBUG = true` that a developer must flip before production builds.
   - Recommendation: Option (c) for this refactor phase — add `const DEBUG = true;` at the top of `logger.js` (in addition to the ES export). This is the simplest approach. A `config.js`-as-classic-script approach is CONTEXT.md deferred territory.

2. **`trackLatestSent` ownership: `reply-checker.js` or a separate `scanner.js`**
   - What we know: CONTEXT.md assigns `reply-checker.js` to reply detection. `trackLatestSent` is the initial send scan (not reply checking), but it uses many of the same parsing helpers.
   - What's unclear: Whether `trackLatestSent` truly belongs in `reply-checker.js` or should live in `api-client.js` (it does heavy server posting) or stay in `background.js`.
   - Recommendation: Per CONTEXT.md, the boundary is clear — `reply-checker.js` owns reply detection logic. `trackLatestSent` / `_trackLatestSent` is the primary scan logic, not reply checking. It's reasonable to put it in `reply-checker.js` since it uses the same parsing helpers, OR keep it in `background.js` as orchestrator logic. Given its size (lines 147–302), moving it to `reply-checker.js` produces a cleaner background.js. The planner should make the final call.

---

## Validation Architecture

`nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — extension uses no test runner |
| Config file | None |
| Quick run command | Manual: reload unpacked extension in `chrome://extensions`, navigate to Gmail, send a test email |
| Full suite command | Manual smoke test sequence (see Phase Requirements) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| EXT-01 | background.js is orchestrator-only; auth/api/reply logic in separate modules | manual-only | No extension unit test harness; validate by reloading extension — tracking still fires on send |
| EXT-02 | content.js is orchestrator-only; detector/widget/tracking in separate modules | manual-only | Reload Gmail tab; compose window widget appears; "Message sent" triggers scan |
| EXT-03 | logger.js exists; console output prefixed `[Reach/module]`; debug logs absent when DEBUG=false | manual-only | Set `DEBUG=false` in logger.js, reload extension, confirm no verbose logs in DevTools |
| EXT-04 | No bare catch blocks; all errors logged | manual-only | Code review + grep: `grep -n "catch {" extension/*.js` returns zero bare catches |

**Automated grep check (runnable in < 5 seconds):**
```bash
# Verify no silent catches remain
grep -rn "catch {" extension/*.js
grep -rn "\.catch(() =>" extension/*.js
# Both should return 0 results after EXT-04 is implemented
```

### Wave 0 Gaps

- [ ] No unit test infrastructure exists for extension code — Chrome extension environment cannot be easily unit tested without jsdom + chrome-mock setup. Out of scope for this phase.
- [ ] Smoke test checklist should be documented in the PLAN as the verification gate before marking phase complete.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `extension/background.js` (563 lines), `extension/content.js` (1414 lines), `extension/manifest.json`, `extension/config.js`
- All function assignments above are derived from reading the actual source, not inference

### Secondary (MEDIUM confidence)
- Chrome Extension MV3 documentation (well-established): content scripts cannot use ES module syntax; `"type": "module"` only applies to service workers
- Chrome content_scripts load order guarantee: scripts in the `js` array execute sequentially per Chrome docs (stable behavior since MV2)

### Tertiary (LOW confidence)
- N/A — no claims require tertiary sourcing for this phase

---

## Metadata

**Confidence breakdown:**
- Function-to-module assignment: HIGH — derived from direct source reading
- Chrome platform constraints (classic script vs ES module): HIGH — stable Chrome platform behavior
- Load order guarantee: HIGH — documented Chrome behavior unchanged since MV2
- Logger dual-mode pattern: MEDIUM — implementation details are discretionary (see Open Questions #1)
- Testing approach: HIGH — confirmed no test harness exists, manual verification is the only path

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain — Chrome extension MV3 APIs do not change frequently)
