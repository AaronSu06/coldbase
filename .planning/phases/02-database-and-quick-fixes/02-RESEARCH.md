# Phase 2: Database and Quick Fixes - Research

**Researched:** 2026-03-13
**Domain:** Prisma SQLite schema migrations, .gitignore management, regex bug fix
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Migration strategy: Use `prisma migrate dev` — creates a migration file in `prisma/migrations/` with timestamp + description
- Migration is run as part of the plan tasks (not left as a manual step)
- Apply migration to the existing `server/dev.db` — preserves existing data, adds indices and FK constraint
- gitignore scope: Add `*.db` globally to root `.gitignore` — blocks any SQLite file anywhere in the repo, future-proof
- Delete the root-level `dev.db` file entirely (it is unused; the real dev.db lives at `server/../dev.db` per schema.prisma url)
- Root `.gitignore` gets the rule (not a nested .gitignore)
- FK schema design: Add `@relation` from `OpenEvent.trackingId` to `TrackingPixel.trackingId` with `onDelete: Cascade`
- This is the standard Prisma FK pattern — implement per DB-02 spec
- Bug fix: Fix `extractCompanyFromText()` in `extension/classifier.js` so `[Stripe] Internship` returns `Stripe` (no trailing bracket)

### Claude's Discretion
- Exact migration name/description string
- Whether to add `@@index` as separate block or inline — follow Prisma convention
- Regex fix approach for BUG-01

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DB-01 | Prisma schema adds `@@index` directives on `status`, `sentDate`, and `archived` fields in `Outreach` model | Prisma `@@index` block syntax confirmed; `prisma migrate dev` generates the SQL `CREATE INDEX` statements |
| DB-02 | `OpenEvent` model adds `@relation` to `TrackingPixel` with `onDelete: Cascade` foreign key constraint | Prisma FK + onDelete cascade syntax confirmed; SQLite FK support confirmed via Prisma |
| DB-03 | `*.db` added to `.gitignore`; empty root-level `dev.db` file removed from working tree | Root `.gitignore` identified (no `*.db` line present); `server/dev.db` is tracked in git and must be untracked |
| BUG-01 | Company name extraction fixed to handle bracket format — `[Stripe] Internship` correctly extracts `Stripe` not `Stripe]` | Code at classifier.js line 118 analyzed; bug is in the bracket regex not present — the regex `\[([A-Z][A-Za-z0-9. ]+)\]` is actually correct; see Bug Analysis section for the real bug location |
</phase_requirements>

---

## Summary

Phase 2 is a contained, low-risk schema hardening and bug fix phase. It touches four independent concerns: adding query-performance indices to the `Outreach` model, enforcing a foreign key cascade between `OpenEvent` and `TrackingPixel`, preventing SQLite database files from being committed, and fixing a bracket company-name extraction bug.

The Prisma 5 migration workflow is well-established. The project already has five applied migrations; the new migration slots in cleanly. SQLite foreign key cascade is fully supported by Prisma 5 via the `onDelete: Cascade` relation modifier, but requires that SQLite `PRAGMA foreign_keys = ON` is enforced at runtime — Prisma handles this automatically for its own queries.

The bug in `extractCompanyFromText()` requires careful analysis. The bracket regex at line 118 is `\[([A-Z][A-Za-z0-9. ]+)\]` which uses a capture group — it already captures only the interior, so `bracketMatch[1]` should be `Stripe`, not `Stripe]`. The reported failure (`Stripe]` returned) suggests the bug may be in a different call site that uses `bracketMatch[0]` (full match) instead of `bracketMatch[1]` (capture group), or the function is not being called at all and a fallback path is running. The planner must task an investigation step before prescribing the fix.

**Primary recommendation:** Four tasks, one per requirement. Run `prisma migrate dev` from `server/`; untrack `server/dev.db` with `git rm --cached`; delete root `dev.db`; add `*.db` to root `.gitignore`; investigate and fix the BUG-01 caller chain before committing the regex fix.

---

## Bug Analysis: BUG-01

This is the most important finding in the research. The code was read directly from `extension/classifier.js`.

### Current regex at line 118
```javascript
const bracketMatch = subject.match(/\[([A-Z][A-Za-z0-9. ]+)\]/);
if (bracketMatch) {
  const name = bracketMatch[1].trim();
  ...
}
```

The regex has a capture group `([A-Z][A-Za-z0-9. ]+)`. For input `[Stripe] Internship`:
- `bracketMatch[0]` = `[Stripe]`
- `bracketMatch[1]` = `Stripe`

`bracketMatch[1].trim()` = `Stripe` — this is correct.

### Why the bug might still exist

Two possible explanations:

1. **The caller passes the wrong argument.** `extractCompanyFromText(subject, body)` receives subject as first arg. If the call site passes the body as subject or concatenates them incorrectly, the bracket match would fail to find `[Stripe]` in a different string position.

2. **An older code version had `bracketMatch[0]`** and the fix has already been partially applied, but the test was never written. The requirement TEST-01 (Phase 5) calls out bracket format as a specific edge case to test.

3. **The regex character class `[A-Za-z0-9. ]`** does not include `]` — this is correct. But if the company name contains characters outside this class (e.g. `[Stripe, Inc]`), the match would fail entirely and a less reliable fallback path would produce a wrong result.

### Research conclusion

The regex itself appears correct for the simple `[Stripe]` case. The planner should task: (a) write a unit test first that demonstrates the failure, then (b) fix whatever causes the failure. Claude's discretion on the exact fix is appropriate here.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^5 (already installed) | ORM + migration CLI | Already in use; `prisma migrate dev` is the locked strategy |
| SQLite | bundled with Prisma | Database engine | Already in use; no change |

### No new dependencies needed

All changes in this phase are schema edits, file operations, and a JS bug fix. No new packages are required.

---

## Architecture Patterns

### Prisma Index Pattern (DB-01)

Indices in Prisma are declared as `@@index` block attributes at the bottom of the model, after field definitions. This is the conventional placement.

```prisma
// Source: Prisma official docs — schema reference
model Outreach {
  // ... existing fields ...
  status    String   @default("Sent")
  sentDate  DateTime
  archived  Boolean  @default(false)

  @@index([status])
  @@index([sentDate])
  @@index([archived])
}
```

A single composite index `@@index([status, archived])` is an alternative but three separate indices is the conventional approach when queries filter on individual fields independently. Given the existing query patterns (filter by status OR filter by archived, not always together), separate indices are appropriate.

### Prisma Foreign Key + Cascade Pattern (DB-02)

SQLite FK cascade requires adding both a `@relation` field and a relation scalar field on `OpenEvent`. The `TrackingPixel` side needs a relation back-reference.

```prisma
// Source: Prisma official docs — relations + onDelete
model TrackingPixel {
  id         String      @id @default(cuid())
  threadId   String
  trackingId String      @unique
  createdAt  DateTime    @default(now())
  openEvents OpenEvent[]
}

model OpenEvent {
  id            String        @id @default(cuid())
  trackingId    String
  openedAt      DateTime      @default(now())
  userAgent     String?
  ipAddress     String?
  trackingPixel TrackingPixel @relation(fields: [trackingId], references: [trackingId], onDelete: Cascade)
}
```

**Critical detail:** Prisma requires both sides of the relation to be declared. `TrackingPixel` must have a `openEvents OpenEvent[]` field even if it is never queried — Prisma's type system requires it.

**Critical detail for SQLite:** Prisma enables `PRAGMA foreign_keys = ON` per-connection for its own queries. However, if any other tool connects directly to the SQLite file (e.g., DB Browser for SQLite), FK enforcement is NOT automatic. For this project (Prisma-only access), cascade will work correctly.

### Prisma migrate dev workflow

```bash
# Run from server/ directory (where prisma/ and package.json live)
cd server
npx prisma migrate dev --name add_indices_and_fk_cascade
```

This command:
1. Detects schema changes vs. applied migrations
2. Generates a new timestamped migration file under `prisma/migrations/`
3. Applies the migration to `server/dev.db` (preserving existing data)
4. Regenerates the Prisma Client

The project's `package.json` `db:migrate` script already maps to `prisma migrate dev`, so `npm run db:migrate` from `server/` also works.

### gitignore Pattern (DB-03)

The root `.gitignore` currently does NOT contain any `*.db` rule. The file `server/dev.db` is currently tracked by git (confirmed via `git ls-files`). The root `dev.db` file exists on disk but was not found in `git ls-files` output — it appears to be untracked already.

**Required steps:**
1. Add `*.db` to root `.gitignore`
2. Run `git rm --cached server/dev.db` to stop tracking it without deleting it
3. Delete the root `dev.db` file (`rm dev.db`) — it is an artifact, not used

**Order matters:** Add the `.gitignore` rule first, then untrack. Otherwise git may re-add the file on next `git add`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FK cascade on delete | Custom trigger or application-layer cleanup loop | Prisma `onDelete: Cascade` in schema | Prisma generates correct SQL; handles PRAGMA foreign_keys for SQLite; atomic |
| Index creation SQL | Raw `CREATE INDEX` in migration | Prisma `@@index` in schema.prisma | Prisma generates the SQL; migration is versioned and reproducible |
| Untracking files from git | Manual `.git/index` manipulation | `git rm --cached <file>` | Standard git command; safe and reversible |

---

## Common Pitfalls

### Pitfall 1: Missing back-reference on TrackingPixel
**What goes wrong:** Prisma validation fails with "Error: Relation field `trackingPixel` on model `OpenEvent` is missing an opposite relation field on model `TrackingPixel`."
**Why it happens:** Prisma requires both sides of a relation to be declared in the schema.
**How to avoid:** Add `openEvents OpenEvent[]` to `TrackingPixel` when adding the `@relation` to `OpenEvent`.
**Warning signs:** `prisma migrate dev` errors before generating the migration file.

### Pitfall 2: Forgetting to run `prisma generate` after schema change
**What goes wrong:** The Prisma Client types don't include the new relation fields; TypeScript (or runtime) errors on `.openEvents`.
**Why it happens:** `prisma migrate dev` runs generate automatically, but if someone edits the schema without running migrate, the client is stale.
**How to avoid:** Always use `prisma migrate dev` (not manual SQL edits). The `postinstall` script handles it on `npm install`.
**Warning signs:** Runtime errors accessing relation fields that exist in schema but not in generated client.

### Pitfall 3: server/dev.db remains tracked after adding .gitignore rule
**What goes wrong:** `git status` still shows `server/dev.db` as modified; the .gitignore rule is ignored for already-tracked files.
**Why it happens:** `.gitignore` only prevents untracked files from being added. Already-tracked files must be explicitly removed from the index.
**How to avoid:** After adding `*.db` to `.gitignore`, run `git rm --cached server/dev.db`.
**Warning signs:** `git status` shows `server/dev.db` in "Changes not staged for commit" after editing it.

### Pitfall 4: Wrong migration name causes future confusion
**What goes wrong:** Migration file named generically makes the history hard to scan.
**Why it happens:** `--name` argument left blank or too vague.
**How to avoid:** Use a descriptive name: `add_outreach_indices_and_open_event_fk`.

### Pitfall 5: Assuming BUG-01 regex is broken without testing
**What goes wrong:** The "fix" changes working code and introduces a regression.
**Why it happens:** The bracket regex at line 118 already uses a capture group and appears correct for simple cases. The actual failure mode may be in the caller.
**How to avoid:** Write a failing test first to reproduce the bug, then fix the actual root cause.

---

## Code Examples

### DB-01: Adding indices to Outreach model
```prisma
// After all field definitions, add these three lines:
@@index([status])
@@index([sentDate])
@@index([archived])
```
These go inside the `model Outreach { }` block, after the last field.

### DB-02: Adding FK relation

On `OpenEvent` model — add the relation field:
```prisma
trackingPixel TrackingPixel @relation(fields: [trackingId], references: [trackingId], onDelete: Cascade)
```

On `TrackingPixel` model — add the back-reference:
```prisma
openEvents OpenEvent[]
```

### DB-03: Untracking server/dev.db
```bash
# From repo root
echo "*.db" >> .gitignore
git rm --cached server/dev.db
rm dev.db
```

### BUG-01: Verifying the bracket extraction
```javascript
// Test case that must pass
extractCompanyFromText('[Stripe] Internship', '') === 'Stripe'
```

The existing regex on line 118:
```javascript
const bracketMatch = subject.match(/\[([A-Z][A-Za-z0-9. ]+)\]/);
```
already captures the interior via group 1. If `bracketMatch[1]` is returning `Stripe]`, the bug is not in this regex — it is either in a call site using `bracketMatch[0]`, or this function is not being reached and a different code path runs.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual FK enforcement in application code | `onDelete: Cascade` in Prisma schema | Prisma 2.0+ | Cascade handled at DB level; no application bugs possible |
| Raw SQL migrations | `prisma migrate dev` | Prisma 1 → 2 | Versioned, reproducible, team-safe |

---

## Open Questions

1. **Root cause of BUG-01**
   - What we know: The regex at `classifier.js:118` uses a capture group; `bracketMatch[1]` should return `Stripe` for `[Stripe] Internship`
   - What's unclear: The exact call site and input that produces `Stripe]` has not been observed directly; no test exists
   - Recommendation: First task should be "write a failing test reproducing BUG-01"; fix follows from what the test reveals

2. **Whether server/dev.db should be committed to git at all**
   - What we know: It is currently tracked; the user decided `*.db` blocks it globally
   - What's unclear: Whether any CI or setup script depends on a pre-committed dev.db
   - Recommendation: The decision is locked (add `*.db` to .gitignore, untrack); no blockers expected given this is a dev-only SQLite file

---

## Validation Architecture

`nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no jest.config, vitest.config, or test directory found |
| Config file | Wave 0 must create one |
| Quick run command | `node --test extension/classifier.test.js` (Node built-in test runner, no install needed) OR after Wave 0 setup |
| Full suite command | same (only one test file in this phase) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-01 | Prisma schema has `@@index` on status, sentDate, archived | smoke | `grep -c "@@index" server/prisma/schema.prisma` (returns 3) | ❌ Wave 0 |
| DB-02 | Deleting TrackingPixel cascades OpenEvent records | manual/smoke | `node server/scripts/test-cascade.js` (if created) | ❌ Wave 0 |
| DB-03 | `git ls-files "*.db"` returns empty | smoke | `git ls-files "*.db"` | ❌ Wave 0 |
| BUG-01 | `extractCompanyFromText('[Stripe] Internship', '')` returns `'Stripe'` | unit | `node --test extension/classifier.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test extension/classifier.test.js` (BUG-01 unit test only)
- **Per wave merge:** Full suite — all smoke checks + unit test
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `extension/classifier.test.js` — covers BUG-01 bracket extraction; should also cover other `extractCompanyFromText` patterns
- [ ] Node built-in test runner (`node:test`) requires Node 18+; project uses Node v22.17.0 — no install needed
- [ ] DB-01 and DB-03 validations are shell one-liners, not test files — can be verification commands in the plan rather than a test file
- [ ] DB-02 cascade verification: after migration, can be validated with a manual Prisma script or treated as schema-verified (if schema has `onDelete: Cascade`, Prisma guarantees the SQL)

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `server/prisma/schema.prisma` — current model definitions, no indices, no FK relation
- Direct code read: `extension/classifier.js` — full `extractCompanyFromText()` implementation, lines 116–152
- Direct code read: `server/prisma/migrations/20260308215259_add_open_tracking/migration.sql` — confirmed current migration state; no FK constraint in SQL
- Direct code read: `server/package.json` — Prisma ^5, `db:migrate` script confirmed
- Direct file system: `git ls-files dev.db server/dev.db` — confirms `server/dev.db` is git-tracked; root `dev.db` is untracked

### Secondary (MEDIUM confidence)
- Prisma docs (from knowledge base, Prisma 5 stable): `@@index` block attribute syntax, `@relation` + `onDelete: Cascade` pattern, SQLite FK enforcement behavior

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; Prisma 5 already installed and working
- Architecture: HIGH — patterns read directly from existing migration files and schema
- Pitfalls: HIGH — DB-03 pitfall (tracked file vs .gitignore) and DB-02 pitfall (missing back-reference) are classic Prisma/git issues with well-known solutions; BUG-01 root cause is MEDIUM (requires runtime investigation)
- BUG-01 root cause: MEDIUM — regex analysis is HIGH confidence; actual caller behavior is unverified

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (Prisma 5 is stable; SQLite behavior is stable)
