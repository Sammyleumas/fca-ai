import type { Metadata } from "next";
import { ComingInPhase } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <ComingInPhase
      title="Analytics"
      phase={6}
      description="Study time, consistency, subject performance, weak areas and improvement trends — calculated only from your real activity."
      points={["Weekly & monthly activity", "Subject performance", "Weak-area detection", "Personalised recommendations"]}
    />
  );
}
