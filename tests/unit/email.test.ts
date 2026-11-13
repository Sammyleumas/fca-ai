import { describe, expect, it } from "vitest";
import { escapeHtml, reminderEmail } from "@/lib/email/templates";

describe("email templates", () => {
  it("escapes all dynamic content", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
    const m = reminderEmail({ name: "<b>Ada</b>", title: "Keep your <i>streak</i>", body: "Body & more", link: "/planner", siteUrl: "https://app.example" });
    expect(m.html).not.toContain("<b>Ada</b>");
    expect(m.html).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(m.html).toContain('href="https://app.example/planner"');
    expect(m.text).toContain("Open MindFlow: https://app.example/planner");
  });
  it("never links off-site from a notification link", () => {
    const m = reminderEmail({ name: "A", title: "T", body: null, link: "https://evil.example", siteUrl: "https://app.example" });
    expect(m.html).toContain('href="https://app.example"');
    expect(m.html).not.toContain("evil");
  });
});
