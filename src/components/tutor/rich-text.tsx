import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown subset for AI replies: paragraphs, bullet lists, **bold**
 * and `inline code`. Renders React nodes only — never raw HTML.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\])/g);
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={key} className="font-semibold text-fg">{p.slice(2, -2)}</strong>;
    if (/^\[\d{1,2}\]$/.test(p))
      return (
        <sup key={key} className="mx-0.5 rounded bg-accent/15 px-1 text-[10px] font-semibold text-accent" aria-label={`source ${p.slice(1, -1)}`}>
          {p.slice(1, -1)}
        </sup>
      );
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return (
        <code key={key} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">
          {p.slice(1, -1)}
        </code>
      );
    return <Fragment key={key}>{p}</Fragment>;
  });
}

export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
        if (isList) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </Tag>
          );
        }
        const heading = /^#{1,3}\s+/.test(block);
        if (heading) return <p key={bi} className="font-semibold text-fg">{inline(block.replace(/^#{1,3}\s+/, ""), `${bi}`)}</p>;
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {inline(block, `${bi}`)}
          </p>
        );
      })}
    </div>
  );
}
