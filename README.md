# Reach

Reach is a Chrome extension that lives in Gmail, with a web dashboard that helps you track follow-ups.

When you send outreach emails, Reach tracks those threads and surfaces them in a simple kanban flow (Sent, Replied, Interviewing, Offer, Ghosted).

## What it does

- Runs as a Gmail-side widget while you use your inbox
- Tracks outreach threads when you send emails
- Displays tracked threads in a kanban-style dashboard
- Lets you drag cards between statuses
- Opens the original Gmail thread when you click a card
- Generates a follow-up draft in the sidebar (Gemini-powered)

## What you need

- Node.js 18+
- Google Chrome
- A Google Cloud project with Gmail API enabled
- A Gemini API key (only needed for follow-up drafting)

## Setup

### 1) Install dependencies

In one terminal:

```bash
cd server
npm install
```

In another terminal:

```bash
cd web
npm install
```

### 2) Configure OAuth for the extension (Gmail access)

1. Go to Google Cloud Console -> APIs & Services -> Credentials.
2. Create an OAuth 2.0 Client ID for a Chrome Extension flow.
3. Put that client ID in `extension/manifest.json` under `oauth2.client_id`.
4. In OAuth consent settings, add your Gmail account as a test user.
5. You will add the redirect URI after loading the extension (next section), because it includes your real extension ID.

### 3) Configure extension local file

Create `extension/config.js` from the template:

```bash
cp extension/config.js.template extension/config.js
```

`config.js` is gitignored. Keep real keys out of git.

### 4) Load the extension in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Copy the Extension ID shown in Chrome
5. Back in Google Cloud OAuth settings, add this redirect URI:

`https://<EXTENSION_ID>.chromiumapp.org/`

### 5) Configure web app env vars

Create `web/.env.local`:

```bash
cd web
touch .env.local
```

Add:

```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

If you do not care about AI follow-up drafting, you can leave this empty and skip that feature.

## Run locally

Start the API server:

```bash
cd server
npm run dev
```

Start the web app:

```bash
cd web
npm run dev
```

Then open `http://localhost:5173`.

## How to use it

1. Open the web dashboard first.
2. Open Gmail in another tab.
3. Send outreach emails as you normally would.
4. Let Reach track those threads and surface them in the board.
5. Move cards across columns as outreach progresses.
6. Click a card to jump to the Gmail thread.
7. Use "Draft Follow-up" in the sidebar if Gemini is configured.

## Quick notes

- Gmail permission is read-only (`gmail.readonly`).
- Data is stored through the local API (`http://localhost:3001`).
- If cards are not appearing, make sure:
  - server is running,
  - web app is running,
  - extension is loaded,
  - OAuth redirect URI includes your exact extension ID.