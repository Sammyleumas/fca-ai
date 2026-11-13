# FCA-AI security review (Phase 7)

| Area | Control | Verified by |
|---|---|---|
| Data isolation | RLS on every public table; composite `(parent_id, user_id)` foreign keys stop linking to another student's rows | `tests/db/rls.test.ts` and per-feature DB tests |
| Privileged columns | Column grants: students can't change XP, streaks, statuses, subscriptions, quiz answers/results, or read `correct_answer` before submitting, provider ids/tokens | DB tests |
| Secrets | `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_*`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `CRON_SECRET` are server-only (`server-only` imports, no `NEXT_PUBLIC_`) | Build + grep in review |
| Payments | No client-side activation; Premium only from signed webhooks or server-side Paystack verification bound to the session user; idempotent ledger; out-of-order protection | `tests/unit/billing.test.ts`, `tests/db/billing.test.ts` |
| Prompt injection | Document text is wrapped as untrusted data in prompts, model has no tools that change data, outputs validated with schemas | prompt builders in `src/lib/ai/prompts/*` (review) |
| Uploads | Extension + MIME + magic-byte checks, size limits by plan, sanitised file names, private bucket with `{user_id}/` paths | `tests/unit/materials.test.ts` + DB storage test |
| Rate limiting | Postgres fixed-window limits on AI, uploads, analysis, export, checkout, progress writes | DB test |
| Guest access | Anonymous Supabase users (`is_anonymous`) under the same RLS; smaller limits; no payments until saved with an email; sign-out warning; unused guests deleted after 30 days (`/api/jobs/cleanup-guests`); enable CAPTCHA in Supabase | `tests/db/guests.test.ts` |
| Auth | Supabase Auth (PKCE), email verification, server-side session checks (`getClaims`) in every action/route | E2E smoke |
| Headers | CSP (self + Supabase only, no third-party scripts/frames), HSTS, nosniff, `frame-ancestors 'none'`, strict referrer, permissions policy | `curl -I` against `next start` |
| Cron/jobs | `/api/jobs/*` require `Authorization: Bearer $CRON_SECRET` | route code |
| Dev tools | `/dev-preview/*` return 404 in production builds | `next start` check |
| Email | All dynamic content HTML-escaped; links restricted to the app's own domain | `tests/unit/email.test.ts` |
| Privacy | Data export (own rows only, no provider secrets) and full account deletion (cancels billing first) | Settings |
| Logging | Structured error logs without bodies, cookies or document text | `src/instrumentation.ts` |

## Known limitations / follow-ups
- `script-src` allows `'unsafe-inline'` (Next.js bootstrap scripts); moving to nonces would require per-request CSP.
- Live payment and email providers were not exercised in CI; use test keys and the steps in `DEPLOYMENT.md` before launch.
- Consider Supabase "Leaked password protection" and MFA (Auth settings) for production.
