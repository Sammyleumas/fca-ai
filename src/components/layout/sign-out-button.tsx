"use client";

/** Sign-out form. Guests are warned first: their work can't be recovered once they leave. */
export function SignOutForm({ guest, className, children, buttonClassName, label }: {
  guest: boolean;
  className?: string;
  buttonClassName: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action="/auth/signout"
      method="post"
      className={className}
      onSubmit={(e) => {
        if (
          guest &&
          !window.confirm("You're a guest. Signing out deletes access to everything you've done here. Save your account first to keep it. Sign out anyway?")
        ) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className={buttonClassName} aria-label={label} title={label}>
        {children}
      </button>
    </form>
  );
}
