import { AppFrame } from "@/components/layout/app-frame";
import { displayName, requireOnboardedUser } from "@/lib/auth/dal";
import { getShellData } from "@/lib/data/shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, profile } = await requireOnboardedUser();
  const { unread, plan } = await getShellData(user.id);
  const name = profile.full_name || displayName(profile, user.email);
  return (
    <AppFrame name={name} avatarUrl={profile.avatar_url} plan={plan} unread={unread}>
      {children}
    </AppFrame>
  );
}
