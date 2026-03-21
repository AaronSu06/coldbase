// MUST be before any imports that transitively load prisma
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.BCRYPT_ROUNDS = '1';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let server;
let port;
let token;
let request; // http helper function

before(async () => {
  // Reset test DB to clean state
  execSync('npx prisma migrate reset --force --skip-seed', {
    cwd: __dirname,
    env: { ...process.env },
    stdio: 'inherit',
  });

  // Dynamic import AFTER env vars are set AND after DB is reset
  const { default: app } = await import('./app.js');

  // Define the http helper after we know the port
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  // Create a test user and get a JWT for all requests
  const signupData = JSON.stringify({ email: 'test@example.com', password: 'password123' });
  const signupRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port,
      path: '/api/auth/signup',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(signupData) },
    }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(signupData);
    req.end();
  });
  token = signupRes.token;

  // HTTP request helper — always sends Authorization: Bearer token
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
          'Authorization': `Bearer ${token}`,
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

const validPayload = {
  threadId: 'thread-001',
  company: 'Stripe',
  contactEmail: 'hr@stripe.com',
  gmailUrl: 'https://mail.google.com/mail/u/0/#sent/thread-001',
  contactName: 'HR',
  domain: 'stripe.com',
  subject: '[Stripe] Internship',
  sentDate: new Date().toISOString(),
  latestActivity: new Date().toISOString(),
};

describe('POST /api/outreach', () => {
  it('creates a record and returns 201', async () => {
    const { status, body } = await request('POST', '/api/outreach', validPayload);
    assert.strictEqual(status, 201);
    assert.strictEqual(body.threadId, 'thread-001');
    assert.strictEqual(body.company, 'Stripe');
  });

  it('duplicate threadId returns 409', async () => {
    // Re-insert the same payload (already inserted in previous test)
    const { status, body } = await request('POST', '/api/outreach', validPayload);
    assert.strictEqual(status, 409);
    assert.strictEqual(body.error, 'Conflict');
  });

  it('missing required fields returns 400', async () => {
    const { status, body } = await request('POST', '/api/outreach', {
      subject: 'No threadId or company or email',
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error, 'Validation Error');
  });

  it('missing Authorization header returns 401', async () => {
    const { status } = await request('POST', '/api/outreach', validPayload, {
      'Authorization': '',
    });
    assert.strictEqual(status, 401);
  });
});

describe('PATCH /api/outreach/:threadId', () => {
  it('updates an existing record and returns 200', async () => {
    const { status, body } = await request('PATCH', '/api/outreach/thread-001', {
      status: 'Replied',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'Replied');
  });

  it('nonexistent threadId returns 404', async () => {
    const { status, body } = await request('PATCH', '/api/outreach/nonexistent-thread', {
      status: 'Replied',
    });
    assert.strictEqual(status, 404);
    assert.strictEqual(body.error, 'Not Found');
  });
});

describe('GET /api/outreach', () => {
  it('GET /api/outreach returns 401 without Authorization header', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/outreach',
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.status, 401);
  });

  it('returns { data, total } shape', async () => {
    const { status, body } = await request('GET', '/api/outreach');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.data), 'body.data must be an array');
    assert.ok(typeof body.total === 'number', 'body.total must be a number');
  });

  it('limit=1 returns only 1 record', async () => {
    const { status, body } = await request('GET', '/api/outreach?limit=1&offset=0');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.data.length, 1);
    assert.ok(body.total >= 1, 'total should reflect full count');
  });
});
