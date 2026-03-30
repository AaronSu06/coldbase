import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCompanyFromText, isColdOutreach, countKeywordMatches } from './classifier.js';

describe('extractCompanyFromText', () => {
  it('BUG-01: extracts company name from bracket format without trailing bracket', async () => {
    assert.strictEqual(await extractCompanyFromText('[Stripe] Internship', ''), 'Stripe');
  });

  it('multi-word bracket: extracts full multi-word company name from brackets', async () => {
    assert.strictEqual(
      await extractCompanyFromText('[Jane Street Capital] Summer Intern', ''),
      'Jane Street Capital'
    );
  });

  it('bracket word in SKIP_WORDS: does not return SKIP_WORD company name', async () => {
    // 'Internship' is in SKIP_WORDS — should not return it
    const result = await extractCompanyFromText('[Internship] Available', '');
    assert.notStrictEqual(result, 'Internship');
  });

  it('non-bracket subject with dash prefix: extracts company from subject prefix', async () => {
    assert.strictEqual(
      await extractCompanyFromText('Google - Summer Internship 2026', ''),
      'Google'
    );
  });

  it('no match anywhere: returns null', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => [] });
    try {
      assert.strictEqual(await extractCompanyFromText('Hello World', ''), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('non-English company name in brackets: does not crash', async () => {
    // Bracket pattern requires ASCII [A-Z] start — non-ASCII name won't match bracket pattern
    // Function should not throw; returns null or falls through to other patterns
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => [] });
    try {
      const result = await extractCompanyFromText('[Müller GmbH] Internship', '');
      assert.ok(result === null || typeof result === 'string', 'should return null or string without throwing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('forwarded subject: Fwd: prefix interferes with subject prefix extraction', async () => {
    // 'Fwd: Google - Summer Internship' — the 'Fwd:' prefix may prevent prefix match
    // Document the actual behavior rather than assuming
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => [] });
    try {
      const result = await extractCompanyFromText('Fwd: Google - Summer Internship', '');
      // suffix pattern '- X' should still capture 'Google' from after the dash, but 'Summer' might be returned
      // Key: function must not throw
      assert.ok(result === null || typeof result === 'string', 'should return null or string without throwing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('lowercase company near role noun: CEO of amazon → scores and confirms via Clearbit mock', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({
      ok: true,
      json: async () => [{ name: 'Amazon', domain: 'amazon.com' }],
    });
    try {
      const result = await extractCompanyFromText(
        'Coffee chat request',
        'I saw you are CEO of amazon. I love what amazon is doing.'
      );
      assert.strictEqual(result, 'Amazon');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('no role context, company not confirmed by Clearbit: returns null', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => [] });
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
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => [] }; };
    try {
      const result = await extractCompanyFromText('[Stripe] Internship', '');
      assert.strictEqual(result, 'Stripe');
      assert.strictEqual(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('isColdOutreach', () => {
  it('happy path: intern keyword → true', () => {
    assert.strictEqual(isColdOutreach('Looking for intern applications'), true);
  });

  it('happy path: hiring keyword → true', () => {
    assert.strictEqual(isColdOutreach('We are hiring software engineers'), true);
  });

  it('happy path: resume and recruit → true', () => {
    assert.strictEqual(isColdOutreach('Please send your resume for our recruiting process'), true);
  });

  it('happy path: apply keyword → true', () => {
    assert.strictEqual(isColdOutreach('Apply now for this software role at Google'), true);
  });

  it('happy path: cv and candidate → true', () => {
    assert.strictEqual(isColdOutreach('CV submission for candidate review'), true);
  });

  it('negative: casual message → false', () => {
    assert.strictEqual(isColdOutreach('Hey, want to grab coffee?'), false);
  });

  it('negative: rescheduled meeting → false', () => {
    assert.strictEqual(isColdOutreach('Meeting rescheduled to Friday'), false);
  });

  it('negative: order shipped → false', () => {
    assert.strictEqual(isColdOutreach('Your order has been shipped'), false);
  });

  it('edge: HTML-only body — hiring and interns tokens survive tag stripping', () => {
    // normalizeText strips non-alphanumeric to spaces, so '<p>' becomes ' p '
    // 'hiring' and 'interns' remain as tokens → should match
    assert.strictEqual(isColdOutreach('<p>We are <strong>hiring</strong> interns</p>'), true);
  });

  it('edge: forwarded prefix does not block keyword match', () => {
    assert.strictEqual(isColdOutreach('Fwd: [Stripe] Internship opportunity'), true);
  });

  it('edge: fuzzy match with 1-char typo on 10-char word → true', () => {
    // 'internshipp' has edit distance 1 from 'internship' (10 chars → limit 2)
    assert.strictEqual(isColdOutreach('internshipp at Acme'), true);
  });

  it('edge: non-English text with no English keywords → false', () => {
    // German text — no matching English keyword groups
    assert.strictEqual(isColdOutreach('Wir suchen Praktikanten'), false);
  });
});

describe('countKeywordMatches', () => {
  it('two distinct groups: intern + hiring → 2', () => {
    assert.strictEqual(countKeywordMatches('intern hiring'), 2);
  });

  it('same group repeated: internship internships intern → 1', () => {
    assert.strictEqual(countKeywordMatches('internship internships intern'), 1);
  });

  it('two distinct groups: resume + application → 2', () => {
    // resume group (resume/cv) + apply group (apply/application)
    assert.strictEqual(countKeywordMatches('resume cv application'), 2);
  });

  it('no keywords → 0', () => {
    assert.strictEqual(countKeywordMatches('no job keywords here'), 0);
  });
});
