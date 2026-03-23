// server/middleware/requireAdmin.js
import { prisma } from '../lib/prisma.js';

export default async function requireAdmin(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
  next();
}
