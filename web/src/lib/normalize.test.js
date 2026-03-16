import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatus } from './normalize.js';

describe('normalizeStatus', () => {
  it('maps legacy "Applied" to "Sent"', () => {
    assert.strictEqual(normalizeStatus('Applied'), 'Sent');
  });

  it('passes through valid column "Sent"', () => {
    assert.strictEqual(normalizeStatus('Sent'), 'Sent');
  });

  it('passes through valid column "Replied"', () => {
    assert.strictEqual(normalizeStatus('Replied'), 'Replied');
  });

  it('passes through valid column "Interviewing"', () => {
    assert.strictEqual(normalizeStatus('Interviewing'), 'Interviewing');
  });

  it('passes through valid column "Offer"', () => {
    assert.strictEqual(normalizeStatus('Offer'), 'Offer');
  });

  it('passes through valid column "Ghosted"', () => {
    assert.strictEqual(normalizeStatus('Ghosted'), 'Ghosted');
  });

  it('falls back unknown status "RandomUnknown" to "Sent"', () => {
    assert.strictEqual(normalizeStatus('RandomUnknown'), 'Sent');
  });

  it('falls back empty string to "Sent"', () => {
    assert.strictEqual(normalizeStatus(''), 'Sent');
  });

  it('falls back undefined to "Sent"', () => {
    assert.strictEqual(normalizeStatus(undefined), 'Sent');
  });
});
