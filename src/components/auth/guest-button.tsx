"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { UserRound } from "lucide-react";
import { continueAsGuest, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/format";

function Submit({ size, variant, className }: { size: "md" | "lg"; variant: "secondary" | "ghost"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} variant={variant} loading={pending} className={className}>
      {!pending && <UserRound className="size-4" aria-hidden="true" />} Continue as guest
    </Button>
  );
}

/** Opens the app without an account (Supabase anonymous sign-in). */
export function GuestButton({
  size = "lg",
  variant = "secondary",
  className,
  note = true,
}: {
  size?: "md" | "lg";
  variant?: "secondary" | "ghost";
  className?: string;
  note?: boolean;
}) {
  const [state, action] = useActionState<AuthState, FormData>(continueAsGuest, {});
  return (
    <form action={action} className={cn("flex flex-col gap-2", className)}>
      <Submit size={size} variant={variant} className="w-full" />
      {note && <p className="text-center text-xs text-muted">No email needed. Save your work with an account any time.</p>}
      {state.error && <FormMessage>{state.error}</FormMessage>}
    </form>
  );
}
