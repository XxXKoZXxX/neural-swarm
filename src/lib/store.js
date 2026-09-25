/**
 * Persistence + platform helpers: localStorage wrappers, the Supabase REST
 * layer, file downloads, a dependency-free ZIP writer and CSV export.
 */

/* ── safe storage ───────────────────────────────────────────────────────── */
export function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Session-scoped secret storage — survives reloads but not a new tab. */
export function readSession(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
export function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function clearSession(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* storage disabled */
  }
}

export const mask = (value = "", keep = 4) => {
  const s = String(value);
  if (s.length <= keep * 2) return s ? "•".repeat(Math.min(12, s.length)) : "";
  return `${s.slice(0, keep)}${"•".repeat(10)}${s.slice(-keep)}`;
};

/* ── one-time migration from the pre-makeover storage keys ──────────────── */
/**
 * The first version of the studio stored everything under flat `ns_*` keys.
 * Anyone who used it keeps their custom agents, learned preferences, vault and
 * run history — those are copied across once, then the old keys are dropped.
 */
export function migrateLegacyStorage() {
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const move = (legacyKey, newKey, convert) =>
    safe(() => {
      const raw = localStorage.getItem(legacyKey);
      if (raw === null) return false;
      const legacy = JSON.parse(raw);
      const current = localStorage.getItem(newKey);
      const isEmpty = current === null || current === "[]" || current === "{}" || current === "null" || current === '""';
      const converted = convert(legacy);
      if (isEmpty && converted !== undefined && converted !== null) localStorage.setItem(newKey, JSON.stringify(converted));
      localStorage.removeItem(legacyKey);
      return true;
    }, false);

  if (safe(() => localStorage.getItem("ns.migrated"), null)) return false;

  move("ns_custom_agents", "ns.custom-agents", (list) =>
    Array.isArray(list)
      ? list.map((a) => ({ name: a.name, icon: a.icon ?? a.i ?? "⬡", color: a.color ?? a.c ?? "#94a3b8", sys: a.sys ?? "" }))
      : [],
  );
  move("ns_taste_profile", "ns.memory", (profile) => ({
    enabled: profile?.enabled ?? true,
    level: profile?.level ?? 1,
    xp: profile?.xp ?? 0,
    likes: profile?.likes ?? [],
    dislikes: profile?.dislikes ?? [],
    rules: profile?.rules ?? [],
    log: profile?.log ?? profile?.logs ?? [],
  }));
  move("ns_vault_items", "ns.vault", (items) =>
    Array.isArray(items)
      ? items.map((item, index) => ({
          id: item.id ?? `v_legacy_${index}`,
          title: item.title ?? "Untitled",
          content: item.content ?? "",
          tag: item.tag ?? "Imported",
          pinned: Boolean(item.pinned),
          created_at: item.created_at ?? new Date().toISOString(),
        }))
      : [],
  );
  move("ns_runs", "ns.runs", (runs) =>
    Array.isArray(runs)
      ? runs.slice(0, 40).map((run, index) => ({
          id: run.id ?? `r_legacy_${index}`,
          goal: run.goal ?? "",
          branch: run.branch ?? "main",
          agents: run.agents ?? {},
          overseer: run.overseer ?? "",
          score: run.score ?? null,
          tokens_used: run.tokens_used ?? 0,
          cost: run.cost ?? 0,
          starred: Boolean(run.starred),
          created_at: run.created_at ?? new Date().toISOString(),
        }))
      : [],
  );

  const advanced = safe(() => localStorage.getItem("ns_advanced_mode") === "true", false);
  const webhook = safe(() => localStorage.getItem("ns_webhook") || "", "");
  if (advanced || webhook) {
    safe(() => {
      const settings = JSON.parse(localStorage.getItem("ns.settings") || "{}");
      if (webhook && !settings.webhookUrl) settings.webhookUrl = webhook;
      if (advanced) settings.runOptions = { chainMode: true, parallel: false, ...(settings.runOptions || {}) };
      localStorage.setItem("ns.settings", JSON.stringify(settings));
      localStorage.removeItem("ns_advanced_mode");
      localStorage.removeItem("ns_webhook");
    }, undefined);
  }
  safe(() => localStorage.setItem("ns.migrated", JSON.stringify(true)), undefined);
  return true;
}

/* ── Supabase (REST, no SDK) ────────────────────────────────────────────── */
export function mkDb(url, key, jwt) {
  if (!url || !key) throw new Error("Supabase URL and anon key are required.");
  const base = String(url).replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${jwt || key}`,
  };
  return {
    async insert(table, row) {
      const res = await fetch(`${base}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `insert failed (${res.status})`);
      return res.json();
    },
    async select(table, query = "") {
      const res = await fetch(`${base}/rest/v1/${table}${query ? `?${query}` : ""}`, { headers });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `select failed (${res.status})`);
      return res.json();
    },
    async update(table, id, row) {
      const res = await fetch(`${base}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(`update failed (${res.status})`);
      return res.json();
    },
    async remove(table, id) {
      const res = await fetch(`${base}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error(`delete failed (${res.status})`);
      return true;
    },
    ready: Boolean(url && key),
  };
}

export function mkAuth(url, key) {
  const base = String(url).replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json", apikey: key };
  const parse = async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.msg || data.error || `auth failed (${res.status})`);
    return data;
  };
  return {
    signIn: (email, password) =>
      fetch(`${base}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      }).then(parse),
    signUp: (email, password) =>
      fetch(`${base}/auth/v1/signup`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      }).then(parse),
    resetPassword: (email) =>
      fetch(`${base}/auth/v1/recover`, { method: "POST", headers, body: JSON.stringify({ email }) }).then(parse),
  };
}

/* ── downloads ──────────────────────────────────────────────────────────── */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const downloadText = (filename, text, mime = "text/plain;charset=utf-8") =>
  downloadBlob(filename, new Blob([text], { type: mime }));

export async function copyText(text) {
  const value = String(text ?? "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the legacy path (insecure context or denied permission) */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function toCsv(rows = [], columns) {
  const cols = columns || Object.keys(rows[0] || {});
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => escape(typeof c === "function" ? "" : r[c])).join(","))].join("\n");
}

/* ── ZIP (stored, no compression, no dependencies) ──────────────────────── */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/** Build a valid .zip archive from [{path, code}] entries. */
export function zipFiles(files = []) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() / 2)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = encoder.encode(file.code ?? "");
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ]);
    chunks.push(local, nameBytes, data);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ]),
      nameBytes,
    );
    offset += local.length + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  const all = [...chunks, ...central, end];
  return new Blob(all, { type: "application/zip" });
}

/* ── misc ───────────────────────────────────────────────────────────────── */
export const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

export const timeOf = (d = new Date()) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
