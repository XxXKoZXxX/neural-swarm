// Service-role PostgREST access and caller resolution, shared by the edge
// functions so the URL/header boilerplate lives in one place.

export class RestError extends Error {
  constructor(readonly status: number, readonly body: string, table: string) {
    super(`${table} ${status}: ${body}`);
  }
}

export function restClient(supabaseUrl: string, serviceRoleKey: string) {
  const base = supabaseUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "return=representation",
  };
  const url = (table: string, query = "") => `${base}/rest/v1/${table}${query ? `?${query}` : ""}`;

  return {
    headers,
    url,
    async select<T>(table: string, query = ""): Promise<T[]> {
      const res = await fetch(url(table, query), { headers });
      if (!res.ok) throw new RestError(res.status, await res.text(), table);
      return await res.json() as T[];
    },
    insert(table: string, row: unknown, extraHeaders: Record<string, string> = {}) {
      return fetch(url(table), {
        method: "POST",
        headers: { ...headers, ...extraHeaders },
        body: JSON.stringify(row),
      });
    },
    patch(table: string, query: string, row: unknown) {
      return fetch(url(table, query), {
        method: "PATCH",
        headers,
        body: JSON.stringify(row),
      });
    },
  };
}

/**
 * Resolves a Supabase session JWT to its user, or null when the token is
 * absent, is an API key rather than a session, or is not accepted.
 */
export async function resolveUser(
  supabaseUrl: string,
  apikey: string,
  jwt: string,
): Promise<{ id: string; email?: string } | null> {
  if (!jwt || !supabaseUrl || jwt === apikey) return null;
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}
