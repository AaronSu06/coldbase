// server/routes/auth.js
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import requireAuth from '../middleware/requireAuth.js';

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
      select: { id: true, email: true, plan: true, isAdmin: true, resumeName: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Not Found' });
    res.json(user);
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

export default router;
