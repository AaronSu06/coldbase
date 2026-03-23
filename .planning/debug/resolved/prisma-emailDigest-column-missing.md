---
status: resolved
trigger: "Sign-in fails with Prisma error — column `User.emailDigest` does not exist in the current database"
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Focus

hypothesis: confirmed — migration 20260323000000_add_email_digest was recorded in _prisma_migrations with applied_steps_count=0 (never actually executed)
test: deleted corrupt records, ran prisma migrate deploy, verified column and findUnique
expecting: fix is complete pending human sign-in verification
next_action: await human confirmation that sign-in works

## Symptoms

expected: User can sign in successfully
actual: Sign-in fails with: "Invalid `prisma.user.findUnique()` invocation: The column `User.emailDigest` does not exist in the current database."
errors: Invalid `prisma.user.findUnique()` invocation: The column `User.emailDigest` does not exist in the current database.
reproduction: Attempt to sign in on main branch
started: After commit "chore: merge main — keep emailDigest + isAdmin, add generateFeedback export"

## Eliminated

- hypothesis: Migration file doesn't exist or has wrong SQL
  evidence: server/prisma/migrations/20260323000000_add_email_digest/migration.sql exists with correct ALTER TABLE statement
  timestamp: 2026-03-23

- hypothesis: Prisma client not regenerated with emailDigest field
  evidence: node_modules/.prisma/client/index.js contains emailDigest in schema and runtime data model; prisma generate ran cleanly
  timestamp: 2026-03-23

- hypothesis: Migration simply hadn't been run yet
  evidence: prisma migrate status reported "Database schema is up to date!" — but this was wrong because _prisma_migrations had the row with finished_at set
  timestamp: 2026-03-23

## Evidence

- timestamp: 2026-03-23
  checked: server/prisma/schema.prisma
  found: emailDigest String @default("weekly") present in User model at line 16
  implication: Schema is correct; problem is not in the schema file

- timestamp: 2026-03-23
  checked: server/prisma/migrations/ directory
  found: 7 migrations including 20260323000000_add_email_digest
  implication: Migration file exists with correct SQL

- timestamp: 2026-03-23
  checked: actual DB columns via information_schema.columns query
  found: emailDigest column NOT present; columns were: id, email, passwordHash, createdAt, updatedAt, plan, lookupsResetAt, lookupsUsedThisMonth, resumeName, resumeText, isAdmin
  implication: Confirmed — column missing from DB despite migration appearing to exist

- timestamp: 2026-03-23
  checked: _prisma_migrations table for add_email_digest entry
  found: TWO rows for 20260323000000_add_email_digest — one with applied_steps_count=0 and finished_at=NULL, one with applied_steps_count=0 and finished_at=2026-03-23T18:52:32Z
  implication: ROOT CAUSE — migration was recorded as applied but applied_steps_count=0 means no SQL was executed. Prisma migrate status reads the row existence and considers it done, but the DDL never ran.

- timestamp: 2026-03-23
  checked: Fix applied — deleted both corrupt _prisma_migrations rows, ran `npx prisma migrate deploy`
  found: Migration applied successfully; emailDigest column now present; prisma.user.findUnique() works without error
  implication: Fix confirmed at DB level

## Resolution

root_cause: The migration 20260323000000_add_email_digest was inserted into the _prisma_migrations tracking table (likely from a failed or interrupted migrate run) with applied_steps_count=0, meaning the ALTER TABLE SQL never executed against the database. Prisma migrate status treated the row's existence as "applied" and reported the schema as up to date, masking the real state.

fix: Deleted the two corrupt _prisma_migrations rows for 20260323000000_add_email_digest, then ran `npx prisma migrate deploy` from server/ which successfully applied the migration and added the emailDigest column.

verification: Confirmed via information_schema.columns query (emailDigest now present) and prisma.user.findUnique() call (no longer throws column-not-found error).

files_changed:
  - DB state only — no code files changed; the migration file already existed with correct SQL
