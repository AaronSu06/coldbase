# Phase 11: Extension Cleanup - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove dead polling interval from the `useOutreach` hook and fix conversation preview truncation caused by Gmail's naturally short `msg.snippet`. No new features — two targeted cleanup fixes.

</domain>

<decisions>
## Implementation Decisions

### Polling removal (EXT-01)
- Remove `setInterval(load, 5 * 60_000)` and its `clearInterval` cleanup from `useOutreach`'s `useEffect`
- Keep `load()` call on mount — initial data fetch is correct behavior
- No replacement interval or visibility-based refresh — optimistic mutations keep UI in sync; no sync gap exists between extension background writes and web app state
- `refresh: load` stays in the hook's return value (manual trigger, already used by callers)

### Preview fix strategy (EXT-02)
- In `buildConversationPreview` (extension/reply-checker.js), flip the text source priority from `msg.snippet || extractBody(msg)` to `extractBody(msg) || msg.snippet`
- Rationale: Gmail always provides `msg.snippet` (~100-120 chars truncated by Gmail's API), so `extractBody` was never reached — full email body text was silently ignored
- Keep the existing `slice(0, 300)` per-message cap — 300 chars is an appropriate display limit
- Remove or fix the debug log `conversationPreview?.slice(0, 120)` — it only shows 120 chars of the preview in logs, not a functional cap, but should be updated to reflect the longer expected preview

### Preview display (web sidebar)
- No changes to web/src/components/Sidebar.jsx display logic
- Existing collapsed view (last 2 messages) + "Show full thread" expand button is correct
- `max-h-72 overflow-y-auto` CSS on the expanded view handles long content adequately
- No line-clamp or other truncation changes needed

### Claude's Discretion
- Whether to update or remove the `slice(0, 120)` in the debug log (just logging, not functional)
- Test approach for EXT-02: unit test `buildConversationPreview` with a mock message that has both `snippet` and a full body, asserting the body text is used

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extractBody(msg)`: Already exists in `reply-checker.js` — decodes Gmail API message payload to plain text. Used as fallback today; will become primary source.
- `useOutreach` returns `refresh: load` — no API change, callers unaffected.

### Established Patterns
- Optimistic mutations: all `setRecords` + `patchOutreach` calls in `useOutreach` keep client state current without server refetch
- `buildConversationPreview` already slices last 4 messages and caps each at 300 chars — the slice(0, 300) pattern stays

### Integration Points
- `web/src/hooks/useOutreach.js` — EXT-01 change (remove interval)
- `extension/reply-checker.js` — EXT-02 change (flip extractBody priority)
- No changes to: `server/`, `extension/sidebar.js`, `web/src/components/Sidebar.jsx`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — both fixes are well-defined cleanups. Standard approach appropriate.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-extension-cleanup*
*Context gathered: 2026-03-18*
