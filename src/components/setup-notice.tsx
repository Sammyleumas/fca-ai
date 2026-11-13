import { FormMessage } from "@/components/ui/feedback";

export function SetupNotice({ className }: { className?: string }) {
  return (
    <FormMessage tone="info" className={className}>
      Supabase is not configured for this deployment yet. Copy <code>.env.example</code> to <code>.env.local</code> and
      add your project URL and publishable key to enable accounts.
    </FormMessage>
  );
}
