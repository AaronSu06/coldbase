# Phase 2: Database and Quick Fixes - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the SQLite schema with performance indices and a foreign key cascade constraint; prevent dev.db files from being accidentally committed; fix the bracket company name extraction bug in classifier.js. No UI changes, no new API endpoints, no behavior changes visible to users.

</domain>

<decisions>
## Implementation Decisions

### Migration strategy
- Use `prisma migrate dev` — creates a migration file in `prisma/migrations/` with timestamp + description
- Migration is run as part of the plan tasks (not left as a manual step)
- Apply migration to the existing `server/dev.db` — preserves existing data, adds indices and FK constraint

### gitignore scope
- Add `*.db` globally to root `.gitignore` — blocks any SQLite file anywhere in the repo, future-proof
- Delete the root-level `dev.db` file entirely (it's unused; the real dev.db lives at `server/../dev.db` per schema.prisma url)
- Root `.gitignore` gets the rule (not a nested .gitignore)

### FK schema design
- Add `@relation` from `OpenEvent.trackingId` to `TrackingPixel.trackingId` with `onDelete: Cascade`
- This is the standard Prisma FK pattern — no user decision needed here, implement per DB-02 spec

### Bug fix
- Fix `extractCompanyFromText()` in `extension/classifier.js` so `[Stripe] Internship` returns `Stripe` (no trailing bracket)
- Claude's discretion on exact regex fix — the requirement is clear, implementation is technical

### Claude's Discretion
- Exact migration name/description string
- Whether to add `@@index` as separate block or inline — follow Prisma convention
- Regex fix approach for BUG-01

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/prisma/schema.prisma`: `Outreach` model (add `@@index`), `TrackingPixel` + `OpenEvent` models (add FK relation)
- `extension/classifier.js`: `extractCompanyFromText()` function at line 116 — bracket regex at line 118

### Established Patterns
- Schema lives at `server/prisma/schema.prisma`; `dev.db` is created at `server/../dev.db` (one level up from prisma dir, i.e. `server/dev.db`)
- Root `.gitignore` is the single gitignore file — add `*.db` there

### Integration Points
- `prisma migrate dev` must be run from `server/` directory (where `package.json` + `prisma/` live)
- Root `dev.db` is separate from `server/dev.db` — the root one appears to be an accidental artifact

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward schema + gitignore + bug fix phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-database-and-quick-fixes*
*Context gathered: 2026-03-13*
