import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// GET /api/outreach — list all records ordered by sentDate desc
app.get('/api/outreach', async (req, res) => {
  try {
    const records = await prisma.outreach.findMany({
      orderBy: { sentDate: 'desc' }
    });
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/outreach/count — { count: N } for popup
app.get('/api/outreach/count', async (req, res) => {
  try {
    const count = await prisma.outreach.count();
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/outreach — create record; 409 if threadId already exists
app.post('/api/outreach', async (req, res) => {
  try {
    const record = await prisma.outreach.create({ data: req.body });
    res.status(201).json(record);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'threadId already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/outreach/:threadId — partial update
app.patch('/api/outreach/:threadId', async (req, res) => {
  try {
    const record = await prisma.outreach.update({
      where: { threadId: req.params.threadId },
      data: req.body
    });
    res.json(record);
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/outreach/:threadId — delete
app.delete('/api/outreach/:threadId', async (req, res) => {
  try {
    await prisma.outreach.delete({ where: { threadId: req.params.threadId } });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.status(500).json({ error: e.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Reach server] Listening on http://localhost:${PORT}`);
});
