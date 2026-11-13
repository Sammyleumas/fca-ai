# Deploying FCA-AI (Vercel + Supabase)

## 1. Supabase

1. Create a project (Postgres 15+).
2. Create the database schema — **either**:
   - **SQL editor (simplest):** open the project's SQL editor, paste the whole of `supabase/setup.sql`, and click Run.
     Do this once, on a new project. (`setup.sql` is generated from `supabase/migrations` by `npm run db:setup-sql`.)
   - **or the CLI:**
     ```bash
     npx supabase link --project-ref <ref>
     npx supabase db push
     ```
   This creates all tables, RLS policies, functions, the private `materials` storage bucket and the achievement catalogue.
3. **Auth → URL configuration**: Site URL = your production URL. Add redirect URLs
   `https://<domain>/auth/confirm` and `https://<domain>/auth/callback` (plus preview domains if needed).
4. **Auth → Providers**: email enabled with "Confirm email" on. Optionally enable Google, Apple and Azure (Microsoft);
   the buttons show a friendly error until a provider is configured.
5. **Auth → Emails** (optional): the default templates work (PKCE `code` flow). To use the `token_hash` flow, point
   links at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (recovery: `type=recovery`).
6. **Guest access ("Continue as guest")**: Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins**.
   Strongly recommended with it: Authentication → Attack Protection → enable CAPTCHA (e.g. Cloudflare Turnstile)
   to limit automated guest sign-ups. Guests get smaller limits (2 materials, 10 AI messages/day) and can't pay
   until they save their account with an email. Without this setting the guest button shows a friendly
   "Guest access isn't available" message.
7. Configure a custom SMTP provider before launch (Supabase's built-in mailer is rate-limited): **Auth → SMTP
   settings**. With Resend: host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key,
   sender = an address on your verified domain.

## 2. Vercel

1. Import the `Sammyleumas/fca-ai` repository (the app is at the repository root; framework preset: Next.js).
2. Environment variables (Production + Preview), see `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL` (Project Settings → API → Project URL), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (the `sb_publishable_…` key), `SUPABASE_SECRET_KEY` (the `sb_secret_…` key — server only),
   `NEXT_PUBLIC_SITE_URL`, `GEMINI_API_KEY` (from https://aistudio.google.com/apikey; optional `GEMINI_MODEL`).
   Before relying on it, run `GEMINI_API_KEY=… npm run gemini:check` locally: it confirms the model is available to
   your key's project and makes one test call. Free-tier limits are per project (see AI Studio → Usage); when they
   run out students see "Today's AI allowance has been used up" until the quota resets.
   Also set `CRON_SECRET` (any long random string), and billing/email variables from sections 3–4.
3. Deploy. Build command `next build`, output handled automatically.
4. **Background processing.** Processing starts automatically after each upload and continues while a student
   has the library open. For processing that also continues when nobody is online, schedule the worker:
   - Vercel Pro: add `vercel.json` with
     `{"crons": [{"path": "/api/jobs/process", "schedule": "* * * * *"}, {"path": "/api/jobs/notifications", "schedule": "5 * * * *"}, {"path": "/api/jobs/cleanup-guests", "schedule": "17 3 * * *"}]}` — Vercel sends
     `Authorization: Bearer $CRON_SECRET` automatically.
   - Vercel Hobby (daily crons only) or elsewhere: call
     `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/jobs/process` from any scheduler every minute.
   The function needs up to 300 s (`maxDuration`); on Hobby the limit is lower and jobs simply resume on the next call.
   Reminders (`/api/jobs/notifications`, hourly) are also generated whenever a student opens the app, so they work without a
   scheduler; the hourly job makes them arrive on time for students who haven't opened FCA-AI that day.

## 3. Payments

Payments stay **disabled** (the billing page says so) until a provider's secret key and at least one price/plan are set.
Premium is granted only by verified webhooks or a server-side Paystack verification — never by the browser redirect.

**Stripe** (international cards)
1. Products → create "FCA-AI Premium" with recurring monthly/yearly prices → set `STRIPE_PRICE_PREMIUM_MONTHLY` /
   `STRIPE_PRICE_PREMIUM_YEARLY`, `STRIPE_SECRET_KEY`, and optional display labels `PREMIUM_PRICE_LABEL_USD_*`.
2. Developers → Webhooks → endpoint `https://<domain>/api/billing/webhooks/stripe` with events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal: enable cancellation and payment-method updates ("Manage subscription").

**Paystack** (Nigeria)
1. Plans → create monthly/yearly plans → `PAYSTACK_PLAN_PREMIUM_MONTHLY` / `_YEARLY`, `PAYSTACK_SECRET_KEY`,
   optional labels `PREMIUM_PRICE_LABEL_NGN_*`.
2. Settings → API Keys & Webhooks: webhook URL `https://<domain>/api/billing/webhooks/paystack`
   (signatures are verified with the secret key). The callback URL is sent per checkout
   (`/api/billing/paystack/callback`), so no dashboard setting is needed.

Test with each provider's **test keys** first: subscribe, confirm Premium appears, cancel, confirm it remains until the
period ends, then fails over to Free. Webhooks are idempotent (`billing_events`) and out-of-order events are ignored.

## 4. Email reminders (optional)

Set `RESEND_API_KEY` and `EMAIL_FROM` (verified domain). The hourly `/api/jobs/notifications` job then emails new
reminders to students who switched on "Also email me my reminders". Without these variables reminders stay in-app.

## 5. Verify after deploy

- `GET /api/health` → `{"status":"ok","database":"ok", …}` (booleans show which integrations are configured).
- Run the journey check against the deployment with a dedicated verified test account:
  `BASE_URL=https://<domain> E2E_EMAIL=… E2E_PASSWORD=… E2E_PDF=./notes.pdf npm run test:journey`

- Sign up → receive verification email → link lands on `/onboarding`.
- Complete onboarding → dashboard shows empty states (no fake numbers).
- Forgot password → email → `/reset-password` → dashboard.
- AI Tutor responds (requires `GEMINI_API_KEY` and `SUPABASE_SECRET_KEY`).
- Settings → Export downloads JSON; Delete account removes the user.
- Library → upload a PDF, a DOCX and a TXT together → each reaches “Ready” and shows its chapters.
- Upload a scanned PDF → pages are transcribed (requires `GEMINI_API_KEY`).

See `docs/SECURITY.md` for the full security review.

## Security checklist

- `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` are **never** prefixed with `NEXT_PUBLIC_`.
- RLS is enabled on every public table (`npm run test:db` proves isolation).
- Storage bucket `materials` is private; files live under `{user_id}/…`.
- Security headers (incl. CSP) are set in `next.config.ts`. The CSP reads `NEXT_PUBLIC_SUPABASE_URL` at build time, so redeploy after changing it.
