# Coldbase

Coldbase is a Chrome extension + web dashboard for managing cold outreach from Gmail. It auto-detects emails you send, tracks opens and replies, and organizes everything in a kanban pipeline.

**Live at [coldbase.live](https://coldbase.live)**

## What it does

- Auto-detects cold outreach emails as you send them from Gmail
- Tracks email opens and reply activity in the background
- Organizes outreach in a kanban board (Sent → Replied → Interviewing → Offer → Ghosted)
- Finds contact and company info for leads automatically
- Generates AI follow-up drafts inline
- Sends weekly or daily email digests of your pipeline
- Insights panel with open rate and reply analytics

## Tech stack

**Extension** — Chrome MV3, vanilla JS

**Web** — React 18, Vite, Tailwind CSS, React Router v7, DnD Kit, Recharts

**Server** — Node.js, Express, Prisma, PostgreSQL, JWT, Stripe, Zod

**Monitoring** — Sentry
