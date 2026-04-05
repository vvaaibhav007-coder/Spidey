# SpideyWrite — AI Daily Writing Fixer

A production-ready micro SaaS focused on **one painful workflow**: turning messy daily text (emails, updates, client replies, notes) into clear, professional output in seconds.

## 1) Product idea + name

- **Name:** SpideyWrite
- **Audience:** Freelancers, junior professionals, and solo founders who send many text updates daily.
- **Problem:** They repeatedly waste time rewriting rough text into polished communication.
- **Solution:** One-tap workflow that summarizes, explains, and rewrites text with structured output and reusable sessions.
- **Why AI is needed:** The transformation quality depends on language understanding, intent extraction, tone adaptation, and context memory.

## 2) Full feature breakdown

### MVP Core
- Structured AI engine (`summary`, `explanation`, `transformed`, `keyPoints`, `actionItems`)
- Modes: Summarize / Explain / Transform
- Multi-step workflow: input → analyze → refine → output
- Session and run history with rerun support

### Smart UX
- Mobile-first, minimal UI
- Pre-built action buttons (no prompt crafting needed)
- Smart defaults (mode, tone, auto session)

### Advanced AI
- Short-term context memory (per user)
- Personalization (`level`, `style` preferences)
- Internal prompt optimization + token budget metadata
- Cache for repeated requests

### Integrations
- API-first architecture
- Telegram webhook-ready endpoint
- Copy to clipboard + text export

### Analytics + Feedback
- Event tracking and per-user analytics summary
- Thumbs up/down on outputs
- Error reporting endpoint

### Monetization
- Freemium usage limits (free daily cap)
- Paid tier upgrade endpoint
- Upgrade prompts on limit hit

### Performance/Cost
- SHA-based cache key for repeated inputs
- Input/token limits and processing cap
- Fast local processing path

### Auth/User
- Email + OTP (demo-safe flow)
- Persistent user profile, usage, and history

### UI/UX
- Dark mode + light mode toggle
- Fast static frontend served by Express

## 3) UI structure (pages + components)

Single page app (`public/index.html`):
- Login card: email + OTP
- Workflow card:
  - Preset mode buttons
  - Tone selector
  - Input textarea
  - Run / Rerun / New session
  - Output panel
  - Feedback buttons
  - History list
  - Analytics panel

## 4) Backend architecture

- Node.js + Express API server (`server.js`)
- Local SQLite persistence (`db.js`)
- AI processing module (`ai.js`)
- Static frontend (`public/*`)

Flow:
1. Authenticate user
2. Create/select session
3. Process workflow request with limits + cache + memory
4. Save run + analytics + feedback

## 5) Database schema

Tables:
- `users`
- `sessions`
- `workflow_runs`
- `usage_events`
- `usage_counters`
- `response_cache`

Defined in `/home/runner/work/Spidey/Spidey/db.js`.

## 6) API routes

- `GET /api/health`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `GET /api/me`
- `PATCH /api/preferences`
- `POST /api/billing/upgrade`
- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/:id/runs`
- `POST /api/ai/process`
- `POST /api/runs/:id/feedback`
- `POST /api/errors/report`
- `GET /api/analytics/summary`
- `POST /api/integrations/telegram/webhook`

## 7) Full working code (frontend + backend)

Implemented in:
- `/home/runner/work/Spidey/Spidey/server.js`
- `/home/runner/work/Spidey/Spidey/db.js`
- `/home/runner/work/Spidey/Spidey/ai.js`
- `/home/runner/work/Spidey/Spidey/public/index.html`
- `/home/runner/work/Spidey/Spidey/public/styles.css`
- `/home/runner/work/Spidey/Spidey/public/app.js`

## 8) Deployment steps

### Local
1. `npm install`
2. `npm test`
3. `npm start`
4. Open `http://localhost:3000`

### Render / Replit / Vercel (Node server)
1. Connect repo
2. Build command: `npm install`
3. Start command: `npm start`
4. Set env: `PORT` (optional)

## 9) Monetization strategy

- **Free:** 15 AI runs/day
- **Paid:** 1000 AI runs/day + priority usage
- In-app upgrade CTA appears when free usage limit is hit

## 10) Future expansion ideas

- Real LLM provider integration (OpenAI/Anthropic)
- Team workspaces + shared templates
- RAG over personal writing history
- Browser extension for instant rewrite in Gmail/LinkedIn
- Telegram bot command UX

---

## Run commands

- `npm start` — starts app
- `npm test` — smoke tests
