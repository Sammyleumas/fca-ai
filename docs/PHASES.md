# FCA-AI build phases

> Renamed from MindFlow to **FCA-AI** with the FCA-AI palette (royal blue #0000A1, sky #00BFFF, yellow #FFEB3B, black, white) and the shield-and-rings logo.
>
> **Guest access:** "Continue as guest" on the welcome, sign-in and sign-up pages opens the full app without an account (Supabase anonymous sign-in). Guests see a banner to save their account (email link → choose a password) and keep all their work.

Status legend: ✅ done & tested · 🟡 partial · ⏳ not started

Current: **Phase 6 complete** · next: Phase 7 (Monetisation & launch).

Repository: https://github.com/Sammyleumas/fca-ai (moved from `Ayo-food/fca-ai` with full history).

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

## Phase 3 — AI intelligence ✅

| Area | Status | Notes |
|---|---|---|
| Document analysis & segmentation | ✅ | New `analysing` processing stage. Each detected chapter/subtopic (or the whole document if it had no structure) is sent to the AI in **page-bounded windows** (≤ 12 pages / 24k chars, never the whole document), which returns learning units with titles, page ranges, summary, complexity 1–5, learning objectives and key concepts. Output is validated: pages are clamped to the window, gaps closed, overlaps reduced to one shared boundary page, duplicates removed; reading time is recomputed from real word counts. Resumable across invocations; failed windows fall back to detected sections with a warning; "Analyse with AI" re-runs it for older materials. |
| Prompt-injection safety | ✅ | Document text is delimited as untrusted data in every prompt (segmentation, OCR, grounded tutor); tags inside documents are stripped so content can't break out of its block; AI output never triggers actions without server-side validation. |
| Study plan engine | ✅ | Deterministic and unit-tested (`src/lib/planner/scheduler.ts`). It schedules analysed units — never blind page ranges — using complexity-weighted time, the student's study days, daily time and workload (light 80 % / balanced / intensive 120 %). Spreads work evenly (no front-loading), splits only units longer than a day (by pages), adds a daily quiz session, weekly revision and a final revision + mock assessment, dropping revision days before it would overflow. |
| Individual & combined plans | ✅ | Combined plans interleave materials by proportional progress, keeping each material's order, so all materials finish near the deadline. One timetable, one set of sessions. |
| Feasibility | ✅ | If the work can't fit, the preview explains the required daily time and offers one-click fixes: more minutes, the earliest deadline that fits, or every day. Infeasible plans can't be saved. |
| Plan creation | ✅ | Server recomputes the plan (client sessions are never trusted) and saves plan, materials, sessions and tasks in one transaction (`create_study_plan`). Plan limits per subscription. |
| Daily progress | ✅ | Ticking off tasks records verified `task_completed` / `session_completed` activity → streaks, XP, achievements; sessions and plans complete automatically. Skip / restore tasks. |
| Manual editing | ✅ | Move sessions to another day (warns past the deadline), skip tasks, archive / restore / delete plans. |
| Adaptive rescheduling | ✅ | Missed study sessions are detected; FCA-AI proposes a new schedule for every unfinished task from today, keeping order and realistic loads and the deadline whenever possible (otherwise it proposes the earliest later deadline). The student reviews and approves; the change is applied atomically (`apply_plan_reschedule`), refuses stale proposals, never moves completed work, and sends a "plan changed" notification. Nothing is overwritten silently. |
| Material-grounded AI tutor | ✅ | Postgres full-text search (`search_material_pages`, RLS-scoped) + the pages of the section being studied. Answers cite numbered sources; only citations of passages actually provided are kept and shown as "Material · p. N" chips. If the material doesn't cover the question, the tutor says so and labels general knowledge. General mode remains available; the student picks "Answer from" per conversation. Opened from a material or a study session with context. |
| Dashboard | ✅ | Today's Mission and Upcoming Plan now come from real plans; links open the study session. |

**Tests added:** scheduler (14), segmentation windows & normalisation (5), pipeline analysis stage (4, incl. failures and resume), grounding helpers (3), database: atomic plan creation, cross-user rejection, reschedule rules, page search isolation (4).

**Not verified here:** live AI segmentation / tutor quality (no API key in the sandbox).

## Phase 4 — Reading experience ✅

| Area | Status | Notes |
|---|---|---|
| Original document rendering | ✅ | PDFs render from the original file with PDF.js (canvas + selectable text layer, HiDPI, lazy pages that free memory when far away, signed URL with range requests). DOCX/TXT render their extracted pages (formatting simplified, labelled "estimated" page numbers). Full-screen route without app chrome, like the design. |
| Navigation | ✅ | Previous/next, go-to-page, keyboard (←/→, PgUp/PgDn, j/k, Esc), table of contents with nested sections and per-section "read" ticks, current section in the header, search within the document (server-side literal search with snippets; matches highlighted in text documents). |
| Reading preferences | ✅ | Zoom (PDF), "dark pages" for PDFs, font size, line spacing, Dark / Sepia / Light themes (text), focus mode, fullscreen, read-aloud speed — saved to the profile. |
| Highlights | ✅ | Six colours, change colour, delete, note on a highlight, explain a highlight. Anchors are zoom-proof (normalised rects on PDFs, character offsets on text pages) and validated server-side. |
| Notes & bookmarks | ✅ | Notes on a page or highlight (create / edit / delete), searchable list of highlights and notes, bookmarks per page. |
| Copy | ✅ | Copy selected text. |
| AI reading assistant | ✅ | On any selection: Explain simply, Summarise, Give an example, Practice questions, Explain difficult terms, Ask a question. Without a selection: summarise the current section, explain the page. The server always loads the page context itself (document text treated as untrusted), responses stream into a panel clearly labelled "AI · not part of your document", with a link to continue in the grounded AI Tutor. Metered against the plan's daily AI limit. |
| Text-to-speech | ✅ | Browser speech synthesis (on-device), sentence-chunked, pause/resume/stop, adjustable speed, continues onto the next page. |
| Progress | ✅ | Current page and position saved every 20 s and on tab close (sendBeacon); a page counts as read after 8 s of active viewing; active time only (visible tab + recent interaction or read-aloud). `save_reading_progress()` merges pages atomically, computes % and completed sections, caps time per save, and turns whole minutes into reading activity (XP, no streak). Resume exactly where you stopped. |
| Planner integration | ✅ | Study tasks open the reader at their pages with a "Today's task" bar and "Mark task complete"; tutor citations open the cited page; "Continue reading" list at /reader. |

**Tests added:** anchors, rect merging, text segmentation, snippets, active-time tracker (unit); `save_reading_progress` merge / percent / sections / time cap / activity / isolation (database). The Reading Room was exercised in a real browser (dev preview with a mock API): PDF rendering, drag selection on the text layer, highlight overlay, AI panel, navigation & section tracking, mobile layout, themes and font size.

**Bugs found and fixed while testing:** hydration mismatch from detecting speech support during render; preferences menu hidden behind the side panel; floating toolbar and toasts unreadable over white PDF pages.

## Phase 5 — Learning assessment ✅

| Area | Status | Notes |
|---|---|---|
| Daily quizzes | ✅ | Each study day's assessment session generates a quiz from **exactly the sections assigned that day** (including rescheduled tasks). One live daily quiz per session; retries reuse it; failed generation can be retried. Completing it completes the session (streak credit). |
| Practice quizzes & mock exams | ✅ | From a material (optionally chosen chapters) or from a study plan (prefers what's been studied). Choose count, question types and timing. Plan quota: AI quizzes per day. |
| Question types | ✅ | Multiple choice, true/false, fill in the blank, short answer, theory. |
| No unsupported facts | ✅ | Questions are generated only from page excerpts; each must cite a page that was actually provided or it is discarded; malformed/duplicate questions are dropped. Excerpts are delimited as untrusted data. |
| Quiz experience | ✅ | Question X of N, countdown with auto-submit, previous/next, question navigator showing answered items, local draft that survives refreshes, submission confirmation (warns about unanswered questions). |
| Server-side marking | ✅ | Correct answers are never readable by the student's role (column grants) until submission. Objective questions are marked deterministically (fill-in answers normalised: case, accents, articles, punctuation, thousands separators). Short/theory answers are AI-marked against a model answer and key points in half-mark steps; if AI marking fails the answer is shown as "not marked" and excluded from the score — never guessed. Double submits can't grade twice. |
| Results | ✅ | Score, percentage, correct / incorrect / not marked, time, late flag, per-topic mastery (mastered ≥ 80 %, revise < 60 %), recommended next steps (re-read weak sections at their page, review mistake flashcards, retry), full review with your answer, correct/model answer, feedback, explanation and source page link. History and retries. |
| Flashcards | ✅ | Generated from materials (validated source pages, per-plan limits), created automatically from every quiz mistake (one per question), or written manually; edit, pause, delete, search, decks per material. |
| Spaced repetition | ✅ | Difficult (back in 10 min and again this session), Need practice (tomorrow), Know it (1 → 3 → interval × ease days). Scheduling is computed on the server and saved atomically with the review log (`review_flashcard`). Reviews earn a little XP. |

**Tests added:** question validation, objective marking & normalisation, attempt summaries, spaced-repetition schedule (unit); one daily quiz per session, atomic/clamped/owner-only flashcard review, one mistake card per question (database). Quiz runner, results and flashcard review exercised in a real browser (dev preview with mocked actions).

**Bugs found and fixed while testing:** "1,000" vs "1000" in fill-in marking; quiz drafts lost on refresh (effect ordering); a partial unique index that PostgREST upserts can't target; a PostgREST embed alias; mobile button layout.

## Phase 6 — Engagement ✅

| Area | Status | Notes |
|---|---|---|
| Analytics | ✅ | `analytics_summary()` (RLS-scoped) computes everything from stored activity: study time per day/week (7D / 30D / 3M / 1Y), change vs the previous period, active days & consistency, tasks/sessions/quizzes/flashcard reviews, quiz score trend, materials completed & overall progress, per-subject (or per-material) time and quiz average, weak topics aggregated from graded quiz topics, 12-week activity heatmap, current/longest streak. No demo data — empty states for new students. |
| Charts | ✅ | Hand-built SVG following the data-viz spec: single series in brand lime (≥ 3:1 on the dark surface), thin columns with rounded data-ends, 2px line with ringed markers, recessive gridlines, selective labels, hover tooltips with large hit targets, "View as table" for every chart, sequential heatmap with legend. |
| Personalised recommendations | ✅ | e.g. "You consistently perform well in Computer Networks (88%), but Databases (52%) requires more revision." Plus weak topics, mastered topics, study-time and score trends, consistency advice and a healthy-limits note for very long days. Every sentence is backed by numbers on the page. |
| Weekly goals & challenges | ✅ | Weekly minutes and study-day goals (Settings → Learning), challenges for the goal, study days, 3 quizzes and 30 flashcard reviews. |
| Milestones | ✅ | New achievements: Ten-Hour Scholar, Fifty-Hour Scholar, Card Shark (new criteria in `record_study_activity`). |
| Monthly reports | ✅ | `/analytics/report?month=YYYY-MM`: study time, active days, tasks, sessions, quizzes & average, flashcard reviews, XP, achievements, daily chart, highlights; month navigation. |
| Reminders | ✅ | `generate_user_notifications()` in each student's time zone, honouring their preferences: today's sessions (morning), unfinished tasks from missed sessions (per plan), daily study reminder at their chosen time (only if they haven't studied yet), daily quiz waiting (evening), gentle streak nudge (18:00–21:00, live streaks only), weekly goal reached, monthly report ready. Quiet hours 22:00–07:00. Each reminder has a de-duplication key so it fires once. Runs when the student opens the app (at most every 15 min) and from `/api/jobs/notifications` (cron). |
| Email reminders | ✅ (Phase 7) | Delivered via Resend when configured. |

**Tests added:** reminders (local-time threshold, de-duplication, quiet hours, opt-outs, already-studied, all reminder types, access control) and analytics aggregates/isolation (database); insights, subject grouping, trends, challenges (unit). Analytics screen checked in a real browser on desktop and mobile.

**Bug found and fixed while testing:** a chart received a formatting function from a server component (not serialisable — the page would have failed in production).

## Phase 7 — Monetisation & launch ✅ (code complete; live provider checks pending credentials)

| Area | Status | Notes |
|---|---|---|
| Stripe | ✅ code / ⏳ live | Checkout Session (subscription), Customer Portal, webhook with HMAC-SHA256 signature + 5-min timestamp tolerance. Handles checkout completed, subscription created/updated/deleted, payment failed. |
| Paystack | ✅ code / ⏳ live | Transaction initialize with plan, server-side verification on callback (the transaction must belong to the signed-in student), webhook with HMAC-SHA512. Handles charge.success, subscription create / not_renew / disable, payment failed; manage link for card updates & cancellation. |
| Entitlement | ✅ | `effectivePlan()` — Premium while active/trialing, and until the paid period ends after cancellation or a failed payment. Every limit (materials, upload size, plans, AI messages, quizzes, flashcards) is enforced on the server from this. Students cannot write subscriptions (RLS + grants) or read provider ids/tokens (column grants). |
| Webhook safety | ✅ | Ledger `billing_events (provider, event_id)` makes processing idempotent; older events never overwrite newer state (`last_event_at`); failures return 500 so the provider retries. |
| Honesty | ✅ | No provider configured → "Payments aren't available yet"; the success page says "processing" until the webhook confirms. |
| Account deletion | ✅ | Cancels the Stripe subscription / disables the Paystack subscription first; nothing is deleted if that fails. |
| Email | ✅ | Resend REST; reminder emails (HTML-escaped, links only to the app), opt-in, one email per notification. Auth emails via Supabase SMTP (documented). |
| Security | ✅ | Content-Security-Policy, HSTS, frame-ancestors none, no third-party scripts; review in `docs/SECURITY.md`. |
| Operations | ✅ | `/api/health`, structured `onRequestError` logging, GitHub Actions CI (lint, types, unit + Postgres tests, build). |
| E2E journey | ✅ script / ⏳ run | `npm run test:journey` walks 15 steps against a real deployment. Not yet run — needs a deployed instance with Supabase + AI keys. |

**Tests added:** signature verification (valid, tampered, expired, wrong secret), event→subscription mapping for both providers, entitlement rules, email escaping and link safety (unit); provider secrets hidden from students, webhook ledger private and unique, email lookup service-only (database).

**Not verifiable in this sandbox:** real Stripe/Paystack API calls and webhooks, Resend delivery, and the journey script — these need live keys. Use test-mode keys before going live.
