# Reach

A Chrome Extension (MV3) + React web dashboard that auto-detects cold outreach emails from Gmail and manages them in a Simplify-style kanban board.

**No backend.** `chrome.storage.local` is the source of truth, mirrored to `localStorage` via a scripting bridge. Solo use, demo environment.

---

## Architecture

```
internet-backyard-take-home/
├── shared/
│   └── constants.js          # COLUMNS, STORAGE_KEY, SYNC_KEY (imported by both halves)
├── extension/
│   ├── manifest.json         # MV3 manifest — permissions gate
│   ├── config.js             # GITIGNORED — fill in your credentials
│   ├── config.js.template    # Copy → config.js
│   ├── background.js         # Service worker: auth, Gmail scan, storage bridge
│   ├── classifier.js         # Cold outreach detection + field extraction
│   ├── storage.js            # chrome.storage.local + localStorage mirror
│   ├── content.js            # Placeholder injected into mail.google.com
│   └── gemini.js             # Reserved for future extension-side AI
└── web/
    ├── index.html
    ├── vite.config.js        # @shared alias → ../shared
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── index.css
        ├── App.jsx
        ├── hooks/
        │   └── useOutreach.js
        ├── lib/
        │   ├── utils.js
        │   ├── storage.js    # Reads/writes localStorage, same keys as extension
        │   └── gemini.js     # Gemini API follow-up drafting
        └── components/
            ├── KanbanBoard.jsx
            ├── KanbanColumn.jsx
            ├── OutreachCard.jsx
            ├── CompanyAvatar.jsx
            ├── SearchBar.jsx
            ├── Sidebar.jsx
            └── EmptyState.jsx
```

---

## Setup

### 1. Prerequisites

- Google Chrome (or Chromium)
- Node.js 18+
- A Google Cloud project with the Gmail API enabled
- A Gemini API key (from [Google AI Studio](https://aistudio.google.com))

### 2. Google OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** of type **Chrome Extension**
3. Note your Extension ID from `chrome://extensions` (after loading unpacked in step 4 below)
4. Add `https://<YOUR_EXTENSION_ID>.chromiumapp.org/` as an authorized redirect URI

### 3. Configure the Extension

```bash
cp extension/config.js.template extension/config.js
```

Edit `extension/config.js`:
```js
export const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
export const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';  // unused in MVP — reserved
```

> `config.js` is gitignored. Never commit real credentials.

### 4. Load the Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Note the Extension ID shown on the card
5. Add `https://<EXTENSION_ID>.chromiumapp.org/` to your GCP OAuth redirect URIs
6. Add your Gmail address as a **test user** in the GCP OAuth consent screen

### 5. Configure the Web Dashboard

```bash
cd web
cp /dev/null .env.local   # create the file
```

Edit `web/.env.local`:
```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### 6. Run the Web Dashboard

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Usage

1. **Open the dashboard tab first** (localhost:5173), then open Gmail
2. The extension scans automatically on install — cards appear in the dashboard when the storage event fires
3. **Drag cards** between columns (Sent → Replied → Interviewing → Offer → Ghosted)
4. **Click a card** → opens the Gmail thread in a new tab + opens the Sidebar
5. **Draft Follow-up** in the Sidebar → Gemini generates a 3-4 sentence follow-up
6. **Search** by company, contact name, or subject
7. **Refresh** button → triggers a manual re-scan of Gmail

---

## How Cold Outreach Detection Works

`classifier.js` checks the email body for 2+ matches from:

```
internship, summer, winter, fall, co-op, full-time, part-time,
opportunity, role, position, candidate, hiring, recruit
```

The 2-match threshold reduces false positives on personal or transactional emails.

---

## Data Flow

```
Gmail API
   ↓
background.js (service worker)
   ↓ chrome.storage.local
storage.js ──→ mirrorToLocalStorage()
                   ↓ chrome.scripting.executeScript into localhost:5173
                   ↓ localStorage + window.dispatchEvent('storage')
                   ↓
              useOutreach.js (React hook)
                   ↓
              KanbanBoard → KanbanColumn → OutreachCard
```

Status changes on the web app write back to `localStorage` immediately and display optimistically. They do **not** write back to `chrome.storage.local` — the next re-scan from the extension will pick up any merged state.

---

## End-to-End Verification

1. `cd web && npm install && npm run dev` → confirm `localhost:5173` loads with an empty board
2. Load extension unpacked at `chrome://extensions`
3. Fill in `extension/config.js` with your OAuth Client ID
4. Add extension ID to GCP redirect URIs; add your Gmail as a test user
5. Add `VITE_GEMINI_API_KEY` to `web/.env.local`
6. Open dashboard tab, then open Gmail
7. Extension scans on install → cards appear (storage event fires)
8. Confirm Clearbit logos load; initials fallback for unknown domains
9. Type a company name in the search bar → cards filter in real-time
10. Drag a card from "Sent" → "Replied" → "Interviewing" → confirm status persists on reload
11. Click a card → Gmail thread opens in a new tab
12. Click "Draft Follow-up" → Gemini draft appears in sidebar
13. Click Refresh → extension re-scans; "Last synced" timestamp updates

---

## Edge Cases

| Case | Handler |
|---|---|
| Token expires mid-session | `background.js`: catch 401, clear token, re-auth |
| OAuth denied / null redirect | Guard `if (!redirectUrl)` in `launchWebAuthFlow` callback |
| Clearbit 404 | `CompanyAvatar`: `onError` → initials fallback |
| Gemini API failure | `Sidebar`: catch + display error string |
| Drag to non-column target | `handleDragEnd`: guard `COLUMNS.includes(over.id)` |
| Zero records | Board-level `EmptyState context="board"` |
| Search with zero results | `EmptyState context="search"` |
| Web app closed during Gmail scan | `mirrorToLocalStorage`: tabs.length === 0, no-op |
| Multi-part email body | `extractBody`: try `parts[text/plain]` first, fall back to `payload.body.data` |
