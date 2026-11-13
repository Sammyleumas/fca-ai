import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/** Removes every stored file under `{userId}/` (storage isn't covered by database cascades). */
export async function removeUserFiles(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  for (let round = 0; round < 50; round++) {
    const { data: folders } = await admin.storage.from("materials").list(userId, { limit: 100 });
    if (!folders?.length) return true;
    const paths: string[] = [];
    for (const folder of folders) {
      const { data: files } = await admin.storage.from("materials").list(`${userId}/${folder.name}`, { limit: 1000 });
      if (files?.length) paths.push(...files.map((f) => `${userId}/${folder.name}/${f.name}`));
      else paths.push(`${userId}/${folder.name}`);
    }
    const { error } = await admin.storage.from("materials").remove(paths);
    if (error) return false;
  }
  return true;
}
