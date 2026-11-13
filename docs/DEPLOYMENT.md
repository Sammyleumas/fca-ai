# Deploying MindFlow (Vercel + Supabase)

## 1. Supabase

1. Create a project (Postgres 15+).
2. Apply migrations from the repository root:
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
6. Configure a custom SMTP provider before launch (Supabase's built-in mailer is rate-limited).

## 2. Vercel

1. Import the `Sammyleumas/fca-ai` repository (the app is at the repository root; framework preset: Next.js).
2. Environment variables (Production + Preview), see `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `NEXT_PUBLIC_SITE_URL`, `AI_PROVIDER`, `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`).
   Also set `CRON_SECRET` (any long random string).
3. Deploy. Build command `next build`, output handled automatically.
4. **Background processing.** Processing starts automatically after each upload and continues while a student
   has the library open. For processing that also continues when nobody is online, schedule the worker:
   - Vercel Pro: add `vercel.json` with
     `{"crons": [{"path": "/api/jobs/process", "schedule": "* * * * *"}, {"path": "/api/jobs/notifications", "schedule": "5 * * * *"}]}` — Vercel sends
     `Authorization: Bearer $CRON_SECRET` automatically.
   - Vercel Hobby (daily crons only) or elsewhere: call
     `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/jobs/process` from any scheduler every minute.
   The function needs up to 300 s (`maxDuration`); on Hobby the limit is lower and jobs simply resume on the next call.
   Reminders (`/api/jobs/notifications`, hourly) are also generated whenever a student opens the app, so they work without a
   scheduler; the hourly job makes them arrive on time for students who haven't opened MindFlow that day.

## 3. Verify after deploy

- Sign up → receive verification email → link lands on `/onboarding`.
- Complete onboarding → dashboard shows empty states (no fake numbers).
- Forgot password → email → `/reset-password` → dashboard.
- AI Tutor responds (requires `ANTHROPIC_API_KEY` and `SUPABASE_SECRET_KEY`).
- Settings → Export downloads JSON; Delete account removes the user.
- Library → upload a PDF, a DOCX and a TXT together → each reaches “Ready” and shows its chapters.
- Upload a scanned PDF → pages are transcribed (requires `ANTHROPIC_API_KEY`).

## Security checklist

- `SUPABASE_SECRET_KEY` and `ANTHROPIC_API_KEY` are **never** prefixed with `NEXT_PUBLIC_`.
- RLS is enabled on every public table (`npm run test:db` proves isolation).
- Storage bucket `materials` is private; files live under `{user_id}/…`.
- Security headers are set in `next.config.ts`.
