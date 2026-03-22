import 'dotenv/config';
import express from 'express';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import requestLogger from './middleware/requestLogger.js';
import { prisma } from './lib/prisma.js';
import outreachRoutes  from './routes/outreach.js';
import trackingRoutes  from './routes/tracking.js';
import emailRoutes     from './routes/email.js';
import analyticsRoutes from './routes/analytics.js';
import authRoutes      from './routes/auth.js';
import profileRoutes   from './routes/profile.js';
import requireAuth     from './middleware/requireAuth.js';
import checkQuota     from './middleware/checkQuota.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8')
);

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(requestLogger);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server) and chrome-extension:// origins
    if (!origin || origin.startsWith('chrome-extension://') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true,
}));
app.use(express.json());

app.get('/health', async (req, res) => {
  const uptime = process.uptime();
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - t0;
    res.json({ status: 'ok', uptime, version, dbLatencyMs });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      uptime,
      version,
      dbLatencyMs: null,
      error: err.message,
    });
  }
});

// Auth routes — public, must be mounted BEFORE requireAuth
app.use('/api/auth', authRoutes);

// All other /api/* routes require a valid JWT
app.use('/api', requireAuth);

// ─── Rate limiter for expensive AI/DNS endpoints ───────────────────────────────

const expensiveRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

// ─── Route mounts ─────────────────────────────────────────────────────────────

app.use('/api/outreach',   outreachRoutes);
app.use('/api/profile',    profileRoutes);
app.use('/',               trackingRoutes);   // full paths inside: /track/:id and /api/track
app.use('/api/find-email',      expensiveRateLimit, checkQuota);
app.use('/api/suggest-domains', expensiveRateLimit);
app.use('/api/draft-email',     expensiveRateLimit);
app.use('/api', emailRoutes);
app.use('/api/insights',   analyticsRoutes);

// ─── Sentry error handler — captures before formatting ────────────────────────
Sentry.setupExpressErrorHandler(app);

// ─── Global error handler — MUST be last app.use() call ───────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Conflict', message: 'Record already exists', statusCode: 409 });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not Found', message: 'Record not found', statusCode: 404 });
  }
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    statusCode,
  });
});

export default app;
