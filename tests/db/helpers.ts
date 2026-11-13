import { Pool, type PoolClient } from "pg";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  pool ??= new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
  return pool;
}

export async function closePool() {
  await pool?.end();
  pool = null;
}

/** Creates an auth user (fires handle_new_user) and returns its id. Runs as superuser. */
export async function createUser(meta: Record<string, unknown> = {}): Promise<string> {
  const email = `user_${crypto.randomUUID()}@test.local`;
  const { rows } = await getPool().query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, meta],
  );
  return rows[0].id;
}

export async function asSuperuser<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` inside a transaction as the given Supabase API role, with the JWT
 * `sub` claim set the way PostgREST does. The transaction is always rolled back
 * unless `commit` is true, so tests stay isolated.
 */
export async function asRole<T>(
  role: "authenticated" | "anon",
  userId: string | null,
  fn: (c: PoolClient) => Promise<T>,
  { commit = false }: { commit?: boolean } = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify(userId ? { sub: userId, role } : { role })],
    );
    await client.query(`set local role ${role}`);
    const result = await fn(client);
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function insertMaterial(c: PoolClient, userId: string, title = "Intro to CS") {
  const id = crypto.randomUUID();
  const { rows } = await c.query<{ id: string }>(
    `insert into public.materials (id, user_id, title, original_filename, file_type, mime_type, size_bytes, storage_path, page_count)
     values ($1, $2, $3, 'intro.pdf', 'pdf', 'application/pdf', 1024, $4, 300) returning id`,
    [id, userId, title, `${userId}/${id}/intro.pdf`],
  );
  return rows[0].id;
}
