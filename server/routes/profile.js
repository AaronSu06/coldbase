// server/routes/profile.js
import { Router } from 'express';
import { createRequire } from 'node:module';
import multer from 'multer';
import mammoth from 'mammoth';
import { prisma } from '../lib/prisma.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only PDF, DOCX, and TXT files are accepted'), { statusCode: 400 }));
    }
  },
});

async function extractText(file) {
  const { mimetype, buffer } = file;
  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text.trim();
  }
  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
  // Plain text
  return buffer.toString('utf8').trim();
}

// ─── POST /resume ─────────────────────────────────────────────────────────────

router.post('/resume', upload.single('resume'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Validation Error', message: 'No file uploaded', statusCode: 400 });
  }
  try {
    const resumeText = await extractText(req.file);
    if (!resumeText) {
      return res.status(422).json({ error: 'Unprocessable', message: 'Could not extract text from file', statusCode: 422 });
    }
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { resumeText, resumeName: req.file.originalname },
    });
    res.json({ resumeName: req.file.originalname });
  } catch (e) {
    next(e);
  }
});

// ─── DELETE /resume ───────────────────────────────────────────────────────────

router.delete('/resume', async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { resumeText: null, resumeName: null },
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
