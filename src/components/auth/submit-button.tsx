"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({ children, arrow = true }: { children: React.ReactNode; arrow?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" loading={pending}>
      {children}
      {arrow && !pending && <ArrowRight className="size-4" aria-hidden="true" />}
    </Button>
  );
}
