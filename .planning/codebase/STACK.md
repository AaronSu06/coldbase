# Technology Stack

**Analysis Date:** 2026-03-12

## Languages

**Primary:**
- JavaScript (ES modules) - Web frontend, browser extension, server APIs
- SQL - SQLite database queries via Prisma

**Secondary:**
- Markdown - Documentation

## Runtime

**Environment:**
- Node.js - Server runtime (`/Users/aaron/Documents/GitHub/reach/server/index.js`)
- Chrome/Chromium - Browser extension runtime
- Modern browser (Chrome/Edge) - Web frontend via Vite

**Package Manager:**
- npm - Both web and server use npm with lockfiles
- Lockfile: `package-lock.json` present for `/web` and `/server`

## Frameworks

**Core:**
- React 18 - Web frontend UI framework (`/Users/aaron/Documents/GitHub/reach/web/package.json`)
- Express 4 - Server HTTP framework for REST APIs (`/Users/aaron/Documents/GitHub/reach/server/index.js`)
- Vite 5 - Web build tool and dev server (`/Users/aaron/Documents/GitHub/reach/web/vite.config.js`)

**UI Styling:**
- Tailwind CSS 3 - Utility-first CSS framework (`/Users/aaron/Documents/GitHub/reach/web/tailwind.config.js`)
- PostCSS 8 - CSS processing pipeline
- Autoprefixer 10 - CSS vendor prefixes

**Drag & Drop:**
- @dnd-kit/core 6 - React drag-and-drop library
- @dnd-kit/sortable 7 - Sortable list functionality
- @dnd-kit/utilities 3 - Supporting utilities

**Database:**
- Prisma 5 - ORM and database migration tool (`/Users/aaron/Documents/GitHub/reach/server/prisma/schema.prisma`)
- SQLite - Embedded database file at `./dev.db`

**Validation & Schema:**
- Zod 3 - TypeScript-first schema validation (`/Users/aaron/Documents/GitHub/reach/server/emailFinder.js`)
- zod-to-json-schema 3 - Convert Zod schemas to JSON Schema for AI tool calls

**Chrome Extension:**
- Chrome Extension API (Manifest V3) - Extension infrastructure (`/Users/aaron/Documents/GitHub/reach/extension/manifest.json`)

## Key Dependencies

**Critical:**
- @prisma/client 5 - Database client for querying Outreach and TrackingPixel models
- express 4 - HTTP request routing and middleware
- cors 2 - Cross-origin request handling
- dotenv 16.6.1 - Environment variable loading from `.env`

**Infrastructure:**
- dns (Node.js built-in) - Domain resolution for email domain validation (`/Users/aaron/Documents/GitHub/reach/server/index.js` lines 165-168)
- net (Node.js built-in) - Network utilities for SMTP email verification

**Frontend:**
- react-dom 18 - React DOM rendering
- @vitejs/plugin-react 4 - Fast Refresh for React in Vite

## Configuration

**Environment:**
- `.env` file in `/server` directory - Contains GEMINI_KEY and REACH_SECRET
- `.env.example` provided showing required variables (GEMINI_KEY, REACH_SECRET)
- `.env.local` in web directory for client-side Vite env vars (VITE_GEMINI_API_KEY)
- Web uses Vite's `import.meta.env.VITE_*` pattern for environment variables

**Build:**
- `vite.config.js` - Vite build configuration with React plugin and shared path alias
- `tailwind.config.js` - Tailwind theme customization (DM Sans font, custom accent colors, shadows)
- Prisma migrations in `/server/prisma/migrations/` - Schema evolution tracked

**Chrome Extension:**
- `manifest.json` - Chrome Extension Manifest V3 configuration
- OAuth2 configured for Gmail API access with Google OAuth client ID
- Port 3001 and localhost:5173 configured as runtime hosts

## Platform Requirements

**Development:**
- Node.js (ES modules support required)
- npm
- Chrome browser (for extension testing)
- Local SQLite database initialized at `./dev.db`

**Production:**
- Node.js server
- Chrome/Chromium-based browser (extension deployment)
- SQLite database (can be replaced with production DB by changing Prisma datasource)
- Environment variables: GEMINI_KEY, REACH_SECRET configured

**API Integrations:**
- Google Gmail API access via OAuth2
- Google Gemini API (generative text models)
- Clearbit API (company/email enrichment in extension classifier)

---

*Stack analysis: 2026-03-12*
