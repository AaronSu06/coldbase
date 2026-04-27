// server/routes/settings.js
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

const VALID_DIGESTS = new Set(['weekly', 'monthly', 'none']);

// ─── GET /settings ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        emailDigest: true,
        resumeName: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
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
    return res.status(400).json({
      error: 'Validation Error',
      message: 'emailDigest must be weekly, monthly, or none',
      statusCode: 400,
    });
  }
  try {
    const data = {};
    if (emailDigest !== undefined) {
      data.emailDigest = emailDigest;
      if (emailDigest === 'weekly') {
        data.digestSendDay = req.user.userId % 7;
      } else if (emailDigest === 'monthly') {
        data.digestSendDay = (req.user.userId % 28) + 1;
      } else {
        data.digestSendDay = null;
      }
    }
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: {
        emailDigest: true,
        resumeName: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

export default router;
