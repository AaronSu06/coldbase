import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

if (!email || !password) {
  console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD in .env');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

const admin = await prisma.user.upsert({
  where: { email },
  update: { passwordHash, isAdmin: true, plan: 'pro' },
  create: { email, passwordHash, isAdmin: true, plan: 'pro' },
});

console.log(`Admin account ready: ${admin.email} (id: ${admin.id})`);

// ── Test free user ──────────────────────────────────────────────────────────
const freeHash = await bcrypt.hash('user123', BCRYPT_ROUNDS);
const freeUser = await prisma.user.upsert({
  where:  { email: 'user1@gmail.com' },
  update: { passwordHash: freeHash, isAdmin: false, plan: 'free' },
  create: { email: 'user1@gmail.com', passwordHash: freeHash, isAdmin: false, plan: 'free' },
});

console.log(`Free user ready:  ${freeUser.email} (id: ${freeUser.id})`);
await prisma.$disconnect();
