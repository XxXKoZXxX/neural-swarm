// Minimal PostgREST/auth helpers for edge functions using the service role key.
export function restClient(supabaseUrl: string, serviceRoleKey: string) {
  const authHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const headers = { "Content-Type": "application/json", ...authHeaders, Prefer: "return=representation" };
  const url = (table: string, query = "") => `${supabaseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;

  return {
    headers,
    url,
    async select<T>(table: string, query = ""): Promise<T[]> {
      const res = await fetch(url(table, query), { headers: authHeaders });
      return res.json();
    },
    insert(table: string, row: unknown, extraHeaders: Record<string, string> = {}) {
      return fetch(url(table), { method: "POST", headers: { ...headers, ...extraHeaders }, body: JSON.stringify(row) });
    },
    patch(table: string, query: string, row: unknown) {
      return fetch(url(table, query), { method: "PATCH", headers, body: JSON.stringify(row) });
    },
    async user(jwt: string): Promise<{ id: string; email?: string } | null> {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${jwt}` },
      });
      return res.ok ? res.json() : null;
    },
  };
}
