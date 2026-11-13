import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { displayName, requireOnboardedUser } from "@/lib/auth/dal";
import { getDashboardData } from "@/lib/data/dashboard";
import { getShellData } from "@/lib/data/shell";
import { greetingFor } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, profile } = await requireOnboardedUser();
  const [data, shell, sp] = await Promise.all([getDashboardData(user.id), getShellData(user.id), searchParams]);
  const notice =
    sp.welcome === "1"
      ? "Welcome to FCA-AI! Start by uploading your learning materials."
      : sp.password === "updated"
        ? "Your password has been updated."
        : undefined;
  return (
    <DashboardView
      data={data}
      name={displayName(profile, user.email)}
      greeting={greetingFor(profile.timezone)}
      dailyGoal={profile.daily_study_minutes}
      plan={shell.plan}
      notice={notice}
    />
  );
}
