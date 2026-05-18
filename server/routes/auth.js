// server/routes/auth.js
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import requireAuth from '../middleware/requireAuth.js';
import { OAuth2Client } from 'google-auth-library';

const oauthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.SERVER_URL}/api/auth/google/callback`
);

const router = Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// ─── POST /signup ──────────────────────────────────────────────────────────────

router.post('/signup', async (req, res, next) => {
  const parsed = CredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
    });
  }
  const { email, password } = parsed.data;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'Email already in use' });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({ data: { email, passwordHash } });
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    next(e);
  }
});

// ─── POST /login ───────────────────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  const parsed = CredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
    });
  }
  const { email, password } = parsed.data;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    next(e);
  }
});

// ─── GET /me ───────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, plan: true, isAdmin: true, resumeName: true, resumeText: true, createdAt: true, lookupsUsedThisMonth: true, lookupsResetAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Not Found' });
    const { PLAN_LIMITS } = await import('../lib/planLimits.js');
    const lookupsLimit = PLAN_LIMITS[user.plan]?.emailLookupsPerMonth ?? PLAN_LIMITS.free.emailLookupsPerMonth;
    const lookupsUsed  = (!user.lookupsResetAt || user.lookupsResetAt <= new Date()) ? 0 : user.lookupsUsedThisMonth;
    res.json({
      ...user,
      resumeText: user.resumeText ? user.resumeText.slice(0, 3000) : null,
      lookupsUsed,
      lookupsLimit,
    });
  } catch (e) {
    next(e);
  }
});

// ─── PATCH /email ──────────────────────────────────────────────────────────────

router.patch('/email', requireAuth, async (req, res, next) => {
  const { newEmail, password } = req.body;
  if (!newEmail || !password) {
    return res.status(400).json({ error: 'Validation Error', message: 'newEmail and password are required', statusCode: 400 });
  }
  const emailParsed = z.string().email().safeParse(newEmail);
  if (!emailParsed.success) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid email address', statusCode: 400 });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'User not found', statusCode: 404 });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Unauthorized', message: 'Incorrect password', statusCode: 401 });
    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) return res.status(409).json({ error: 'Conflict', message: 'Email already in use', statusCode: 409 });
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: { email: newEmail },
      select: { email: true },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// ─── PATCH /password ───────────────────────────────────────────────────────────

router.patch('/password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Validation Error', message: 'currentPassword and newPassword are required', statusCode: 400 });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Validation Error', message: 'New password must be at least 8 characters', statusCode: 400 });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'User not found', statusCode: 404 });
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Unauthorized', message: 'Incorrect password', statusCode: 401 });
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { passwordHash },
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ─── DELETE /account ───────────────────────────────────────────────────────────

router.delete('/account', requireAuth, async (req, res, next) => {
  const { confirm } = req.body ?? {};
  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Validation Error', message: 'Body must contain { confirm: "DELETE" }', statusCode: 400 });
  }
  try {
    await prisma.user.delete({ where: { id: req.user.userId } });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ─── GET /google ───────────────────────────────────────────────────────────────

router.get('/google', (req, res) => {
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

// ─── GET /google/callback ──────────────────────────────────────────────────────

router.get('/google/callback', async (req, res, next) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${process.env.CLIENT_URL}/auth?error=no_code`);

  try {
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email } = payload;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId } });
      }
    } else {
      user = await prisma.user.create({ data: { email, googleId } });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(`${process.env.CLIENT_URL}/auth/google/callback?token=${token}`);
  } catch (e) {
    next(e);
  }
});

export default router;
