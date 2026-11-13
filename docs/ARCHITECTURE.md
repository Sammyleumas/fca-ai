# MindFlow — Architecture & Implementation Plan

> Study Smarter. Achieve More.

This document is the source of truth for how MindFlow is put together. It is
kept up to date as each phase lands (see `docs/PHASES.md` for status).

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) | Dynamic rendering; `cacheComponents` is **off** because every app screen is per-user data read from the session cookie. |
| Styling | Tailwind CSS v4 + CSS design tokens in `src/app/globals.css` | Dark cinematic glassmorphism, tokens mirror the approved palette. |
| Motion | `motion` (Framer Motion's current package, `motion/react`) | Only meaningful transitions; respects `prefers-reduced-motion`. |
| Icons | `lucide-react` | |
| Backend | Supabase: Postgres, Auth, Storage, RLS | Accessed only through `@supabase/ssr` clients created per request. |
| Validation | `zod` | Every server action / route handler validates its input. |
| AI | `src/lib/ai` provider abstraction; default provider Anthropic (`@anthropic-ai/sdk`, model `claude-opus-5-5`) | Server-only. Providers are swappable via `AI_PROVIDER`. |
| Tests | Vitest (unit), Postgres-backed RLS/SQL tests, Playwright (UI smoke) | |
| Deploy | Vercel + Supabase | See `docs/DEPLOYMENT.md`. |

## 2. Folder structure

```
mindflow/
├─ docs/                     architecture, phases, deployment, design references
├─ supabase/
│  ├─ migrations/            versioned SQL (schema, RLS, functions, storage, seed catalog)
│  └─ config.toml            local Supabase CLI config
├─ scripts/                  local tooling (RLS test DB bootstrap, screenshots)
├─ tests/
│  ├─ unit/                  pure TypeScript logic
│  ├─ db/                    migrations + RLS + SQL functions against real Postgres
│  └─ e2e/                   Playwright smoke tests
└─ src/
   ├─ proxy.ts               session refresh + optimistic route gating (Next 16 "proxy", ex-middleware)
   ├─ app/
   │  ├─ (marketing)/        welcome screen
   │  ├─ (auth)/             login, signup, forgot/reset password, verify email
   │  ├─ auth/               confirm + OAuth callback route handlers, sign-out
   │  ├─ onboarding/         multi-step profile & learning preferences
   │  ├─ (app)/              authenticated shell: dashboard, library, planner, reader,
   │  │                      tutor, assessments, flashcards, analytics, achievements,
   │  │                      notifications, settings
   │  └─ api/                route handlers (AI chat streaming, webhooks, jobs)
   ├─ components/
   │  ├─ ui/                 design-system primitives (Button, Input, GlassCard, ProgressRing…)
   │  ├─ brand/              logo, silk background
   │  ├─ layout/             Sidebar, TopBar, BottomNav, AppShell
   │  └─ dashboard/ …        feature components
   ├─ lib/
   │  ├─ supabase/           server / browser / proxy / admin clients
   │  ├─ auth/               data-access layer (`requireUser`, `getProfile`)
   │  ├─ ai/                 provider interface, Anthropic provider, prompts, guards
   │  ├─ billing/            plan limits, entitlement checks (server-side)
   │  ├─ data/               typed queries per domain (dashboard, materials, …)
   │  ├─ validation/         zod schemas shared by forms and actions
   │  ├─ rate-limit.ts       Postgres-backed fixed-window limiter
   │  └─ utils/              dates/time zones, formatting
   └─ types/database.ts      hand-maintained DB types (regenerate with `supabase gen types`)
```

## 3. Request flow & security model

1. `src/proxy.ts` refreshes the Supabase session cookie on every request and
   performs an *optimistic* redirect (unauthenticated → `/login`,
   authenticated on auth pages → `/dashboard`). It is not the security boundary.
2. Every server component, server action and route handler calls the
   data-access layer (`requireUser()`), which verifies the JWT with
   `supabase.auth.getClaims()`. Server actions re-authorise themselves.
3. Postgres Row Level Security is the real boundary: every user-owned table
   has `user_id` and policies of the form `user_id = (select auth.uid())`.
   Child rows use **composite foreign keys** `(parent_id, user_id) →
   parent(id, user_id)` so a user can never attach a row to another user's
   material, plan, quiz, etc.
4. Tables that award value (streaks, XP, achievements, subscriptions, AI usage,
   rate-limit buckets) are **not writable** by the `authenticated` role. They
   change only through `SECURITY DEFINER` functions with fixed rules, or the
   service-role key used by trusted server code (webhooks, background jobs).
5. Storage bucket `materials` is private; object paths are
   `{user_id}/{material_id}/{filename}` and storage policies check the first
   path segment. Downloads use short-lived signed URLs.
6. AI calls happen only on the server. Document text is passed to the model as
   clearly delimited, untrusted data; system prompts instruct the model to
   ignore instructions found inside documents, and no AI output can trigger
   tool actions without server-side validation.

## 4. Database schema (summary)

Full DDL: `supabase/migrations/`. Enumerations are Postgres enums.

| # | Table | Purpose / key columns |
|---|---|---|
| 1 | `profiles` | 1:1 with `auth.users`; preferred name, education level, goals, daily minutes, time zone, notification & reading prefs, onboarding state, XP |
| 2 | `subjects` | subjects / courses / examinations (`kind`), optional exam date |
| 3 | `folders` | custom folders & personal collections (nested via `parent_id`) |
| 4 | `materials` | uploaded documents; file meta, checksum (duplicate detection), page count, processing `status` (uploaded → queued → extracting → analysing → structuring → ready / failed) |
| 5 | `material_pages` | extracted text per page (`ocr_used` flag) |
| 6 | `document_processing_jobs` | background job queue with attempts, locking, progress, error |
| 7 | `document_sections` | hierarchical chapters → subtopics → learning units with page ranges, complexity, estimated minutes, objectives |
| 8 | `study_plans` | individual / combined plans; deadline, daily minutes, study days, workload, version |
| 9 | `study_plan_materials` | materials in a plan (many-to-many) |
| 10 | `study_sessions` | dated sessions (study / revision / assessment) with status incl. missed / rescheduled |
| 11 | `study_tasks` | ordered tasks inside a session, linked to section + page range |
| 12 | `reading_progress` | per material: current page, completed sections, percent, total seconds |
| 13 | `bookmarks` | page bookmarks |
| 14 | `highlights` | colour, text, page, anchor rects |
| 15 | `notes` | free notes optionally tied to a page / highlight / section |
| 16 | `ai_conversations` | general vs grounded conversations, optional material/section context |
| 17 | `ai_messages` | messages with citations (material, page) and token usage |
| 18 | `quizzes` | daily / practice / mock quizzes, source sections |
| 19 | `quiz_questions` | mcq / true_false / fill_blank / short_answer / theory, source page |
| 20 | `quiz_attempts` | attempts with score & feedback |
| 21 | `quiz_answers` | per-question answers and grading |
| 22 | `flashcards` | SM-2 style scheduling fields (ease, interval, repetitions, due_at) |
| 23 | `flashcard_reviews` | review log (difficult / practice / know) |
| 24 | `study_streaks` | current / longest streak, last qualifying date (user time zone) |
| 25 | `achievements` | public catalogue |
| 26 | `user_achievements` | earned badges |
| 27 | `study_activity` | activity ledger; source for streaks & analytics |
| 28 | `notifications` | in-app notifications, scheduled_for for reminders |
| 29 | `subscriptions` | plan, provider (stripe / paystack), status; written only by webhooks |
| + | `ai_usage_events` | metering for AI usage limits |
| + | `rate_limit_buckets` | fixed-window rate limiting |

Key SQL functions: `handle_new_user()` (trigger: profile + streak + free
subscription), `record_study_activity()` (ledger + streak + XP + achievement
checks, time-zone aware), `check_rate_limit()`, `set_updated_at()`.

## 5. AI service layer

```
lib/ai/
  types.ts          AIProvider interface: generateText, generateObject (zod), streamText
  providers/anthropic.ts
  index.ts          getAIProvider() — chosen by AI_PROVIDER env, default "anthropic"
  guard.ts          entitlement + usage metering + rate limiting wrapper
  prompts/          system prompts per feature (tutor, segmentation, planner, quiz…)
```

Feature services (segmentation, planner, quiz generation, grading, flashcards)
depend only on the interface, so swapping providers is a config change.
Large documents are processed in page-bounded chunks; never in one request.

## 6. Phases

See `docs/PHASES.md` for the detailed checklist and current status.
