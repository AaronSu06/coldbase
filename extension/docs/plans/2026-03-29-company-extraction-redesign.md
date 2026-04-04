# Company Extraction Redesign

**Date:** 2026-03-29
**Status:** Approved

## Problem

Company names written in lowercase (e.g. "CEO of amazon") are never matched by
`extractCompanyFromText` because `COMPANY_PATTERN` requires an uppercase first
letter. Additionally, the only prepositions checked (`at`, `from`, `on behalf of`)
miss common role-based phrasing like "CEO of X" or "founder of X". This causes
the company field to default to `'Unknown'` even when the body clearly names one.

## Context

The company fallback chain in `reply-checker.js` runs after every send. Most
recipients use a corporate email (`jeff@amazon.com`), so `fetchClearbitCompany`
on the domain is the reliable, high-confidence path. `extractCompanyFromText` is
only a last resort — typically for generic-domain recipients (`@gmail.com`) who
are mentioned by company in the email body.

`extractCompanyFromEmail` (step 3 in the old chain) was removed: it merely
capitalised the domain segment, which is already stored in the record. The UI can
derive a readable label from `domain` if needed.

## Design

### Fallback chain (both `_trackLatestSent` and `trackFromPendingScan`)

```
Before: extractCompanyFromText → fetchClearbitCompany(domain) → extractCompanyFromEmail → 'Unknown'
After:  fetchClearbitCompany(domain) → extractCompanyFromText(subject, body) → 'Unknown'
```

### New `extractCompanyFromText` algorithm (`classifier.js`)

1. **Fast-path** — keep existing subject bracket `[Company]` and dash prefix/suffix
   patterns unchanged. These are high-confidence and free.

2. **Tokenize** — split the body into all overlapping 1-, 2-, and 3-word phrases.
   Drop any phrase whose first token is in the stop-word set.

3. **Score candidates**
   - `+2` if the phrase appears within 6 tokens of a role noun (`CEO`, `CTO`,
     `CFO`, `COO`, `VP`, `founder`, `president`, `director`, `head`, `manager`,
     `owner`). Role proximity is a soft boost, not a hard gate.
   - `+1` per additional occurrence of the phrase in the body.

4. **Validate via Clearbit** — query `https://autocomplete.clearbit.com/v1/companies/suggest`
   for the top 2 scored candidates. Return the official name of the first
   confirmed match.

5. **Return `null`** if nothing confirms, letting the caller fall through to
   `'Unknown'`.

### Removed

- `extractCompanyFromEmail` — deleted from `classifier.js` and removed from the
  import in `reply-checker.js`.

## Files changed

| File | Change |
|---|---|
| `classifier.js` | Replace `extractCompanyFromText`; delete `extractCompanyFromEmail` |
| `reply-checker.js` | Swap fallback chain order; remove `extractCompanyFromEmail` import + usage (both `_trackLatestSent` and `trackFromPendingScan`) |

## Test cases

| Input | Expected |
|---|---|
| Body: `"you were the CEO of amazon"` | Amazon |
| Body: `"I noticed you founded Stripe"` | Stripe |
| Body: `"VP of Engineering at Netflix"` | Netflix |
| Body: `"reaching out about Jane Street Capital"` | Jane Street Capital |
| Body: `"I love apple products"` (no role context) | Soft-score apple, Clearbit confirms — acceptable given this is last-resort only |
| Recipient `jeff@amazon.com`, no body company | fetchClearbitCompany returns Amazon before body scan runs |
| Clearbit rate-limited | Returns null → 'Unknown' (same as today) |
