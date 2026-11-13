# MindFlow build phases

Status legend: ✅ done & tested · 🟡 partial · ⏳ not started

## Phase 1 — Foundation ✅

| Area | Status | Notes |
|---|---|---|
| Project setup (Next.js 16, TS strict, Tailwind v4, Motion, Lucide, ESLint) | ✅ | `cacheComponents` off: all app screens are per-user. |
| Design system | ✅ | Tokens in `globals.css`; Button, TextField/PasswordField, GlassCard, ProgressBar/Ring, FileBadge, AchievementBadge, EmptyState, FormMessage, Logo, SilkBackground. |
| Responsive layouts | ✅ | Desktop sidebar · tablet icon rail · mobile bottom nav + "More" sheet. Verified at 390 / 834 / 1440 px, no horizontal overflow. |
| Authentication | ✅ | Sign-up (with verification email), login, logout (POST), forgot/reset password, resend verification, OAuth buttons (Google / Apple / Microsoft — require provider setup in Supabase), open-redirect protection. |
| Onboarding | ✅ | Name (required) · education level · subjects · goals · daily time & preferred time · notifications · completion. Non-essential steps skippable; time zone auto-detected. |
| Database | ✅ | All 29 specified tables + `ai_usage_events`, `rate_limit_buckets`; composite-FK ownership; RLS on every table; column-level grants; storage bucket + policies; achievement catalogue. |
| Dashboard | ✅ | Greeting (user time zone), streak + 7-day chart, today's mission, daily progress, overview stats, upcoming sessions, recent materials, achievements, quick actions, AI assistant, premium card. All values from `dashboard_stats()` and live queries — empty states for new students. |
| AI service layer | ✅ | Provider interface + Anthropic provider (streaming, structured output, server-side refusal fallback), burst rate limit + daily plan quota, usage metering. |
| AI Tutor (general mode) | ✅ | Streaming chat, conversation history, AI replies labelled "general knowledge"; student message persisted before the model is called. Material-grounded mode arrives in Phase 3/4. |
| Settings | ✅ | Profile, time zone, learning prefs, notification prefs, password change (re-auth), JSON data export, account deletion (storage + cascade). |
| Notifications centre | ✅ | List, mark read, mark all read, delete. Scheduled reminders are produced in Phase 6. |
| Achievements | ✅ | Catalogue + earned badges, streak & XP stats. Awarded by `record_study_activity()`. |
| Plans page | ✅ | Free vs Premium limits (`src/lib/billing/plans.ts`); no payment taken until Phase 7. |
| Search | ✅ | Material title search + "Ask the AI Tutor". |

**Tests:** 18 unit · 18 database (RLS isolation, composite FKs, column grants, hidden quiz answers, streak rules
incl. time zones and idempotency, XP cap, rate limiting, storage folders, dashboard aggregates) · 18 Playwright
smoke checks across three viewports. Production build passes.

**Not verified in this environment:** live Supabase Auth email delivery, OAuth providers and real Anthropic calls
(no credentials in the build sandbox). These paths are type-checked and follow the official SDK APIs; verify them
against your Supabase project before launch.

## Phase 2 — Material management ⏳
Multi-file upload (drag & drop, progress, cancel, retry), validation & duplicate detection (checksum), private
storage with signed URLs, library organisation (subjects/courses/exams/folders/collections), filters, replacement,
deletion, PDF/DOCX/TXT extraction, OCR for scanned PDFs, background processing jobs with retry.

## Phase 3 — AI intelligence ⏳
Chunked document analysis, chapter → subtopic → learning-unit segmentation with page references, individual &
combined study plans, adaptive rescheduling with student approval, material-grounded tutor with citations.

## Phase 4 — Reading experience ⏳
PDF.js reader, TOC & search, zoom/fullscreen/focus mode, highlights, notes, bookmarks, resume position, reading
progress & time tracking, AI passage tools, text-to-speech.

## Phase 5 — Learning assessment ⏳
Daily quizzes from assigned sections, all question types, timer, server-side grading (AI for open answers),
results & review (via `get_attempt_review`), retries, flashcards with spaced repetition.

## Phase 6 — Engagement ⏳
Scheduled reminders (time-zone aware), analytics pages, weekly goals & challenges, monthly reports.

## Phase 7 — Monetisation & launch ⏳
Paystack + Stripe checkout and webhooks (server-side entitlement), security review, full E2E journey test,
production deployment.
