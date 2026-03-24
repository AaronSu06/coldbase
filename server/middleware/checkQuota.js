// server/middleware/checkQuota.js
import { prisma } from '../lib/prisma.js';
import { PLAN_LIMITS } from '../lib/planLimits.js';

export default async function checkQuota(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Admins bypass all quota checks
  if (user.isAdmin) {
    req.incrementQuota = () => Promise.resolve();
    return next();
  }

  const planConfig = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;
  const limit = planConfig.emailLookupsPerMonth;
  const now   = new Date();

  // Reset quota if window has passed
  if (!user.lookupsResetAt || user.lookupsResetAt <= now) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await prisma.user.update({
      where: { id: userId },
      data:  { lookupsUsedThisMonth: 0, lookupsResetAt: nextMonth },
    });
    user.lookupsUsedThisMonth = 0;
  }

  if (user.lookupsUsedThisMonth >= limit) {
    return res.status(429).json({
      error: 'quota_exceeded',
      used:  user.lookupsUsedThisMonth,
      limit,
    });
  }

  // Attach increment helper — called by route after successful Hunter response
  req.incrementQuota = () =>
    prisma.user.update({
      where: { id: userId },
      data:  { lookupsUsedThisMonth: { increment: 1 } },
    });

  next();
}
