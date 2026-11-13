import type { Metadata } from "next";
import { LibraryView } from "@/components/library/library-view";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { limitsFor } from "@/lib/billing/plans";
import { getLibrary } from "@/lib/data/library";
import { getShellData } from "@/lib/data/shell";
import { applyLibraryQuery, filterCounts, parseLibraryQuery } from "@/lib/materials/library-filter";
import { hasAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "My Library" };
// Server actions on this page start background processing with after().
export const maxDuration = 60;

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const { user } = await requireOnboardedUser();
  const [sp, library, shell] = await Promise.all([searchParams, getLibrary(user.id), getShellData(user.id)]);
  const query = parseLibraryQuery(sp);
  const limits = limitsFor(shell.plan);
  return (
    <LibraryView
      items={applyLibraryQuery(library.items, query)}
      total={library.items.length}
      counts={filterCounts(library.items)}
      query={query}
      subjects={library.subjects}
      folders={library.folders}
      maxBytes={limits.maxUploadBytes}
      maxMaterials={limits.maxMaterials}
      uploadOpen={sp.upload === "1"}
      uploadsEnabled={hasAdminClient()}
    />
  );
}
