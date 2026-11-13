import { signInWithProvider } from "@/app/(auth)/actions";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
      <path fill="#4285F4" d="M21.2 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.3-1.1 2.4-2.2 3.1l3.4 2.6c2-1.8 2.5-4.6 2.5-8z" />
      <path fill="#FBBC05" d="M6 12c0-.7.1-1.3.3-1.9L3.1 7.6C2.6 8.9 2.4 10.4 2.4 12s.3 3.1.8 4.4l3.3-2.5C6.2 13.3 6 12.7 6 12z" />
      <path fill="#34A853" d="M12 21.6c2.6 0 4.8-.9 6.4-2.4l-3.4-2.6c-.9.6-2.1 1.1-3 1.1-2.4 0-4.4-1.6-5.2-3.8l-3.3 2.5c1.6 3.1 4.8 5.2 8.5 5.2z" />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-white" aria-hidden="true">
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}

const PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "apple", label: "Apple", Icon: AppleIcon },
  { id: "microsoft", label: "Microsoft", Icon: MicrosoftIcon },
] as const;

export function OAuthButtons({ next }: { next?: string }) {
  return (
    <div>
      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or continue with
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {PROVIDERS.map(({ id, label, Icon }) => (
          <form key={id} action={signInWithProvider}>
            <input type="hidden" name="provider" value={id} />
            {next && <input type="hidden" name="next" value={next} />}
            <button
              type="submit"
              className="focus-ring glass flex h-14 w-full items-center justify-center rounded-2xl transition hover:bg-white/10"
              aria-label={`Continue with ${label}`}
            >
              <Icon />
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
