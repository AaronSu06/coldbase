import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForMatch, extractEmailAddress } from './text-utils.js';

describe('normalizeForMatch', () => {
  it('lowercases input', () => {
    assert.strictEqual(normalizeForMatch('Hello World'), 'hello world');
  });

  it('strips hyphens', () => {
    assert.strictEqual(normalizeForMatch('hello-world'), 'helloworld');
  });

  it('strips underscores', () => {
    assert.strictEqual(normalizeForMatch('hello_world'), 'helloworld');
  });

  it('replaces special chars with spaces but preserves commas', () => {
    // comma is preserved by regex [^a-z0-9\s,]; exclamation becomes space then collapses
    assert.strictEqual(normalizeForMatch('Hello, World!'), 'hello, world');
  });

  it('collapses and trims whitespace', () => {
    assert.strictEqual(normalizeForMatch('  spaces  everywhere  '), 'spaces everywhere');
  });

  it('returns empty string for null input', () => {
    assert.strictEqual(normalizeForMatch(null), '');
  });

  it('returns empty string for undefined input', () => {
    assert.strictEqual(normalizeForMatch(undefined), '');
  });
});

describe('extractEmailAddress', () => {
  it('extracts email from angle-bracket format with display name', () => {
    assert.strictEqual(
      extractEmailAddress('Rachel Smith <rachel@rocketbrew.com>'),
      'rachel@rocketbrew.com'
    );
  });

  it('extracts email from bare angle-bracket format', () => {
    assert.strictEqual(extractEmailAddress('<hr@stripe.com>'), 'hr@stripe.com');
  });

  it('returns plain address unchanged when no brackets', () => {
    assert.strictEqual(extractEmailAddress('noreply@google.com'), 'noreply@google.com');
  });

  it('trims whitespace from plain address', () => {
    assert.strictEqual(
      extractEmailAddress('  plain@example.com  '),
      'plain@example.com'
    );
  });
});
