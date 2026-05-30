# Coldbase

Coldbase is a Chrome extension + web dashboard for managing cold outreach directly from Gmail. It auto-detects emails you send, tracks replies and opens, and organizes everything in a kanban pipeline — without ever leaving your inbox.

**Live at [coldbase.live](https://coldbase.live)**

## What it does

- Sits in Gmail and auto-detects cold outreach emails as you send them
- Tracks email opens via invisible tracking pixels
- Surfaces all outreach in a kanban board (Sent → Replied → Interviewing → Offer → Ghosted)
- Generates AI follow-up drafts inline (Gemini-powered)
- Syncs reply detection automatically in the background
- Supports notes, favorites, archiving, date filtering, and search
- Sends weekly or daily email digests of your pipeline
- Includes an insights panel with open rate and reply analytics

## Tech stack

**Extension** — Chrome MV3, vanilla JS, Gmail content script injection

**Web** — React 18, Vite 5, Tailwind CSS, React Router v7, DnD Kit (drag-and-drop), Recharts (analytics), Lucide icons

**Server** — Node.js, Express, Prisma ORM, PostgreSQL, JWT auth, Bcrypt, Zod (validation), node-cron

**Integrations** — Stripe (billing), Resend (email digests), Gemini API (follow-up drafts), Sentry (error monitoring), Google OAuth

## What you need

- Node.js 20+
- Google Chrome
- A Google Cloud project with Gmail API enabled
- PostgreSQL database
- A Gemini API key (only for follow-up drafting)

## Setup

### 1. Install dependencies

```bash
# Server
cd server && npm install

# Web
cd web && npm install
```

### 2. Configure the server

Create `server/.env`:

```bash
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
JWT_SECRET=your_secret_here
RESEND_API_KEY=your_resend_key
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
STRIPE_PRO_PRICE_ID=your_price_id
SENTRY_DSN=your_sentry_dsn         # optional
```

Run database migrations:

```bash
cd server && npx prisma migrate deploy
```

### 3. Configure the extension

Copy the config template:

```bash
cp extension/config.example.js extension/config.js
```

`config.js` is gitignored — keep real keys out of git.

### 4. Set up Google OAuth for the extension

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID for a Chrome Extension flow
3. Add the client ID to `extension/manifest.json` under `oauth2.client_id`
4. Add your Gmail account as a test user in OAuth consent settings

### 5. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Copy the Extension ID Chrome assigns
5. Back in Google Cloud, add the redirect URI: `https://<EXTENSION_ID>.chromiumapp.org/`

### 6. Configure the web app

Create `web/.env.local`:

```bash
VITE_API_URL=http://localhost:3001
VITE_GEMINI_API_KEY=your_gemini_key   # optional — only for AI follow-ups
```

## Run locally

```bash
# Terminal 1 — API server
cd server && npm run dev

# Terminal 2 — Web app
cd web && npm run dev
```

Open `http://localhost:5173`.

## How to use it

1. Sign up or log in at the web dashboard
2. Open Gmail — the extension loads automatically
3. Send cold outreach emails as normal
4. Coldbase detects them and adds them to your board
5. Drag cards across columns as conversations progress
6. Click any card to jump to the Gmail thread
7. Use "Draft Follow-up" in the sidebar for AI-generated replies
8. Check the Insights panel for open rate and reply trends

## Plans

Coldbase runs a free tier with a monthly lookup quota. Pro unlocks unlimited lookups, email digests, and advanced analytics. Billing is handled via Stripe.

## Notes

- Gmail access is read-only (`gmail.readonly` scope)
- Email open tracking uses invisible 1×1 tracking pixels embedded on send
- The extension injects into `mail.google.com` only
- Reply detection runs on a background cron — cards update without manual refresh
