# Coding Conventions

**Analysis Date:** 2026-03-12

## Naming Patterns

**Files:**
- React components: PascalCase with `.jsx` extension (`OutreachCard.jsx`, `Sidebar.jsx`, `KanbanBoard.jsx`)
- Utilities and hooks: camelCase with `.js` extension (`useOutreach.js`, `utils.js`, `api.js`)
- Icon components: PascalCase + "Icon" suffix (`HeartIcon.jsx`, `ChatIcon.jsx`, `EyeIcon.jsx`)
- Server files: camelCase with `.js` extension (`emailFinder.js`, `index.js`)

**Functions:**
- React components: PascalCase (exported as default)
- Helper functions: camelCase (`buildColumns`, `loadOrder`, `saveOrder`, `parseThread`, `decodeHtmlEntities`, `normalizeStatus`)
- Event handlers: `handle` prefix + action name (`handleRefresh`, `handleArchiveAll`, `handleDelete`, `handleFeedback`)
- Callbacks passed as props: `on` prefix + action name (`onCardClick`, `onStatusChange`, `onToggleFavorite`, `onClose`)

**Variables:**
- Local state: camelCase (`isOpen`, `selectedRecord`, `isRefreshing`, `showEmptySearch`)
- Boolean flags: `is`/`has` prefix (`isGhosted`, `isDragging`, `isMobile`, `hasMarkers`)
- Collections: singular or plural as appropriate (`records`, `columns`, `messages`, `filtered`)
- Constants exported: UPPER_SNAKE_CASE (`COLUMNS`, `STORAGE_KEY`, `STATUS_COLORS`, `TIPS`, `STEPPER_STEPS`)

**Types:**
- No explicit TypeScript. Data shapes follow database schema (see Prisma models)
- Record object shape: `{ threadId, company, contactName, subject, status, favorite, archived, sentDate, notes, nextActionDate, ... }`

## Code Style

**Formatting:**
- No explicit linter configured (no ESLint config found)
- File uses tab-width 2 spaces (inferred from package.json scripts)
- No Prettier config, but code follows consistent patterns
- JSX formatting: Components span multiple lines with readable nesting

**Imports Organization:**
- React imports first: `import { useState, useMemo, useEffect } from 'react'`
- Library imports next: `import { DndContext, ... } from '@dnd-kit/core'`
- Local component imports: `import OutreachCard from './OutreachCard'`
- Utility/hook imports: `import { useOutreach } from './hooks/useOutreach'`
- Constants: `import { COLUMNS } from '@shared/constants'`
- Then utility functions: `import { formatShortDate, STATUS_COLORS } from './lib/utils'`

**Path Aliases:**
- `@shared` → `../shared` (configured in `vite.config.js`)
- Used for shared constants: `import { COLUMNS } from '@shared/constants'`

## Error Handling

**Pattern:**
- `.catch()` with console.error logging: `catch(e => console.error('[Reach] Failed to fetch records:', e.message))`
- Error context in logs: Prefix with `[Reach]` tag for all client errors
- API errors: Return error message in JSON response: `res.status(500).json({ error: e.message })`
- Prisma errors: Check specific error codes (e.g., `P2002`, `P2025`) for unique constraint or not-found errors

**Example from `useOutreach.js`:**
```javascript
const load = useCallback(() => {
  fetchOutreach()
    .then(data => setRecords(normalizeRecords(data)))
    .catch(e => console.error('[Reach] Failed to fetch records:', e.message));
}, []);
```

**Server error handling in `index.js`:**
- Non-fatal errors in tracking: swallow and continue (`.catch(() => {})`)
- Prisma constraint violations: map to specific HTTP status codes (409 for duplicate, 404 for not found)

## Logging

**Framework:** `console.error()` for errors, `console.log()` for server startup

**Patterns:**
- Always log errors: `console.error('[Reach] [context]:', e.message)`
- Minimal context logging: Only log on startup or errors, not verbose request logging
- No structured logging library (Winston, Pino) — raw console only

**Example:**
```javascript
console.error('[Reach] /api/find-email error:', e.message);
console.log(`[Reach server] Listening on http://localhost:${PORT}`);
```

## Comments

**When to Comment:**
- Mark section breaks with ASCII art separators: `// ── Status Stepper ──`
- Explain non-obvious logic like thread parsing or drag-drop collision detection
- Document business logic: `// Fire-and-forget RECHECK_REPLIES via relay.js`
- Minimal inline comments; prefer clear function/variable names

**Style:**
- Section headers use dashes: `// ── Section Name ─────────────────────`
- Inline comments: `// comment after code`
- Multi-line logic blocks get brief comments before the block

**Example from `Sidebar.jsx`:**
```javascript
// Flush unsaved notes when the sidebar closes or switches to a different record.
useEffect(() => {
  return () => {
    const { notes, record } = latestRef.current;
    if (!record) return;
    if (notes !== (record.notes || '')) onUpdateRecord(record.threadId, { notes });
  };
}, [record?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps
```

## Function Design

**Size:**
- Components typically 200-650 lines including JSX
- Utility functions 10-30 lines
- Helper functions 5-20 lines

**Parameters:**
- React components destructure props: `function OutreachCard({ record, onCardClick, onToggleFavorite })`
- Callbacks passed as props with `on` prefix
- API functions use objects for multiple params: `{ company, firstName, lastName, domain }`

**Return Values:**
- Components return JSX
- Hooks return objects or arrays: `return { records, refresh, updateStatus, ... }`
- Utilities return data or functions
- React hooks use early returns to guard conditions

## Module Design

**Exports:**
- Default export for React components: `export default function ComponentName() { ... }`
- Named exports for utilities: `export const formatShortDate = (...) => { ... }`
- Hooks exported as named: `export function useOutreach() { ... }`

**File structure:**
- One component per file (e.g., `OutreachCard.jsx` contains `OutreachCard` + helper `PersonIcon`)
- Icons colocated in `components/icons/` directory
- Utilities split: `lib/utils.js`, `lib/api.js`, `lib/gemini.js`
- Hooks in `hooks/` directory: `useOutreach.js`

**Server endpoints:**
- All routes in single `index.js` file (Express app)
- Route handlers defined inline
- Shared middleware at top: `requireSecret`, CORS, JSON parsing

## Tailwind CSS Usage

**Classes:**
- Utility-first: compose Tailwind classes directly in JSX
- Custom colors: `text-[#0a0a0a]` (inline hex), `bg-indigo-50`
- Responsive: Limited use (not a mobile-first codebase)
- Transitions: `transition-all duration-150`, `transition-colors`

**Pattern:**
```javascript
className="px-3 py-1.5 rounded-md text-gray-600 hover:text-[#0a0a0a] hover:bg-gray-100 transition-colors font-medium"
```

## React Patterns

**Hooks:**
- `useState` for local component state
- `useEffect` for side effects with dependency arrays
- `useMemo` for expensive computations and filtered lists
- `useCallback` for event handlers and callbacks passed to children
- `useRef` for persisting values across renders without triggering re-renders

**Optimization:**
- `memo()` with custom `areEqual` function for component comparison (see `OutreachCard`)
- Avoid inline object/function creation in JSX
- Use dependency arrays to prevent unnecessary re-renders

**Example from `OutreachCard.jsx`:**
```javascript
function areEqual(prev, next) {
  return (
    prev.record.threadId    === next.record.threadId    &&
    prev.record.company     === next.record.company     &&
    // ... more field checks
  );
}

export default memo(OutreachCard, areEqual);
```

**State management:**
- Local component state with `useState`
- Context-like state via custom hooks (e.g., `useOutreach` manages global records)
- No Redux, no Zustand — single hook provides all mutations

**Optimistic updates:**
- Update UI immediately on user action
- Persist to server in background
- Revert on error: see `updateRecord` in `useOutreach.js`

---

*Convention analysis: 2026-03-12*
