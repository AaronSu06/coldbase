import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';

import outreachRoutes  from './routes/outreach.js';
import trackingRoutes  from './routes/tracking.js';
import emailRoutes     from './routes/email.js';
import analyticsRoutes from './routes/analytics.js';

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

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

// ─── Secret validation middleware ─────────────────────────────────────────────

function requireSecret(req, res, next) {
  const secret = process.env.REACH_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server misconfigured: REACH_SECRET not set' });
  }
  if (req.headers['x-reach-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid x-reach-secret header' });
  }
  next();
}

app.use('/api', requireSecret);

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
app.use('/',               trackingRoutes);   // full paths inside: /track/:id and /api/track
app.post('/api/find-email',      expensiveRateLimit, emailRoutes);
app.post('/api/suggest-domains', expensiveRateLimit, emailRoutes);
app.post('/api/draft-email',     expensiveRateLimit, emailRoutes);
app.use('/api/insights',   analyticsRoutes);

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

// ─── Server start ─────────────────────────────────────────────────────────────

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Reach server] Listening on http://localhost:${PORT}`);
});
