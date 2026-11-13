import { requireOnboardedUser } from "@/lib/auth/dal";

/** The Reading Room is full-screen: no sidebar or bottom navigation. */
export default async function ReaderLayout({ children }: LayoutProps<"/">) {
  await requireOnboardedUser();
  return <main id="main">{children}</main>;
}
