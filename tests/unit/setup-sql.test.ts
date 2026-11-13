import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSetupSql } from "../../scripts/build-setup-sql.mjs";

describe("supabase/setup.sql", () => {
  it("is up to date with the migrations (run `npm run db:setup-sql`)", () => {
    expect(readFileSync("supabase/setup.sql", "utf8")).toBe(buildSetupSql());
  });
});
