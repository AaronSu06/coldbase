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

describe('Cross-user data isolation', () => {
  let tokenA, tokenB, threadId;

  before(async () => {
    // Create two separate users
    const resA = await request('POST', '/api/auth/signup', { email: 'usera@example.com', password: 'passwordA123' });
    tokenA = resA.body.token;
    const resB = await request('POST', '/api/auth/signup', { email: 'userb@example.com', password: 'passwordB123' });
    tokenB = resB.body.token;

    // Create an outreach record as user A
    threadId = `thread-isolation-${Date.now()}`;
    await request('POST', '/api/outreach', {
      threadId,
      company: 'Acme',
      contactEmail: 'contact@acme.com',
      gmailUrl: 'https://mail.google.com/mail/u/0/#inbox/abc',
      contactName: 'Alice',
      domain: 'acme.com',
      subject: 'Hello',
      sentDate: new Date().toISOString(),
      latestActivity: new Date().toISOString(),
    }, { Authorization: `Bearer ${tokenA}` });
  });

  it('user B cannot read user A outreach records', async () => {
    const res = await request('GET', '/api/outreach', null, { Authorization: `Bearer ${tokenB}` });
    assert.equal(res.status, 200);
    const hasA = res.body.data.some(r => r.threadId === threadId);
    assert.equal(hasA, false, "user B should not see user A's records");
  });

  it('user B cannot patch user A outreach record', async () => {
    const res = await request('PATCH', `/api/outreach/${threadId}`, { notes: 'hacked' }, { Authorization: `Bearer ${tokenB}` });
    assert.equal(res.status, 404, "user B should get 404, not access user A's record");
  });

  it('user A can still read their own record', async () => {
    const res = await request('GET', '/api/outreach', null, { Authorization: `Bearer ${tokenA}` });
    assert.equal(res.status, 200);
    const hasA = res.body.data.some(r => r.threadId === threadId);
    assert.equal(hasA, true, "user A should see their own record");
  });
});

describe('PATCH /api/auth/email', () => {
  let token;

  before(async () => {
    const res = await request('POST', '/api/auth/signup', {
      email: 'change-email@example.com',
      password: 'password123',
    });
    token = res.body.token;
  });

  it('updates email with correct password', async () => {
    const res = await request(
      'PATCH', '/api/auth/email',
      { newEmail: 'changed@example.com', password: 'password123' },
      { Authorization: `Bearer ${token}` },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'changed@example.com');
  });

  it('returns 401 with wrong password', async () => {
    const res = await request(
      'PATCH', '/api/auth/email',
      { newEmail: 'x@example.com', password: 'wrongpassword' },
      { Authorization: `Bearer ${token}` },
    );
    assert.equal(res.status, 401);
  });

  it('returns 409 if new email is already taken', async () => {
    await request('POST', '/api/auth/signup', { email: 'taken@example.com', password: 'password123' });
    const res = await request(
      'PATCH', '/api/auth/email',
      { newEmail: 'taken@example.com', password: 'password123' },
      { Authorization: `Bearer ${token}` },
    );
    assert.equal(res.status, 409);
  });

  it('returns 401 without a token', async () => {
    const res = await request('PATCH', '/api/auth/email', { newEmail: 'x@example.com', password: 'p' });
    assert.equal(res.status, 401);
  });
});

describe('PATCH /api/auth/password', () => {
  let token;

  before(async () => {
    const res = await request('POST', '/api/auth/signup', {
      email: 'change-pw@example.com',
      password: 'oldpassword',
    });
    token = res.body.token;
  });

  it('updates password with correct current password', async () => {
    const res = await request(
      'PATCH', '/api/auth/password',
      { currentPassword: 'oldpassword', newPassword: 'newpassword123' },
      { Authorization: `Bearer ${token}` },
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.success);
  });

  it('returns 401 with wrong current password', async () => {
    const res = await request(
      'PATCH', '/api/auth/password',
      { currentPassword: 'wrongpassword', newPassword: 'newpassword123' },
      { Authorization: `Bearer ${token}` },
    );
    assert.equal(res.status, 401);
  });

  it('returns 400 if new password is shorter than 8 characters', async () => {
    const res = await request(
      'PATCH', '/api/auth/password',
      { currentPassword: 'oldpassword', newPassword: 'short' },
      { Authorization: `Bearer ${token}` },
    );
    assert.equal(res.status, 400);
  });

  it('returns 401 without a token', async () => {
    const res = await request('PATCH', '/api/auth/password', { currentPassword: 'x', newPassword: 'y' });
    assert.equal(res.status, 401);
  });
});

describe('DELETE /api/auth/account', () => {
  let token;

  before(async () => {
    const res = await request('POST', '/api/auth/signup', {
      email: 'delete-me@example.com',
      password: 'password123',
    });
    token = res.body.token;
  });

  it('deletes the account when confirm body is correct', async () => {
    const res = await request(
      'DELETE', '/api/auth/account',
      { confirm: 'DELETE' },
      { Authorization: `Bearer ${token}` },
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.success);
  });

  it('returns 400 when confirm body is missing or wrong', async () => {
    // Sign up a fresh user so we have a valid token
    const signup = await request('POST', '/api/auth/signup', {
      email: 'delete-me2@example.com',
      password: 'password123',
    });
    const t2 = signup.body.token;

    const res = await request('DELETE', '/api/auth/account', { confirm: 'wrong' }, { Authorization: `Bearer ${t2}` });
    assert.equal(res.status, 400);
  });

  it('returns 401 without a token', async () => {
    const res = await request('DELETE', '/api/auth/account', { confirm: 'DELETE' });
    assert.equal(res.status, 401);
  });
});
