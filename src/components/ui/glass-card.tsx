import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/format";

export function GlassCard({
  className,
  strong,
  as: Tag = "section",
  ...props
}: Omit<ComponentProps<"section">, "ref"> & { strong?: boolean; as?: "section" | "div" | "article" | "aside" }) {
  return <Tag className={cn(strong ? "glass-strong" : "glass", "relative rounded-[var(--radius-glass)]", className)} {...props} />;
}

export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2.5 text-base font-semibold text-fg md:text-lg">
        {icon && <span className="text-accent">{icon}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}
