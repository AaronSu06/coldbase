// MUST be before any imports that transitively load prisma
process.env.DATABASE_URL  = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL    = process.env.TEST_DIRECT_URL;
process.env.JWT_SECRET    = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.BCRYPT_ROUNDS = '1';
process.env.NODE_ENV      = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let server;
let port;
let authHeader;
let request;

before(async () => {
  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: __dirname,
    env: { ...process.env },
    stdio: 'inherit',
  });
  const { default: app } = await import('./app.js');
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  // Create a test user and get a JWT token
  const signupRes = await new Promise((resolve, reject) => {
    const data = JSON.stringify({ email: 'analytics@test.com', password: 'password123' });
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/api/auth/signup', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = ''; res.on('data', c => (raw += c));
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject); req.write(data); req.end();
  });
  authHeader = `Bearer ${signupRes.token}`;

  request = function(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'Content-Length': data ? Buffer.byteLength(data) : 0,
          ...extraHeaders,
        },
      }, res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  };
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

describe('GET /api/insights/best-time', () => {
  it('returns insufficient:true when database is empty', async () => {
    const { status, body } = await request('GET', '/api/insights/best-time');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.insufficient, true);
    assert.strictEqual(typeof body.sent, 'number');
    assert.strictEqual(typeof body.replied, 'number');
  });

  it('requires Authorization header', async () => {
    const { status } = await request('GET', '/api/insights/best-time', null, {
      'Authorization': '',
    });
    assert.strictEqual(status, 401);
  });
});

describe('GET /api/insights', () => {
  it('returns 200 with all three insight keys when db is empty', async () => {
    const { status, body } = await request('GET', '/api/insights');
    assert.strictEqual(status, 200);
    assert.strictEqual(typeof body.sent, 'number');
    assert.strictEqual(typeof body.replied, 'number');
    assert.ok('bestTime' in body, 'missing bestTime');
    assert.ok('responseTime' in body, 'missing responseTime');
    assert.ok('replyTrend' in body, 'missing replyTrend');
  });

  it('bestTime is insufficient when db is empty', async () => {
    const { body } = await request('GET', '/api/insights');
    assert.strictEqual(body.bestTime.insufficient, true);
  });

  it('responseTime is insufficient when db is empty', async () => {
    const { body } = await request('GET', '/api/insights');
    assert.strictEqual(body.responseTime.insufficient, true);
  });

  it('replyTrend is insufficient when db is empty', async () => {
    const { body } = await request('GET', '/api/insights');
    assert.strictEqual(body.replyTrend.insufficient, true);
  });

  it('accepts from and to query params without error', async () => {
    const { status } = await request('GET', '/api/insights?from=2026-01-01&to=2026-12-31');
    assert.strictEqual(status, 200);
  });

  it('requires Authorization header', async () => {
    const { status } = await request('GET', '/api/insights', null, {
      'Authorization': '',
    });
    assert.strictEqual(status, 401);
  });
});
