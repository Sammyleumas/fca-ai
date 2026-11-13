import "server-only";

/** Sends an email through Resend's REST API. Returns false when email isn't configured. */
export async function sendEmail(to: string, msg: { subject: string; text: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: msg.subject.slice(0, 200), text: msg.text, html: msg.html }),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status}`);
  return true;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
