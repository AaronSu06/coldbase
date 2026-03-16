import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatShortDate, getDaysSince } from './utils.js';

describe('formatShortDate', () => {
  it('returns em dash for null input', () => {
    assert.strictEqual(formatShortDate(null), '\u2014');
  });

  it('returns em dash for undefined input', () => {
    assert.strictEqual(formatShortDate(undefined), '\u2014');
  });

  it('formats a January date — contains Jan and 2024', () => {
    const result = formatShortDate('2024-01-15T00:00:00.000Z');
    assert.ok(
      result.includes('2024') && result.includes('Jan'),
      `Expected result to contain "2024" and "Jan", got: "${result}"`
    );
  });

  it('formats a June date — contains Jun and 2024', () => {
    // Use midday UTC to avoid timezone-shift to May 31
    const result = formatShortDate('2024-06-15T12:00:00.000Z');
    assert.ok(
      /Jun.*2024|2024.*Jun/.test(result),
      `Expected result to match /Jun.*2024|2024.*Jun/, got: "${result}"`
    );
  });
});

describe('getDaysSince', () => {
  it('returns 0 or 1 for today (accounts for midnight boundary)', () => {
    const todayISO = new Date().toISOString();
    const result = getDaysSince(todayISO);
    assert.ok(result >= 0 && result <= 1, `Expected 0 or 1, got: ${result}`);
  });

  it('returns 1 for a date 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 86400000).toISOString();
    const result = getDaysSince(oneDayAgo);
    assert.strictEqual(result, 1);
  });

  it('returns 3 for a date 3 days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const result = getDaysSince(threeDaysAgo);
    assert.strictEqual(result, 3);
  });
});
