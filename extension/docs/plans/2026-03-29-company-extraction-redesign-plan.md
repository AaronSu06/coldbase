# Company Extraction Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded preposition-pattern approach in `extractCompanyFromText` with token-scoring + Clearbit validation, and swap the fallback chain so domain lookup runs first.

**Architecture:** `extractCompanyFromText` becomes async. It keeps existing fast-path subject patterns, then falls into a scorer that generates 1–3 word phrase candidates from the body, ranks them by role-noun proximity and frequency, and validates the top 2 against Clearbit autocomplete. The fallback chain in `reply-checker.js` is reordered: `fetchClearbitCompany(domain)` first, body extraction second, `'Unknown'` last. `extractCompanyFromEmail` is deleted entirely.

**Tech Stack:** Node.js built-in test runner (`node:test`), Clearbit autocomplete API (already used), no new dependencies.

---

### Task 1: Update `classifier.test.js` — remove old tests, add new ones

**Files:**
- Modify: `extension/classifier.test.js`

**Step 1: Remove the `extractCompanyFromEmail` describe block**

Delete lines 138–150 (the `describe('extractCompanyFromEmail', ...)` block) and remove `extractCompanyFromEmail` from the import on line 3.

New import line:
```js
import { extractCompanyFromText, isColdOutreach, countKeywordMatches } from './classifier.js';
```

**Step 2: Replace body-pattern tests inside `describe('extractCompanyFromText', ...)`**

Remove the two tests that rely on the old preposition patterns (lines 17–22 and 47–53 — `'no bracket subject — falls through to body patterns'` and `'HTML in body'`). Replace them and add the new cases below. The bracket/dash fast-path tests (lines 6–15, 23–35) stay unchanged.

Add these tests inside the existing `describe('extractCompanyFromText', ...)` block:

```js
it('lowercase company near role noun: CEO of amazon → scores and confirms via Clearbit mock', async () => {
  // Mock global fetch to simulate Clearbit returning Amazon
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    json: async () => [{ name: 'Amazon', domain: 'amazon.com' }],
  });
  try {
    const result = await extractCompanyFromText(
      'Coffee chat request',
      'Hi Jeff, I noticed you were the CEO of amazon! Would love to chat.'
    );
    assert.strictEqual(result, 'Amazon');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('no role context, company not confirmed by Clearbit: returns null', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => [] });
  try {
    const result = await extractCompanyFromText('Hello', 'Just reaching out to say hi.');
    assert.strictEqual(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('Clearbit fetch throws: returns null without throwing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network error'); };
  try {
    const result = await extractCompanyFromText('Hello', 'CEO of stripe');
    assert.strictEqual(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('fast-path bracket still works synchronously (no Clearbit call needed)', async () => {
  // fetch should never be called for bracket fast-path
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return { json: async () => [] }; };
  try {
    const result = await extractCompanyFromText('[Stripe] Internship', '');
    assert.strictEqual(result, 'Stripe');
    assert.strictEqual(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

**Step 3: Run tests to confirm new tests fail, existing fast-path tests still pass**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test --test-concurrency=1 extension/classifier.test.js
```

Expected: bracket/dash tests pass, new body-scoring tests fail (`extractCompanyFromText` is still sync / old implementation).

**Step 4: Commit**

```bash
git add extension/classifier.test.js
git commit -m "test(classifier): update extractCompanyFromText tests for scoring approach, remove extractCompanyFromEmail tests"
```

---

### Task 2: Add `STOP_WORDS`, `ROLE_NOUNS`, `scoreBodyCandidates`, and `fetchClearbitByName` to `classifier.js`

**Files:**
- Modify: `extension/classifier.js`

**Step 1: Add constants and helpers after the existing `SKIP_WORDS` block (after line 110)**

Insert after the closing `]);` of `SKIP_WORDS`:

```js
// Lowercase stop words for body tokenisation (suppresses common English words as candidates)
const STOP_WORDS = new Set([
  'i', 'hi', 'the', 'for', 'our', 'your', 'we', 'my', 'in', 'on', 'an', 'a',
  'to', 'from', 'best', 'thank', 'thanks', 'dear', 'and', 'or', 'but', 'if',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no',
  'so', 'than', 'too', 'just', 'as', 'of', 'at', 'by', 'about', 'into',
  'through', 'before', 'after', 'up', 'out', 'over', 'then', 'once', 'here',
  'there', 'when', 'where', 'how', 'all', 'any', 'this', 'that', 'these',
  'those', 'with', 'it', 'he', 'she', 'they', 'them', 'what', 'who', 'you',
  'him', 'his', 'her', 'us', 'me', 'its', 'their',
]);

const ROLE_NOUNS = new Set([
  'ceo', 'cto', 'cfo', 'coo', 'vp', 'founder', 'president',
  'director', 'head', 'manager', 'owner',
]);

// Returns candidates sorted by score descending. Pure function — no I/O.
function scoreBodyCandidates(body) {
  const words = body.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const scores = new Map();

  for (let i = 0; i < words.length; i++) {
    for (let len = 1; len <= 3; len++) {
      if (i + len > words.length) break;
      const first = words[i];
      if (STOP_WORDS.has(first) || first.length <= 2) continue;

      const phrase = words.slice(i, i + len).join(' ');
      let score = (scores.get(phrase) || 0) + 1; // +1 per occurrence

      // +2 if within 6 tokens of a role noun
      const lo = Math.max(0, i - 6);
      const hi = Math.min(words.length, i + len + 6);
      if (words.slice(lo, hi).some(w => ROLE_NOUNS.has(w))) score += 2;

      scores.set(phrase, score);
    }
  }

  return Array.from(scores.entries())
    .map(([phrase, score]) => ({ phrase, score }))
    .sort((a, b) => b.score - a.score);
}

// Query Clearbit autocomplete by company name (not domain).
// Returns the official company name if a close match is found, else null.
async function fetchClearbitByName(query) {
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(2000) }
    );
    const data = await res.json();
    const q = query.toLowerCase();
    const match = data.find(c =>
      c.name?.toLowerCase().startsWith(q) || q.startsWith(c.name?.toLowerCase() || '')
    );
    return match?.name || null;
  } catch (err) {
    log.error('fetchClearbitByName failed for query', query, err);
    return null;
  }
}
```

**Step 2: Run tests**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test --test-concurrency=1 extension/classifier.test.js
```

Expected: same pass/fail as after Task 1 (helpers not yet wired into `extractCompanyFromText`).

**Step 3: Commit**

```bash
git add extension/classifier.js
git commit -m "feat(classifier): add STOP_WORDS, ROLE_NOUNS, scoreBodyCandidates, fetchClearbitByName helpers"
```

---

### Task 3: Replace `extractCompanyFromText` and delete `extractCompanyFromEmail` in `classifier.js`

**Files:**
- Modify: `extension/classifier.js`

**Step 1: Replace the full `extractCompanyFromText` function (lines 122–157)**

Replace the existing function with:

```js
export async function extractCompanyFromText(subject, body) {
  // Fast-path 1: "[Company Name]" bracket pattern in subject
  const bracketMatch = subject.match(/\[([A-Z][A-Za-z0-9. ]+)\]/);
  if (bracketMatch) {
    const name = bracketMatch[1].trim();
    if (!SKIP_WORDS.has(name.split(' ')[0])) return name;
  }

  // Fast-path 2: "Company -" subject prefix
  const subjectPrefixMatch = subject.match(new RegExp(`^(${COMPANY_PATTERN.source})\\s*[-–]`));
  if (subjectPrefixMatch) {
    const name = subjectPrefixMatch[1];
    if (!SKIP_WORDS.has(name.split(' ')[0])) return name;
  }

  // Fast-path 3: "- Company" subject suffix
  const subjectSuffixMatch = subject.match(new RegExp(`[-–]\\s*(${COMPANY_PATTERN.source})`));
  if (subjectSuffixMatch) {
    const name = subjectSuffixMatch[1];
    if (!SKIP_WORDS.has(name.split(' ')[0])) return name;
  }

  // Token scoring on body — validate top 2 candidates via Clearbit
  const candidates = scoreBodyCandidates(body || '');
  for (const { phrase } of candidates.slice(0, 2)) {
    const name = await fetchClearbitByName(phrase);
    if (name) return name;
  }

  return null;
}
```

**Step 2: Delete `extractCompanyFromEmail` (lines 96–103)**

Remove the entire function:
```js
export function extractCompanyFromEmail(emailAddress) {
  // rachel@rocketbrew.com → "Rocketbrew"
  // john@mail.stripe.com → "Stripe" (use part before TLD, not first subdomain)
  const domain = emailAddress.split('@')[1] || '';
  const parts = domain.split('.');
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}
```

**Step 3: Run tests**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test --test-concurrency=1 extension/classifier.test.js
```

Expected: all tests pass, including the new body-scoring tests added in Task 1.

**Step 4: Commit**

```bash
git add extension/classifier.js
git commit -m "feat(classifier): replace extractCompanyFromText with token-scoring+Clearbit, delete extractCompanyFromEmail"
```

---

### Task 4: Update `reply-checker.js` — swap fallback chain, remove `extractCompanyFromEmail`

**Files:**
- Modify: `extension/reply-checker.js`

**Step 1: Update the import on line 8**

Remove `extractCompanyFromEmail` from the import:

```js
import { extractCompanyFromText, fetchClearbitCompany, extractFirstName, isGenericDomain } from './classifier.js';
```

**Step 2: Swap fallback chain in `_trackLatestSent` (~lines 163–168)**

Replace:
```js
const company =
    extractCompanyFromText(subject, body)
    || (!isGenericDomain(contactEmail) ? await fetchClearbitCompany(domain) : null)
    || (!isGenericDomain(contactEmail) ? extractCompanyFromEmail(contactEmail) : null)
    || 'Unknown';
```

With:
```js
const company =
    (!isGenericDomain(contactEmail) ? await fetchClearbitCompany(domain) : null)
    || await extractCompanyFromText(subject, body)
    || 'Unknown';
```

**Step 3: Swap fallback chain in `trackFromPendingScan` (~lines 260–264)**

Replace:
```js
const company =
    extractCompanyFromText(subject, body)
    || (!isGenericDomain(contactEmail) ? await fetchClearbitCompany(domain).catch(() => null) : null)
    || (!isGenericDomain(contactEmail) ? extractCompanyFromEmail(contactEmail) : null)
    || 'Unknown';
```

With:
```js
const company =
    (!isGenericDomain(contactEmail) ? await fetchClearbitCompany(domain).catch(() => null) : null)
    || await extractCompanyFromText(subject, body)
    || 'Unknown';
```

**Step 4: Run all tests**

```bash
cd /Users/aaron/Documents/GitHub/reach
node --env-file=server/.env.test --test --test-concurrency=1 extension/classifier.test.js
```

Expected: all pass.

**Step 5: Commit**

```bash
git add extension/reply-checker.js
git commit -m "feat(reply-checker): domain Clearbit lookup first, body scoring fallback second, remove extractCompanyFromEmail"
```
