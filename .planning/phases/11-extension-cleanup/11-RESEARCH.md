# Phase 11: Extension Cleanup - Research

**Researched:** 2026-03-17
**Domain:** Chrome extension JavaScript cleanup — React hook interval removal, Gmail API preview text sourcing
**Confidence:** HIGH

## Summary

This phase consists of two small, precisely scoped cleanups. Both changes are surgical: one line deletion plus a cleanup in `useOutreach.js`, and a single token swap in `buildConversationPreview` in `reply-checker.js`. No new dependencies, no architecture changes, no external services involved.

EXT-01 removes a `setInterval`/`clearInterval` pair from `useOutreach`'s `useEffect`. The interval was labeled "safety-net only" in the source and has been superseded by optimistic mutations throughout the hook. Removing it eliminates unnecessary network traffic every five minutes against the server and removes a code path that could mask race conditions in test environments.

EXT-02 fixes a silent data loss bug: `buildConversationPreview` evaluates `msg.snippet || extractBody(msg)`. Because Gmail's API always returns `msg.snippet` (truncated to ~100-120 chars by Google), `extractBody` is never reached. Flipping the order to `extractBody(msg) || msg.snippet` corrects this. The existing `slice(0, 300)` per-message cap remains correct and is not changed.

**Primary recommendation:** Both fixes are single-expression changes to well-understood code with no side-effects on callers. Plan one wave with two tasks plus a test task for EXT-02.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Polling removal (EXT-01)**
- Remove `setInterval(load, 5 * 60_000)` and its `clearInterval` cleanup from `useOutreach`'s `useEffect`
- Keep `load()` call on mount — initial data fetch is correct behavior
- No replacement interval or visibility-based refresh — optimistic mutations keep UI in sync; no sync gap exists between extension background writes and web app state
- `refresh: load` stays in the hook's return value (manual trigger, already used by callers)

**Preview fix strategy (EXT-02)**
- In `buildConversationPreview` (extension/reply-checker.js), flip the text source priority from `msg.snippet || extractBody(msg)` to `extractBody(msg) || msg.snippet`
- Rationale: Gmail always provides `msg.snippet` (~100-120 chars truncated by Gmail's API), so `extractBody` was never reached — full email body text was silently ignored
- Keep the existing `slice(0, 300)` per-message cap — 300 chars is an appropriate display limit
- Remove or fix the debug log `conversationPreview?.slice(0, 120)` — it only shows 120 chars of the preview in logs, not a functional cap, but should be updated to reflect the longer expected preview

**Preview display (web sidebar)**
- No changes to web/src/components/Sidebar.jsx display logic
- Existing collapsed view (last 2 messages) + "Show full thread" expand button is correct
- `max-h-72 overflow-y-auto` CSS on the expanded view handles long content adequately
- No line-clamp or other truncation changes needed

### Claude's Discretion
- Whether to update or remove the `slice(0, 120)` in the debug log (just logging, not functional)
- Test approach for EXT-02: unit test `buildConversationPreview` with a mock message that has both `snippet` and a full body, asserting the body text is used

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXT-01 | Unused 5-minute polling interval removed from `useOutreach` hook | Lines 33-37 of `web/src/hooks/useOutreach.js` contain the `setInterval`/`clearInterval` pair to remove |
| EXT-02 | Hardcoded 120-char conversation preview truncation replaced with configurable/appropriate limit | Line 85 of `extension/reply-checker.js` — flip `msg.snippet \|\| extractBody(msg)` to `extractBody(msg) \|\| msg.snippet`; line 283 — fix `slice(0, 120)` in debug log |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies)
| Component | Location | Current State | Change |
|-----------|----------|---------------|--------|
| `useOutreach` hook | `web/src/hooks/useOutreach.js` | Has `setInterval(load, 5*60_000)` + `clearInterval` in useEffect | Remove interval + cleanup |
| `buildConversationPreview` | `extension/reply-checker.js` | `msg.snippet \|\| extractBody(msg)` at line 85 | Flip to `extractBody(msg) \|\| msg.snippet` |
| Debug log in `checkReplies` | `extension/reply-checker.js` line 283 | `conversationPreview?.slice(0, 120)` | Update/remove |

No npm installs required. No new files in extension or web app.

### Test Framework
Both project-level tests and extension-local tests use **Node.js built-in test runner** (`node:test` + `node:assert/strict`). No external test library (Jest, Vitest, Mocha) is used anywhere in this project.

Extension tests live alongside source files: `extension/classifier.test.js`, `extension/text-utils.test.js`.

**Installation:** None needed — `node:test` is built-in.

## Architecture Patterns

### Pattern 1: useEffect with a single mount fetch (post-EXT-01)
**What:** `useEffect` fires `load()` once on mount, no interval, cleanup function can be dropped entirely.
**When to use:** When optimistic mutations cover all client-state updates and no background sync is needed.

```javascript
// After EXT-01 — web/src/hooks/useOutreach.js
useEffect(() => {
  load();
}, [load]);
```

The entire `const poll = setInterval(load, 5 * 60_000)` line and the `return () => { clearInterval(poll); }` block are deleted. The `return` statement in useEffect is not required when there is no cleanup to perform.

### Pattern 2: extractBody-first message text (post-EXT-02)
**What:** Prefer full decoded body over Gmail's truncated snippet.
**When to use:** Whenever building a display preview from a Gmail thread message.

```javascript
// After EXT-02 — extension/reply-checker.js buildConversationPreview
const raw = (extractBody(msg) || msg.snippet || '').replace(/\s+/g, ' ').trim();
```

`extractBody` already has a `|| message.snippet || ''` fallback of its own (line 61 of current source), so the outer expression will always yield a string even when both body and snippet are absent.

### Pattern 3: Node built-in test for extension modules
**What:** Import the pure function under test directly; no DOM or browser environment needed because `buildConversationPreview` and its helpers are pure data transformers.
**When to use:** Any module in `extension/` that does not call Chrome APIs.

```javascript
// extension/reply-checker.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// import the function to test — requires it to be exported
```

**Important:** `buildConversationPreview` is currently NOT exported. It must be exported (or the test must be added to the same file via a re-export shim) before it can be unit-tested. The planner must include an export step.

### Anti-Patterns to Avoid
- **Replacing the interval with a visibilitychange listener:** explicitly out of scope per CONTEXT.md. Optimistic mutations are sufficient.
- **Changing the `slice(0, 300)` per-message cap:** the cap is correct and intentional — only the snippet-vs-body priority is wrong.
- **Touching `web/src/components/Sidebar.jsx`:** no display changes needed; the `max-h-72 overflow-y-auto` container already handles long content.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Base64url decode | Custom atob wrapper | `decodeBase64Url` already exists in `reply-checker.js` |
| Gmail body extraction | New parser | `extractBody` already exists in `reply-checker.js` |
| Test runner | Jest/Vitest setup | `node:test` — already used by all other extension tests |

## Common Pitfalls

### Pitfall 1: Forgetting to export `buildConversationPreview`
**What goes wrong:** Test file imports the function but gets `undefined` because the function is not exported.
**Why it happens:** The function is currently a module-internal helper — it was never needed outside `reply-checker.js`.
**How to avoid:** Add `export` keyword to `function buildConversationPreview(thread)` declaration, or use a named re-export at the bottom of the file. Verify the export with a passing import in the test file.
**Warning signs:** `TypeError: buildConversationPreview is not a function` at test runtime.

### Pitfall 2: Leaving the `return` cleanup in useEffect after removing the interval
**What goes wrong:** Harmless but creates dead code — a `return () => {}` (empty function) with no `clearInterval` call.
**How to avoid:** Remove both the `const poll = setInterval(...)` line AND the entire `return () => { clearInterval(poll); }` block. The `useEffect` callback body becomes just `load();`.

### Pitfall 3: Assuming `extractBody` never returns empty string
**What goes wrong:** If a message has no `text/plain`, no `text/html`, no top-level body data, and no `snippet`, `extractBody` returns `''`. The outer `||` chain must still fall back to `msg.snippet`.
**How to avoid:** Use `(extractBody(msg) || msg.snippet || '')` — the triple-fallback pattern. `extractBody` already ends with `return message.snippet || ''` (line 61), so the outer `msg.snippet` fallback is truly belt-and-suspenders, but it is harmless and documents intent.

### Pitfall 4: Root-level test command glob ordering
**What goes wrong:** The root `package.json` test script is `node --test --test-concurrency=1 extension/*.test.js web/src/**/*.test.js server/*.test.js`. A new `extension/reply-checker.test.js` will be picked up automatically by `extension/*.test.js` — no script change is needed.
**Warning signs:** If test is not found, verify the filename ends in `.test.js` and lives in `extension/`.

### Pitfall 5: Debug log line 283 — cosmetic vs. functional
**What goes wrong:** The log line `log.debug(\`Conversation preview (${thread.messages?.length} msgs): ${JSON.stringify(conversationPreview?.slice(0, 120))}\`)` only truncates the LOG OUTPUT, not the stored value. It is not a functional bug, but it misleads future readers.
**How to avoid:** Update the slice to 300 or remove the slice entirely (the full preview is safe to log at DEBUG level). Per CONTEXT.md this is Claude's discretion.

## Code Examples

Verified from source code audit:

### EXT-01: useEffect after change
```javascript
// web/src/hooks/useOutreach.js — lines 30-38 become:
useEffect(() => {
  load();
}, [load]);
```

### EXT-02: buildConversationPreview inner map after change
```javascript
// extension/reply-checker.js — line 85 only
const raw = (extractBody(msg) || msg.snippet || '').replace(/\s+/g, ' ').trim();
```

### EXT-02: export declaration
```javascript
// extension/reply-checker.js — line 75
export function buildConversationPreview(thread) {
```

### EXT-02: debug log after change (discretion: update slice)
```javascript
// extension/reply-checker.js — line 283
log.debug(`Conversation preview (${thread.messages?.length} msgs): ${JSON.stringify(conversationPreview?.slice(0, 300))}`);
```

### EXT-02: minimal test skeleton
```javascript
// extension/reply-checker.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationPreview } from './reply-checker.js';

describe('buildConversationPreview', () => {
  it('uses extractBody over snippet when body is available', () => {
    const bodyText = 'Full body text that is longer than 120 characters and would be truncated if snippet were used instead of the decoded body payload.';
    const msg = {
      labelIds: ['INBOX'],
      payload: {
        headers: [{ name: 'From', value: 'Alice <alice@example.com>' }],
        mimeType: 'text/plain',
        body: { data: btoa(bodyText) }  // base64-encoded body
      },
      snippet: bodyText.slice(0, 120)   // Gmail-style truncated snippet
    };
    const thread = { messages: [msg] };
    const preview = buildConversationPreview(thread);
    // Should contain more than the snippet length
    assert.ok(preview.length > 120, `preview should exceed 120 chars, got: ${preview.length}`);
    assert.ok(preview.includes('Full body text'), 'preview should include body content');
  });

  it('falls back to snippet when body is empty', () => {
    const msg = {
      labelIds: ['SENT'],
      payload: {
        headers: [{ name: 'From', value: 'Me <me@example.com>' }],
        parts: []
      },
      snippet: 'short snippet only'
    };
    const thread = { messages: [msg] };
    const preview = buildConversationPreview(thread);
    assert.ok(preview.includes('short snippet only'));
  });
});
```

Note on base64 encoding in tests: `btoa()` is available in Node.js 16+. For the test to work with the actual `decodeBase64Url` function, the base64url encoding must use `-` and `_` instead of `+` and `/`. For test purposes, using plain ASCII text that does not require percent-encoding simplifies this. Alternatively mock `extractBody` if the encoding complexity is unwanted.

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `msg.snippet \|\| extractBody(msg)` | `extractBody(msg) \|\| msg.snippet` | Gmail snippet always wins in old code; body never reached |
| `setInterval` safety-net poll | No interval | Optimistic mutations render polling redundant |

## Open Questions

1. **`btoa` encoding for test fixture**
   - What we know: `decodeBase64Url` uses standard base64url alphabet (`-` and `_`). `btoa` produces standard base64 (`+` and `/`).
   - What's unclear: Whether a plain ASCII test string short enough to avoid `+`/`/` characters in base64 output is sufficient for the test, or whether the test should mock `extractBody` directly.
   - Recommendation: Use a test string whose base64 encoding contains no `+` or `/` characters (short ASCII strings often satisfy this), OR structure the test to call `extractBody` through a message with a `text/plain` part using proper base64url encoding. Alternatively, test at the `extractBody` level separately and test `buildConversationPreview` with a mocked/stubbed `extractBody`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (v18+) |
| Config file | None — invoked directly via CLI |
| Quick run command | `node --test extension/*.test.js` |
| Full suite command | `node --test --test-concurrency=1 extension/*.test.js web/src/**/*.test.js server/*.test.js` (root `npm test`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-01 | `useOutreach` useEffect body contains no `setInterval` call | unit (code review / grep) | `node --test web/src/**/*.test.js` | ❌ Wave 0 — no useOutreach test exists |
| EXT-02 | `buildConversationPreview` uses full body over snippet when body present | unit | `node --test extension/reply-checker.test.js` | ❌ Wave 0 |
| EXT-02 | Falls back to snippet when body is absent | unit | `node --test extension/reply-checker.test.js` | ❌ Wave 0 |

Note on EXT-01: the hook uses React and would require `@testing-library/react` or similar to unit test at runtime. The simpler validation is a grep/code-audit assertion: verify `setInterval` is absent from `useOutreach.js`. If a runtime test is desired, it is a React hook test that requires a DOM environment — that is disproportionate effort for a deletion. Document in plan as manual verification.

### Sampling Rate
- **Per task commit:** `node --test extension/reply-checker.test.js` (EXT-02 only)
- **Per wave merge:** `npm test` from repo root (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `extension/reply-checker.test.js` — covers EXT-02 body-over-snippet and fallback behavior
- [ ] Export `buildConversationPreview` from `reply-checker.js` (prerequisite for the test to import it)

## Sources

### Primary (HIGH confidence)
- Direct source audit: `/Users/aaron/Documents/GitHub/reach/web/src/hooks/useOutreach.js` — confirmed exact lines (33-37) containing setInterval/clearInterval
- Direct source audit: `/Users/aaron/Documents/GitHub/reach/extension/reply-checker.js` — confirmed line 85 `msg.snippet || extractBody(msg)`, line 283 debug log with `slice(0, 120)`
- Direct source audit: `/Users/aaron/Documents/GitHub/reach/extension/classifier.test.js`, `text-utils.test.js` — confirmed `node:test` / `node:assert/strict` pattern used by all extension tests
- `/Users/aaron/Documents/GitHub/reach/package.json` — confirmed root test script glob pattern

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions section — exact implementation decisions locked by user discussion

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — source files read directly; no ambiguity
- Architecture: HIGH — changes are deletions/swaps in existing, well-understood functions
- Pitfalls: HIGH — `buildConversationPreview` export gap verified by reading source; not speculative
- Test approach: MEDIUM — `btoa`/base64url encoding detail for test fixture is a minor open question

**Research date:** 2026-03-17
**Valid until:** Stable — no external dependencies; valid until source files change
