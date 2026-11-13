import "server-only";

/** Server-only secrets. Never import this module from client components. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string | undefined {
    return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
  get aiProvider(): string {
    return process.env.AI_PROVIDER ?? "anthropic";
  },
  get anthropicApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
  },
  get anthropicModel(): string {
    return process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
  },
};
