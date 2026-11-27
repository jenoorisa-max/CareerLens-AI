# CareerLens AI

**Discover Your Career. Build Your Future.**

CareerLens AI is an AI-powered career guidance web app for students. A student
enters their education, skills, interests and goals; Google Gemini then
recommends career paths, analyses the student's skill gap for a chosen career,
and builds a step-by-step learning roadmap.

> [!WARNING]
> **Production is updated only through an explicitly approved merge to `main`.**
> Vercel deploys `main` to Production automatically. Never push or commit
> directly to `main`, never merge without approval, and always test changes on
> a Vercel **Preview** deployment of a feature branch first.

---

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Gemini model configuration](#gemini-model-configuration)
- [API behaviour](#api-behaviour)
- [Reliability: retries, timeouts and cooldown](#reliability-retries-timeouts-and-cooldown)
- [Session persistence](#session-persistence)
- [Testing](#testing)
- [Running in production mode locally](#running-in-production-mode-locally)
- [Deployment workflow (Vercel)](#deployment-workflow-vercel)
- [Security and privacy](#security-and-privacy)

---

## Features

| Feature | What it does |
|---|---|
| **Career Finder** | Takes the student's profile and returns **3 tailored career paths** with a match score, explanation, day-to-day work, core skills and growth outlook. Includes a sample profile for quick demos. |
| **Skill Gap Analyzer** | For a selected career: readiness score, skills the student already has, missing skills (Essential / Important / Helpful) and a prioritised learning sequence. |
| **Learning Roadmap** | A 4-stage roadmap (topics, tools, beginner resources and a hands-on project per stage). Uses the skill-gap result as context when available. Stages can be ticked off; the plan can be printed. |

Reliability features built into the app:

- Duplicate clicks reuse a request already in progress (no extra Gemini calls).
- A failed request is never retried automatically by switching tabs; the user retries deliberately.
- A short, global **15-second cooldown** after the AI service reports it is busy (HTTP 503) or over quota (HTTP 429).
- The current assessment and roadmap progress **survive a page refresh** (per browser tab).
- Form inputs enforce the same limits as the server.

---

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, lucide-react icons |
| Backend (production) | Vercel serverless functions in [`api/`](api/) |
| Backend (local) | Express 4 ([`server.ts`](server.ts)) with Vite middleware in development |
| AI | Google Gemini via `@google/genai` (structured JSON output with response schemas) |
| Tooling | `tsx` (runs TypeScript scripts and tests), `tsc` (type check), Bun lockfile (`bun.lock`) |
| CI | GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) |

---

## Architecture

```
Browser (React)                                   Server
──────────────────────────────                    ─────────────────────────────────────────
src/App.tsx                                       api/careers.ts   ┐ Vercel functions
  src/lib/requests.ts  request coordination       api/skill-gap.ts ├ (thin wrappers:
  src/lib/session.ts   sessionStorage persistence api/roadmap.ts   ┘  405 / JSON 400 / call handler)
  src/lib/api.ts       safe fetch (postJSON)      server.ts        ── local Express (same handlers)
  src/lib/tags.ts      tag limits                         │
  src/components/*     Career Finder, Skill Gap,          ▼
                       Learning Roadmap, Sidebar   src/server/handlers.ts  validate → prompt → Gemini → shape check
                                                   src/server/gemini.ts    retries, timeouts, safe errors, logging
            ┌───────────── shared (pure TS) ─────  src/server/prompts.ts   prompt text
            │ src/shared/profile.ts        profile validation + limits     src/server/schemas.ts   Gemini response schemas
            │ src/shared/responseShape.ts  response-shape validators       src/server/validation.ts sanitising AI data sent back
            └──────────── used by both the browser and the server
```

- **One implementation for both backends.** The Vercel functions (`api/*.ts`) and the
  local Express server call the same handlers in `src/server/handlers.ts`.
- **Shared validation.** `src/shared/` contains pure TypeScript with no runtime
  imports. It is used by the server (input validation, rejecting malformed AI output)
  and by the browser (form limits, validating restored session data). Browser code
  never imports from `src/server/`, so server-only code and the Gemini SDK never
  reach the browser bundle.
- **The Gemini API key is only read on the server** (`src/server/gemini.ts`).

---

## Local setup

### Prerequisites

- **Node.js 24** (recommended; the CI uses 24). Minimum: **Node 22.18+**, because
  `npm start` and some tests run `server.ts` directly with Node's built-in
  TypeScript support. `@google/genai` requires Node 22+.
- **Bun** (recommended for installing dependencies), because the repository's
  lockfile is `bun.lock`.
- A Google **Gemini API key** (free tier is sufficient) for real AI responses.
  Not needed for the automated tests.

### Install

```bash
git clone https://github.com/jenoorisa-max/CareerLens-AI.git
cd CareerLens-AI
bun install --frozen-lockfile     # installs exactly what bun.lock specifies
```

<details>
<summary>Installing with npm instead</summary>

There is no `package-lock.json`, so npm resolves versions within the ranges in
`package.json` rather than from the lockfile. An existing optional peer dependency
mismatch (`esbuild` vs Vite 8) also requires:

```bash
npm install --legacy-peer-deps
```
</details>

### Configure and run

```bash
cp .env.example .env              # then put your real key in GEMINI_API_KEY
npm run dev                       # http://localhost:3000 (Express + Vite dev server)
```

Other scripts:

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with Vite middleware |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm run build` | Production build of the frontend into `dist/` |
| `npm start` | Local production mode (see [below](#running-in-production-mode-locally)) |
| `npm test` / `npm run test:fast` / `npm run test:browser` | See [Testing](#testing) |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | **Yes** (for AI features) | Google Gemini API key. Used only on the server. If missing (or left as the `.env.example` placeholder `MY_GEMINI_API_KEY`), AI requests return a safe "temporarily unavailable" error and nothing is sent to Google. |
| `GEMINI_MODEL` | No | Overrides the Gemini model. Default: `gemini-3.1-flash-lite`. |
| `PORT` | No | Local server port. Default: `3000`. |

- **Locally:** copy [`.env.example`](.env.example) to `.env` (`.env` is git-ignored).
- **On Vercel:** set them in *Project Settings → Environment Variables*, separately for
  **Preview** and **Production**. Using a separate free API key for Preview protects the
  Production quota.

Never commit a real API key.

---

## Gemini model configuration

- Default model: **`gemini-3.1-flash-lite`** (set in `src/server/gemini.ts`; it supports
  structured JSON output and is available on the free tier).
- Override with `GEMINI_MODEL`. Any replacement must support **structured outputs**
  (`responseSchema`), because every feature depends on schema-validated JSON.
- If `GEMINI_MODEL` is set in Vercel, it overrides the default for that environment.
- There is deliberately **no fallback model**; only one model is used.
- Free-tier quotas apply **per Google Cloud project** (check your current limits at
  `https://aistudio.google.com/rate-limit`). Each full student journey uses roughly
  7 requests (1 career search + up to 3 skill gaps + up to 3 roadmaps), more if
  requests are retried.

---

## API behaviour

All endpoints accept and return JSON.

| Endpoint | Method | Body | Success |
|---|---|---|---|
| `/api/careers` | `POST` | Student profile | `200 { "data": { profileSummary, careers[3] } }` |
| `/api/skill-gap` | `POST` | `{ profile, career }` | `200 { "data": SkillGapAnalysis }` |
| `/api/roadmap` | `POST` | `{ profile, career, skillGap? }` | `200 { "data": LearningRoadmapData }` |
| `/api/health` | `GET` | – | `200 { "ok": true }` |

Errors are always `{ "error": "<safe, user-friendly message>" }`. Raw Gemini, SDK,
network or internal error text is never returned.

| Status | Meaning |
|---|---|
| `400` | Invalid input (e.g. missing name, limits exceeded) or malformed JSON (`"Invalid JSON request body."`) |
| `401` | AI service authentication problem (generic message) |
| `405` | Wrong HTTP method on an API route |
| `404` | Unknown `/api` path (local server) |
| `413` | Request body too large (local server) |
| `429` | Gemini rate limit or quota reached |
| `500` | AI service not configured, or unexpected error |
| `502` | AI output unusable (empty, invalid JSON, wrong shape) or unknown model |
| `503` | AI service busy/overloaded or unreachable |
| `504` | The AI took too long to respond |

**Input limits** (server and form, from `src/shared/profile.ts`): name 100, education
level 100, field of study 150 and career goals 2,000 characters; each skill/interest
80 characters; at most 30 skills and 30 interests.

**AI output is checked before it is returned.** Each response must match the shape the
frontend renders (`src/shared/responseShape.ts`); malformed output is retried once and
otherwise reported as a `502`.

---

## Reliability: retries, timeouts and cooldown

### Server (`src/server/gemini.ts`)

| Setting | Value |
|---|---|
| Maximum attempts per request | **3** |
| Timeout per attempt | **30 s**, reduced to fit the remaining budget |
| Total budget per request (all attempts + delays) | **75 s** (with a 250 ms safety margin, so it is never exceeded) |
| Retried | HTTP 500, 502, 503, 504, network errors, timeouts, empty responses, malformed JSON |
| Never retried | HTTP 400, 401, 403, 404, 429, and prompts blocked by Gemini |
| Delay for overload errors (500/502/503/504) | 2 s + up to 1 s random jitter, then 5 s + up to 2 s |
| Delay for other retryable errors | 0.5 s, then 1 s |
| Invalid response shape | Retried at most once |

Server logs contain one concise line per failed attempt (`[gemini] request failed {...}`)
with the error type, status, attempt, model and up to 300 characters of detail. API keys
are redacted; prompts, profiles and model output are never logged.

The Vercel Function Max Duration must stay **above 75 seconds** (the project uses 300 s).

### Browser (`src/lib/`)

- **Request coordination:** one in-flight request per session, feature and career;
  repeated clicks reuse it. A new assessment never reuses an older session's request,
  and late responses from an older session are ignored.
- **Roadmap context:** a roadmap waits for the same career's skill gap if it is still
  loading, and uses it as context.
- **Failures:** switching tabs never automatically retries a failed request; buttons
  (Re-analyze, Regenerate, Try again) retry deliberately.
- **Cooldown:** after an HTTP **503 or 429**, all AI requests pause for **15 seconds**
  across all features. Buttons show "Try again in Ns". The cooldown survives a refresh.
- **Client timeout:** 95 s, only as a safety net (the server always answers within 75 s).
- Non-JSON error responses (e.g. a platform error page) are turned into friendly messages.

---

## Session persistence

- Stored in **`sessionStorage`** under `careerlens:session:v1`: the profile, career
  results, selected career and tab, skill gaps, roadmaps and ticked roadmap stages.
- **Scope:** per browser tab; cleared when the tab is closed. Not shared between tabs or
  devices, and never sent to a server.
- **Validation on restore:** wrong version, data older than 24 hours, an invalid profile
  or invalid career results discard the whole session; individual invalid skill gaps,
  roadmaps or progress entries are dropped.
- **New Assessment** clears the saved session. **Regenerating** a roadmap clears that
  career's ticked stages.
- If the browser blocks storage (e.g. some private modes), the app works normally without
  persistence.
- The cooldown end time is stored separately under `careerlens:cooldownUntil`.

---

## Testing

No test calls the real Gemini API or uses quota; Gemini is always mocked. No extra
packages are needed. Details: [`tests/README.md`](tests/README.md).

| Command | What it runs | Prerequisites |
|---|---|---|
| `npm test` | All automated suites (about 3 minutes, includes real-time 75 s budget checks) | Dependencies installed; ports 3131–3132 free |
| `npm run test:fast` | Same, skipping the real-time timeout/budget checks | Same |
| `npm run test:browser` | Real-browser checks in headless Edge/Chrome (cooldown, session persistence, form limits) | Edge or Chrome installed (or `BROWSER_PATH` set); ports 3123 and 9333 free |

Also run `npm run lint` and `npm run build` before committing.

**CI:** GitHub Actions runs `npm run lint`, `npm run build` and `npm test` on every push
and pull request, using Node 24 and `bun install --frozen-lockfile`. It needs no secrets.
Browser checks are run locally.

---

## Running in production mode locally

```bash
npm run build      # builds the frontend into dist/
npm start          # node server.ts --production  ->  http://localhost:3000
```

In production mode the Express server serves the built app from `dist/`, falls back to
the app for any non-API path (so refreshing on any page works), and returns JSON 404/405
for unknown or wrong-method `/api` requests. `npm start` does not build automatically.

---

## Deployment workflow (Vercel)

The GitHub repository is connected to Vercel. Vercel builds every push; GitHub Actions
never deploys.

1. **Work on a feature branch** (never on `main`).
2. **Run checks locally:** `npm run lint`, `npm run build`, `npm test`
   (and `npm run test:browser` for UI changes).
3. **Push the branch.** Vercel creates a **Preview** deployment with its own URL
   (Preview URLs require being logged in to Vercel). Make sure `GEMINI_API_KEY` is set
   for the Preview environment.
4. **Test the Preview** with real Gemini: the full flow, a page refresh, mobile layout,
   and the Vercel **Logs** for `[gemini]` lines. Check the security headers in the
   browser's Network tab.
5. **Open a pull request** into `main`; CI must pass.
6. **Merge to `main` only after explicit approval.** This deploys to **Production**.
7. If something goes wrong, use Vercel **Instant Rollback** to restore the previous
   Production deployment.

Recommended (configured in the Vercel dashboard, not in code): one **Firewall
rate-limit rule** for `POST` requests to `/api/`, per IP (for example about 20 requests
per 10 minutes). Start it in **Log** mode, review the traffic, then switch to 429.

---

## Security and privacy

- **API key:** server-only; never sent to the browser, never logged (redacted in logs).
- **No raw errors:** users only ever see fixed, friendly messages.
- **Input validation:** strict limits and type checks on every API request; AI output
  sent back by the browser is sanitised before it is used in a prompt.
- **Security headers** (`vercel.json`): `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a
  restrictive `Permissions-Policy`. A Content Security Policy is not configured yet.
- **Abuse and quota protection:** client-side request de-duplication and cooldown; a
  Vercel Firewall rate-limit rule is recommended (see above). There is no user
  authentication yet, so the API is public.
- **Student data:** the app has no database and no accounts. Profile and results are
  kept only in the student's own browser tab (`sessionStorage`) and are sent to Google
  Gemini to generate results. Logs contain no prompts or student details.
- **Third-party processing:** requests are processed by Google Gemini under Google's
  terms. Review Google's data-use terms for the plan in use (free-tier data may be
  handled differently from paid tiers) before using the app with real student data.
- **Never commit secrets** (`.env` is git-ignored).
