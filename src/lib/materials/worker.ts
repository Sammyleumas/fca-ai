import "server-only";
import { AIError, getAIProvider, isAIConfigured } from "@/lib/ai";
import { recordAIUsage } from "@/lib/ai/guard";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { SEGMENTATION_SYSTEM_PROMPT, segmentationUserPrompt } from "@/lib/ai/prompts/segmentation";
import { RetryLaterError, runJob, type OcrService, type ProcessingJob } from "./pipeline";
import { segmentationSchema, type SegmentationService } from "./segmentation";
import { SupabaseProcessingStore } from "./supabase-store";

function ocrServiceFor(userId: string): OcrService | null {
  if (!isAIConfigured()) return null;
  const provider = getAIProvider();
  if (!provider.transcribePdf) return null;
  return {
    async transcribe(pdf, pageCount) {
      try {
        const { pages, usage } = await provider.transcribePdf!(pdf, pageCount);
        await recordAIUsage(userId, "ocr", usage);
        return pages;
      } catch (error) {
        if (error instanceof AIError && (error.code === "rate_limited" || error.code === "unavailable" || error.code === "timeout")) {
          throw new RetryLaterError(60, error.message);
        }
        throw error;
      }
    },
  };
}

function segmenterFor(userId: string): SegmentationService | null {
  if (!isAIConfigured()) return null;
  const provider = getAIProvider();
  return {
    async segment({ materialTitle, window, pages }) {
      try {
        const { object, usage } = await provider.generateObject({
          system: SEGMENTATION_SYSTEM_PROMPT,
          messages: [{ role: "user", content: segmentationUserPrompt(materialTitle, window, pages) }],
          schema: segmentationSchema,
          maxTokens: 8000,
          effort: "low",
        });
        await recordAIUsage(userId, "segmentation", usage);
        return object;
      } catch (error) {
        if (error instanceof AIError && (error.code === "rate_limited" || error.code === "unavailable" || error.code === "timeout")) {
          throw new RetryLaterError(60, error.message);
        }
        throw error;
      }
    },
  };
}

/**
 * Processes due jobs until the time budget is used. Safe to call concurrently from
 * many places (after-upload hook, status polling, cron): jobs are claimed atomically.
 */
export async function processPendingJobs({
  userId,
  budgetMs = 45_000,
  maxJobs = 5,
}: { userId?: string; budgetMs?: number; maxJobs?: number } = {}): Promise<{ processed: number }> {
  if (!hasAdminClient()) return { processed: 0 };
  const admin = createAdminClient();
  const store = new SupabaseProcessingStore(admin);
  const started = Date.now();
  const worker = `w-${crypto.randomUUID().slice(0, 8)}`;
  let processed = 0;

  while (processed < maxJobs && Date.now() - started < budgetMs - 5_000) {
    const { data, error } = await admin.rpc("claim_processing_job", {
      p_worker: worker,
      p_user_id: userId ?? null,
      p_lease_seconds: Math.ceil(budgetMs / 1000) + 60,
    });
    if (error) {
      console.error("claim_processing_job failed", error.message);
      break;
    }
    const job = (data as ProcessingJob[] | null)?.[0];
    if (!job) break;
    processed++;
    try {
      await runJob(job, store, {
        ocr: ocrServiceFor(job.user_id),
        segmenter: segmenterFor(job.user_id),
        deadline: started + budgetMs - 8_000,
      });
    } catch (e) {
      // runJob handles its own failures; this only guards unexpected store errors.
      console.error("processing job crashed", job.id, e instanceof Error ? e.message : e);
    }
  }
  return { processed };
}

/**
 * Removes uploads the browser never finished. Signed upload URLs expire after two
 * hours, so anything still "uploaded" after three hours can never complete.
 */
export async function sweepStaleUploads(): Promise<{ removed: number }> {
  if (!hasAdminClient()) return { removed: 0 };
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("materials")
    .select("id, user_id, storage_path")
    .eq("status", "uploaded")
    .lt("created_at", cutoff)
    .limit(200);
  if (!data?.length) return { removed: 0 };
  await admin.storage.from("materials").remove(data.map((m) => m.storage_path as string));
  await admin.from("materials").delete().in("id", data.map((m) => m.id as string)).eq("status", "uploaded");
  return { removed: data.length };
}
