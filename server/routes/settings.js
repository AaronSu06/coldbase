// server/routes/settings.js
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

const VALID_DIGESTS = new Set(['daily', 'weekly', 'never']);

// ─── GET /settings ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { emailDigest: true, resumeName: true, plan: true },
    });
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'User not found', statusCode: 404 });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

// ─── PATCH /settings ───────────────────────────────────────────────────────────

router.patch('/', async (req, res, next) => {
  const { emailDigest } = req.body;
  if (emailDigest !== undefined && !VALID_DIGESTS.has(emailDigest)) {
    return res.status(400).json({ error: 'Validation Error', message: 'emailDigest must be daily, weekly, or never', statusCode: 400 });
  }
  try {
    const data = {};
    if (emailDigest !== undefined) data.emailDigest = emailDigest;
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: { emailDigest: true, resumeName: true, plan: true },
    });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

export default router;
