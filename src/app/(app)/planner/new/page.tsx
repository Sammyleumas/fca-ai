import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlanWizard } from "@/components/planner/plan-wizard";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getPlannableMaterials } from "@/lib/data/planner";
import { localDateISO } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "New study plan" };

export default async function NewPlanPage({ searchParams }: PageProps<"/planner/new">) {
  const { user, profile } = await requireOnboardedUser();
  const [sp, materials] = await Promise.all([searchParams, getPlannableMaterials(user.id)]);
  const preselected = typeof sp.materials === "string" ? sp.materials.split(",").slice(0, 20) : [];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/planner" className="focus-ring inline-flex items-center gap-2 rounded-full text-sm text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Study Planner
      </Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New study plan</h1>
        <p className="mt-1 text-sm text-fg-2">MindFlow schedules your learning units around your deadline, daily time and workload.</p>
      </div>
      <PlanWizard materials={materials} preselected={preselected} today={localDateISO(profile.timezone)} defaultDailyMinutes={profile.daily_study_minutes} />
    </div>
  );
}
