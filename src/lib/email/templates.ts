/** Minimal, safe email templates (all dynamic text is HTML-escaped). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function reminderEmail(opts: { name: string; title: string; body: string | null; link: string | null; siteUrl: string }) {
  const url = opts.link && opts.link.startsWith("/") ? `${opts.siteUrl}${opts.link}` : opts.siteUrl;
  const settings = `${opts.siteUrl}/settings#notifications`;
  const text = [`Hi ${opts.name},`, "", opts.title, opts.body ?? "", "", `Open FCA-AI: ${url}`, "", `Change email preferences: ${settings}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#03031A;font-family:Arial,sans-serif;color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#0A0A2E;border:1px solid #22224A;border-radius:16px">
<tr><td style="padding:28px">
<p style="margin:0 0 16px;color:#FFEB3B;font-weight:bold">FCA-AI</p>
<p style="margin:0 0 8px;color:#a5a5a5">Hi ${escapeHtml(opts.name)},</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#ffffff">${escapeHtml(opts.title)}</h1>
${opts.body ? `<p style="margin:0 0 20px;color:#d9d9d9;line-height:1.5">${escapeHtml(opts.body)}</p>` : ""}
<a href="${escapeHtml(url)}" style="display:inline-block;background:#FFEB3B;color:#000000;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Open FCA-AI</a>
<p style="margin:24px 0 0;font-size:12px;color:#777777">You receive this because email reminders are on. <a href="${escapeHtml(settings)}" style="color:#a5a5a5">Change preferences</a>.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: opts.title, text, html };
}
