// server/auth.test.js
// MUST be before any imports that transitively load prisma
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL;
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.BCRYPT_ROUNDS = '1'; // Fast hashing in tests

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let server, port, request;

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

  request = function(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1', port, path, method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data ? Buffer.byteLength(data) : 0,
          ...headers,
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

describe('POST /api/auth/signup', () => {
  it('creates a user and returns a token', async () => {
    const res = await request('POST', '/api/auth/signup', {
      email: 'signup@example.com',
      password: 'password123',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.token, 'should return a token');
    assert.equal(res.body.user.email, 'signup@example.com');
    assert.ok(!res.body.user.passwordHash, 'should never expose passwordHash');
  });

  it('returns 409 if email already exists', async () => {
    await request('POST', '/api/auth/signup', { email: 'dupe@example.com', password: 'password123' });
    const res = await request('POST', '/api/auth/signup', { email: 'dupe@example.com', password: 'password123' });
    assert.equal(res.status, 409);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request('POST', '/api/auth/signup', { email: 'not-an-email', password: 'password123' });
    assert.equal(res.status, 400);
  });

  it('returns 400 for password shorter than 8 characters', async () => {
    const res = await request('POST', '/api/auth/signup', { email: 'short@example.com', password: 'abc' });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/login', () => {
  before(async () => {
    await request('POST', '/api/auth/signup', { email: 'login@example.com', password: 'password123' });
  });

  it('returns a token on valid credentials', async () => {
    const res = await request('POST', '/api/auth/login', { email: 'login@example.com', password: 'password123' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'should return a token');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request('POST', '/api/auth/login', { email: 'login@example.com', password: 'wrongpassword' });
    assert.equal(res.status, 401);
  });

  it('returns 401 on unknown email', async () => {
    const res = await request('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'password123' });
    assert.equal(res.status, 401);
  });
});

describe('GET /api/auth/me', () => {
  let token;

  before(async () => {
    const res = await request('POST', '/api/auth/signup', { email: 'me@example.com', password: 'password123' });
    token = res.body.token;
  });

  it('returns user info with valid token', async () => {
    const res = await request('GET', '/api/auth/me', null, { Authorization: `Bearer ${token}` });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'me@example.com');
    assert.ok(res.body.id);
    assert.ok(res.body.createdAt);
    assert.ok(!res.body.passwordHash, 'should never expose passwordHash');
  });

  it('returns 401 without token', async () => {
    const res = await request('GET', '/api/auth/me', null);
    assert.equal(res.status, 401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request('GET', '/api/auth/me', null, { Authorization: 'Bearer invalid.token.here' });
    assert.equal(res.status, 401);
  });
});
