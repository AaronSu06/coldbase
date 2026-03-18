// MUST be before any imports that transitively load prisma
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
process.env.REACH_SECRET = 'test-secret';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let server;
let port;

before(async () => {
  // No prisma migrate reset — health check is read-only (SELECT 1)
  const { default: app } = await import('./app.js');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

// HTTP request helper — does NOT send x-reach-secret by default
// (unlike outreach.test.js which always sends it)
function request(method, path, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
      },
      res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── OBS-01: Request logger ────────────────────────────────────────────────────

describe('OBS-01: requestLogger middleware', () => {
  it('every request produces a console.log line containing valid JSON with required fields', async () => {
    let captured = null;
    const orig = console.log;
    console.log = line => {
      captured = line;
    };
    try {
      await request('GET', '/health');
    } finally {
      console.log = orig;
    }

    assert.ok(captured !== null, 'expected a console.log line but none was captured');
    const log = JSON.parse(captured);
    assert.equal(typeof log.method, 'string', 'log.method must be a string');
    assert.equal(typeof log.path, 'string', 'log.path must be a string');
    assert.equal(typeof log.status, 'number', 'log.status must be a number');
    assert.equal(typeof log.durationMs, 'number', 'log.durationMs must be a number');
  });

  it('logged JSON has correct method and path fields', async () => {
    let captured = null;
    const orig = console.log;
    console.log = line => {
      captured = line;
    };
    try {
      await request('GET', '/health');
    } finally {
      console.log = orig;
    }

    assert.ok(captured !== null, 'expected a console.log line but none was captured');
    const log = JSON.parse(captured);
    assert.equal(log.method, 'GET');
    assert.equal(log.path, '/health');
  });

  it('x-reach-secret header value is NOT present in the log output', async () => {
    const secretValue = 'test-secret';
    let captured = null;
    const orig = console.log;
    console.log = line => {
      captured = line;
    };
    try {
      await request('GET', '/health', { 'x-reach-secret': secretValue });
    } finally {
      console.log = orig;
    }

    assert.ok(captured !== null, 'expected a console.log line but none was captured');
    assert.ok(
      !captured.includes(secretValue),
      `log output must not contain secret value "${secretValue}"`
    );
  });
});

// ─── OBS-02: Health endpoint ───────────────────────────────────────────────────

describe('OBS-02: GET /health', () => {
  it('returns HTTP 200 with no auth header', async () => {
    // No x-reach-secret header — must succeed (public endpoint)
    const { status } = await request('GET', '/health');
    assert.equal(status, 200);
  });

  it('response body has required fields: status, uptime, version, dbLatencyMs', async () => {
    const { status, body } = await request('GET', '/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok', 'body.status must equal "ok"');
    assert.equal(typeof body.uptime, 'number', 'body.uptime must be a number');
    assert.equal(typeof body.version, 'string', 'body.version must be a string');
    assert.equal(typeof body.dbLatencyMs, 'number', 'body.dbLatencyMs must be a number');
  });
});
