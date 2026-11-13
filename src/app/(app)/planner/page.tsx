import type { Metadata } from "next";
import { ComingInPhase } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Study Planner" };

export default function PlannerPage() {
  return (
    <ComingInPhase
      title="Study Planner"
      phase={3}
      description="Choose one or several materials, set your deadline and daily hours, and MindFlow builds an individual or combined timetable that adapts when you miss a day."
      points={["Individual & combined plans", "Deadline-aware scheduling", "Revision & assessment sessions", "Adaptive rescheduling you approve"]}
    />
  );
}
