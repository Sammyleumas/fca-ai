# FCA-AI

**Study Smarter. Achieve More.** An AI-powered study companion: upload learning materials, let AI organise them
into study sections, follow a personalised plan, read in a focused Reading Room, practise with daily quizzes
and flashcards, and track real progress.

> Built in phases — see [`docs/PHASES.md`](docs/PHASES.md) for what works today.
> Architecture, schema and security model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
> Deploying to Vercel + Supabase: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
> Approved UI designs: [`docs/design/`](docs/design).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Motion · Lucide ·
Supabase (Postgres, Auth, Storage, RLS) · Anthropic Claude via a swappable provider layer · Vitest · Playwright.

## Quick start

```bash
git clone https://github.com/Sammyleumas/fca-ai.git
cd fca-ai
npm install
cp .env.example .env.local          # fill in Supabase + Anthropic keys
npx supabase link --project-ref <ref> && npx supabase db push   # apply migrations
npm run dev                          # http://localhost:3000
```

Without Supabase keys the public pages still render and show a setup notice.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve build |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run test:unit` | Pure logic tests (dates, formatting, validation) |
| `npm run test:db` | Recreates a throwaway Postgres DB with a Supabase shim + all migrations and runs RLS / SQL-function tests. Needs local Postgres 15+ (`TEST_DATABASE_URL`). |
| `npm run test:e2e` | Playwright UI smoke test against a running server (`BASE_URL`) |

## Development notes

- `src/app/dev-preview/[screen]` renders real UI components with **labelled sample data** for visual QA
  (`/dev-preview/dashboard`, `/dev-preview/dashboard-empty`, `/dev-preview/tutor`). It returns 404 outside `next dev`.
- Never import `src/lib/server-env.ts`, `src/lib/supabase/admin.ts` or `src/lib/ai/*` from client components.
