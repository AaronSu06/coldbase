import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// ─── GET /track/:trackingId — 1x1 tracking pixel ─────────────────────────────

router.get('/track/:trackingId', async (req, res) => {
  const trackingId = req.params.trackingId.replace(/\.gif$/, '');
  try {
    const pixel = await prisma.trackingPixel.findUnique({ where: { trackingId } });
    if (pixel && Date.now() - pixel.createdAt.getTime() > 5000) {
      await prisma.openEvent.create({
        data: { trackingId, userAgent: req.headers['user-agent'] || null, ipAddress: req.ip || null }
      });
      await prisma.outreach.update({
        where: { threadId: pixel.threadId },
        data: { isOpened: true, openCount: { increment: 1 }, lastOpenedAt: new Date() }
      }).catch(() => {});
    }
  } catch (e) {
    // Non-fatal — tracking failure must never prevent pixel delivery
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(PIXEL_GIF);
});

// ─── POST /api/track — register a tracking pixel ─────────────────────────────

router.post('/api/track', async (req, res, next) => {
  const { trackingId, threadId } = req.body;
  const { userId } = req.user;
  try {
    await prisma.trackingPixel.create({ data: { trackingId, threadId, userId } });
  } catch (e) {
    if (e.code === 'P2002') return res.status(200).json({ ok: true });
    return next(e);
  }
  res.status(201).json({ ok: true });
});

export default router;
