# MindFlow build phases

Status legend: ✅ done & tested · 🟡 partial · ⏳ not started

Current: **Phase 2 complete** · next: Phase 3 (AI intelligence).

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

## Phase 2 — Material management ✅

| Area | Status | Notes |
|---|---|---|
| Multiple uploads | ✅ | Drag & drop or browse, many files at once, 2 concurrent uploads, per-file progress, cancel, retry, "upload anyway" for duplicates. Files go **directly from the browser to private storage** via short-lived signed upload URLs (no serverless body-size limit). |
| Validation | ✅ | Client + server: extension/MIME, size (per plan), file-name sanitising (path traversal safe), plan material limit, upload rate limit (60/h); worker re-checks real content by magic bytes (spoofed types are rejected). |
| Duplicate detection | ✅ | SHA-256 computed in the browser; the student chooses to skip or upload anyway. |
| Library | ✅ | Filters: All, PDF, DOCX, TXT, Recently uploaded, Currently studying, Completed, Processing, Failed · search · subject & folder filters · sort (newest, recently opened, title, progress). Cards show name, type, size, page count, status, progress, subject/folder and associated study plan. |
| Organisation | ✅ | Subjects, courses and examinations (with exam date), folders and personal collections: create, rename, delete (materials are kept). Move one or many materials. |
| Multi-select | ✅ | Select several materials → combined study plan (opens the planner; plan generation is Phase 3), move, delete. |
| Material page | ✅ | Metadata, processing progress & warnings, detected structure with page ranges and estimated reading time, inline PDF preview / extracted-text preview, download original (signed URL, 5 min), rename, organise, replace file, delete, retry. |
| Replace / delete | ✅ | Replace keeps the material (and reading progress), rebuilds pages & sections, removes the old object. Delete removes every stored object, then the row (pages, sections, notes cascade). |
| Extraction | ✅ | PDF via `unpdf` (PDF.js) with original page numbers; DOCX via `mammoth` with heading levels; TXT/Markdown with heading heuristics. DOCX/TXT are split into estimated pages **only between paragraphs**, headings always stay with their content. |
| Structure | ✅ | Chapters → subtopics with page ranges from PDF bookmarks, DOCX heading styles, or typography (font size) as a fallback; running headers are ignored; reading time estimated at 160 wpm. AI segmentation into learning units is Phase 3. |
| OCR | ✅ | Image-only PDF pages are sliced into 8-page PDFs and transcribed by the AI provider (Claude reads PDFs); usage is metered. Without an AI key, documents still process and show which pages have no text; fully scanned documents fail with a clear message. |
| Background processing | ✅ | Postgres job queue with `claim_processing_job()` (SKIP LOCKED + lease), resumable state machine (extract → OCR → structure) that yields before the time budget, retries transient errors with exponential backoff (3 attempts), never retries file problems, notifies the student when ready or failed. Triggered after upload, by status polling, and by an optional cron (`/api/jobs/process`). Stale unfinished uploads are swept. |

**Tests added:** file validation & sniffing, pagination, section building, PDF (text, outline, typography headings, scanned pages, corrupted), DOCX (heading levels, corrupted), TXT; pipeline end-to-end with an in-memory store (OCR, missing OCR, fully scanned, spoofed type, deadline yield + resume, retry/backoff, OCR rate limiting); library filters; queue claiming under concurrency, lease expiry, one active job per material, no student access. Extraction verified inside the production Next.js server bundle.

**Not verified here:** real uploads to Supabase Storage and real OCR calls (no credentials in the sandbox).

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
