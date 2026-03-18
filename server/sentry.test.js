import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { beforeSend, initSentry } from './instrument.js';

describe('beforeSend PII filter', () => {
  it('sets event.request.data to [Filtered]', () => {
    const event = { request: { data: { email: 'test@example.com' } } };
    const result = beforeSend(event);
    assert.equal(result.request.data, '[Filtered]');
  });

  it('removes x-reach-secret header and preserves other headers', () => {
    const event = {
      request: {
        headers: {
          'x-reach-secret': 'mysecret',
          'content-type': 'application/json',
        },
      },
    };
    const result = beforeSend(event);
    assert.equal(result.request.headers['x-reach-secret'], undefined);
    assert.equal(result.request.headers['content-type'], 'application/json');
  });

  it('returns event unchanged when event.request is absent', () => {
    const event = { exception: { values: [{ type: 'Error' }] } };
    const result = beforeSend(event);
    assert.equal(result, event);
  });
});

describe('initSentry no-op when SENTRY_DSN absent', () => {
  it('does not throw when SENTRY_DSN is absent', () => {
    assert.doesNotThrow(() => initSentry());
  });
});
