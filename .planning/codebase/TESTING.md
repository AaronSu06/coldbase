# Testing Patterns

**Analysis Date:** 2026-03-12

## Test Framework

**Status:** Not detected

**No test runner configured:**
- No `jest.config.js`, `vitest.config.js`, or similar
- No test scripts in `package.json` (`web` or `server`)
- No test files (`.test.*` or `.spec.*`) present in codebase
- No testing libraries in dependencies (`@testing-library`, `jest`, `vitest`)

**Development setup:**
- `web/package.json`: Scripts are `dev`, `build`, `preview` only
- `server/package.json`: Scripts are `dev`, `start`, `db:migrate` only

## Run Commands

**Web (Vite):**
```bash
npm run dev      # Start dev server (no tests)
npm run build    # Build for production
npm run preview  # Preview production build
```

**Server (Node):**
```bash
npm run dev           # Start server with --watch
npm start            # Start server
npm run db:migrate   # Run Prisma migrations
```

No test execution environment available.

## Test Structure

**Current State:** Zero test coverage

Since there are no tests, test structure and patterns have not been established.

## What IS Being Tested

**Manual/Integration:**
- Chrome extension integration tested via postMessage relay (`relay.js` in content script)
- API endpoints tested via curl/Postman during development
- Database operations tested via Prisma migrations
- UI behavior tested via browser during `npm run dev`

**Automated validation:**
- Zod schemas in backend validate API payloads at runtime
- Client-side state mutations validated by React component behavior (no unit tests)

## Candidates for Testing

**High Priority (untested, critical path):**
- `useOutreach()` hook in `web/src/hooks/useOutreach.js`
  - State mutations (updateStatus, toggleFavorite, toggleArchived, archiveAll)
  - Optimistic updates and rollback on error
  - Auto-save debouncing (800ms delays in Sidebar)

- API client functions in `web/src/lib/api.js`
  - `fetchOutreach()` error handling
  - `patchOutreach()` HTTP error mapping
  - Network failures and recovery

- Thread parsing in `web/src/components/Sidebar.jsx`
  - `parseThread()` HTML entity decoding
  - Thread reconstruction with `[IN]`/`[OUT]` markers
  - Quote stripping with regex

**Medium Priority:**
- Server endpoints in `server/index.js`
  - Status code mapping (409, 404, 500)
  - Prisma error handling (P2002, P2025)
  - Domain suggestion DNS resolution (`/api/suggest-domains`)

- Component rendering (OutreachCard, Sidebar, KanbanBoard)
  - Conditional UI based on state
  - Drag-and-drop state management

**Low Priority (data/utilities):**
- Utility functions in `web/src/lib/utils.js`
  - `getDaysSince()` date math
  - `formatShortDate()` formatting
  - STATUS_COLORS mapping

## Error Scenarios NOT Covered

**Network:**
- API timeout (12s limit set in App.js but not tested)
- Malformed JSON responses
- DNS resolution failures for domain suggestions
- Partial failures in Promise.allSettled() in /api/suggest-domains

**State:**
- Concurrent mutations (e.g., two simultaneous status changes)
- Stale data after visibility-change re-fetch
- Notes auto-save race conditions (debounce at 800ms)

**Data:**
- Invalid thread formats (missing markers, malformed HTML)
- Empty message threads
- HTML entity edge cases in email parsing

**UI:**
- Keyboard navigation (currently mouse/touch only)
- Accessibility (no ARIA testing)
- Mobile viewport behavior
- High-volume card rendering (100+ cards in column)

## Recommended First Tests

**Unit tests for `useOutreach.js`:**
```javascript
// Example structure (not implemented):
describe('useOutreach', () => {
  it('should initialize with empty records', () => { ... });
  it('should update status optimistically', () => { ... });
  it('should rollback on API error', () => { ... });
  it('should auto-poll every 5 minutes', () => { ... });
  it('should debounce notes saves at 800ms', () => { ... });
});
```

**Integration tests for API client:**
```javascript
describe('fetchOutreach', () => {
  it('should return records array', () => { ... });
  it('should throw on network error', () => { ... });
  it('should handle 5xx responses', () => { ... });
});
```

**Thread parsing tests:**
```javascript
describe('parseThread', () => {
  it('should decode HTML entities', () => { ... });
  it('should split [IN]/[OUT] markers', () => { ... });
  it('should strip quoted text', () => { ... });
  it('should handle empty threads', () => { ... });
});
```

## Test Infrastructure Gaps

**Missing tools:**
- No test runner (need Vitest for React/Node, or Jest)
- No mocking library (need Vitest/Jest built-in mocks or MSW for HTTP)
- No React component testing library
- No E2E framework (Playwright, Cypress)

**Suggested setup:**
1. Install Vitest: `npm install -D vitest @vitest/ui`
2. Install testing-library: `npm install -D @testing-library/react @testing-library/dom`
3. Create `web/vitest.config.js`
4. Add test script: `"test": "vitest"` in package.json
5. Create `web/src/**/*.test.jsx` files

## Chrome Extension Testing

**Not automated:**
- Extension relay (`relay.js` in content script) tested manually
- postMessage bridge between webpage and extension popup not unit tested
- Extension permissions (`<all_urls>`, Gmail access) not validated

**Extension-specific concerns:**
- Message timeout (12 seconds in App.js) is hardcoded — no tests for timeout behavior
- RECHECK_REPLIES fire-and-forget call can silently fail without error handling
- No validation that relay.js is loaded before postMessage calls

---

*Testing analysis: 2026-03-12*
