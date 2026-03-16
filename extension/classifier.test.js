import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCompanyFromText } from './classifier.js';

describe('extractCompanyFromText', () => {
  it('BUG-01: extracts company name from bracket format without trailing bracket', () => {
    assert.strictEqual(extractCompanyFromText('[Stripe] Internship', ''), 'Stripe');
  });

  it('multi-word bracket: extracts full multi-word company name from brackets', () => {
    assert.strictEqual(
      extractCompanyFromText('[Jane Street Capital] Summer Intern', ''),
      'Jane Street Capital'
    );
  });

  it('no bracket subject — falls through to body patterns: extracts from body', () => {
    // "at Acme Corp" in body
    const result = extractCompanyFromText('Software Internship', 'reach out at Acme Corp');
    assert.strictEqual(result, 'Acme Corp');
  });

  it('bracket word in SKIP_WORDS: does not return SKIP_WORD company name', () => {
    // 'Internship' is in SKIP_WORDS — should not return it
    const result = extractCompanyFromText('[Internship] Available', '');
    assert.notStrictEqual(result, 'Internship');
  });

  it('non-bracket subject with dash prefix: extracts company from subject prefix', () => {
    assert.strictEqual(
      extractCompanyFromText('Google - Summer Internship 2026', ''),
      'Google'
    );
  });

  it('no match anywhere: returns null', () => {
    assert.strictEqual(extractCompanyFromText('Hello World', ''), null);
  });
});
