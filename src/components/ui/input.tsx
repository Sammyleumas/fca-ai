"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/format";

type FieldProps = ComponentProps<"input"> & {
  label: string;
  hideLabel?: boolean;
  icon?: ReactNode;
  error?: string;
  hint?: string;
};

const fieldBase =
  "glass h-14 w-full rounded-2xl pl-12 pr-4 text-[15px] text-fg placeholder:text-muted outline-none transition focus:border-accent/60 focus:bg-white/[0.08] aria-[invalid=true]:border-error/70";

export function TextField({ label, hideLabel, icon, error, hint, className, id, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className={cn("block text-sm font-medium text-fg-2", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-2">{icon}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(fieldBase, !icon && "pl-4")}
          {...props}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, "type">) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <div className="relative">
      <TextField {...props} id={id} type={visible ? "text" : "password"} className={props.className} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className={cn(
          "focus-ring absolute right-3 flex size-9 items-center justify-center rounded-full text-fg-2 hover:text-fg",
          props.hideLabel ? "top-[10px]" : "top-[38px]",
        )}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={id}
      >
        {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}
