import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  rankScore,
  MODELS,
  isGemini,
  streamGemini,
  callGemini,
  streamClaude,
  callClaude,
  compressCtx,
  mkDb,
  mkAuth,
} from "../src/api.js";

const jsonRes = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const textRes = (body, { ok = false, status = 502 } = {}) => ({
  ok,
  status,
  headers: new Headers({ "content-type": "text/html" }),
  json: async () => {
    throw new Error("not json");
  },
  text: async () => body,
});

const sseRes = (chunks) => {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "text/event-stream" }),
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  };
};

const collect = () => {
  const state = { tokens: [], done: false, err: null };
  return {
    state,
    onToken: (t) => state.tokens.push(t),
    onDone: () => {
      state.done = true;
    },
    onErr: (e) => {
      state.err = e;
    },
  };
};

beforeEach(() => {
  global.fetch = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("rankScore", () => {
  it("weights rating twice and dampens usage logarithmically", () => {
    expect(rankScore({ rating: "4.5", usage: 9 })).toBeCloseTo(10, 5);
  });

  it("falls back to usage_count and treats missing fields as zero", () => {
    expect(rankScore({ usage_count: 99 })).toBeCloseTo(2, 5);
    expect(rankScore({})).toBe(0);
  });
});

describe("isGemini", () => {
  it("detects gemini model ids and tolerates undefined", () => {
    expect(isGemini("gemini-2.5-pro")).toBe(true);
    expect(isGemini("claude-sonnet-4-20250514")).toBe(false);
    expect(isGemini(undefined)).toBeUndefined();
  });

  it("agrees with the provider field of every declared model", () => {
    for (const m of MODELS) expect(!!isGemini(m.id)).toBe(m.provider === "gemini");
  });
});

describe("callClaude", () => {
  it("posts directly to the Anthropic API with the api key header", async () => {
    fetch.mockResolvedValue(jsonRes({ content: [{ text: "hi" }] }));
    const out = await callClaude({ messages: [], system: "s", _key: "sk-1" });
    expect(out).toBe("hi");
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(opts.headers["x-api-key"]).toBe("sk-1");
    expect(JSON.parse(opts.body).model).toBe("claude-sonnet-4-20250514");
  });

  it("uses the proxy with a bearer jwt when a proxy is configured", async () => {
    fetch.mockResolvedValue(jsonRes({ content: [{ text: "hi" }] }));
    await callClaude({ messages: [], _proxy: "https://proxy.test/api", _jwt: "jwt-1", _key: "sk-1" });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("https://proxy.test/api");
    expect(opts.headers.Authorization).toBe("Bearer jwt-1");
  });

  it("throws with a truncated body when the response is not json", async () => {
    fetch.mockResolvedValue(textRes("<html>gateway down</html>"));
    await expect(callClaude({ messages: [], _key: "k" })).rejects.toThrow(/HTTP 502: <html>/);
  });

  it("surfaces the api error message", async () => {
    fetch.mockResolvedValue(jsonRes({ error: { message: "bad key" } }, { ok: false, status: 401 }));
    await expect(callClaude({ messages: [], _key: "k" })).rejects.toThrow("bad key");
  });

  it("returns an empty string when the response has no content", async () => {
    fetch.mockResolvedValue(jsonRes({}));
    await expect(callClaude({ messages: [], _key: "k" })).resolves.toBe("");
  });

  it("delegates gemini models to the gemini endpoint", async () => {
    fetch.mockResolvedValue(
      jsonRes({ candidates: [{ content: { parts: [{ text: "gem" }] } }] }),
    );
    const out = await callClaude({ messages: [], _model: "gemini-2.5-flash", _geminiKey: "g-1" });
    expect(out).toBe("gem");
    expect(fetch.mock.calls[0][0]).toContain("generativelanguage.googleapis.com");
  });
});

describe("callGemini", () => {
  it("maps assistant messages to the model role and includes the system instruction", async () => {
    fetch.mockResolvedValue(jsonRes({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    await callGemini({
      messages: [{ role: "assistant", content: "prior" }, { role: "user", content: "now" }],
      system: "be terse",
      _geminiKey: "g-1",
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents).toEqual([
      { role: "model", parts: [{ text: "prior" }] },
      { role: "user", parts: [{ text: "now" }] },
    ]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "be terse" }] });
  });

  it("omits the system instruction when no system prompt is given", async () => {
    fetch.mockResolvedValue(jsonRes({ candidates: [] }));
    await callGemini({ messages: [], _geminiKey: "g-1" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("systemInstruction");
  });

  it("throws when no gemini key is configured", async () => {
    await expect(callGemini({ messages: [] })).rejects.toThrow(/Gemini API key not set/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("streamClaude", () => {
  it("emits text deltas and completes", async () => {
    fetch.mockResolvedValue(
      sseRes([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"He"}}\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"llo"}}\ndata: [DONE]\n',
      ]),
    );
    const c = collect();
    await streamClaude({ messages: [], _key: "k", ...c });
    expect(c.state.tokens.join("")).toBe("Hello");
    expect(c.state.done).toBe(true);
    expect(c.state.err).toBeNull();
  });

  it("ignores non-data lines, malformed json and non-text events", async () => {
    fetch.mockResolvedValue(
      sseRes([
        "event: ping\ndata: not-json\n",
        'data: {"type":"message_start"}\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n',
      ]),
    );
    const c = collect();
    await streamClaude({ messages: [], _key: "k", ...c });
    expect(c.state.tokens).toEqual(["x"]);
    expect(c.state.done).toBe(true);
  });

  it("reports http errors without calling onDone", async () => {
    fetch.mockResolvedValue(jsonRes({ error: { message: "overloaded" } }, { ok: false, status: 529 }));
    const c = collect();
    await streamClaude({ messages: [], _key: "k", ...c });
    expect(c.state.err).toBe("HTTP 529: overloaded");
    expect(c.state.done).toBe(false);
  });

  it("reports network failures through onErr", async () => {
    fetch.mockRejectedValue(new Error("offline"));
    const c = collect();
    await streamClaude({ messages: [], _key: "k", ...c });
    expect(c.state.err).toBe("offline");
  });

  it("routes gemini models to the gemini stream", async () => {
    const c = collect();
    await streamClaude({ messages: [], _model: "gemini-2.0-flash", ...c });
    expect(c.state.err).toMatch(/Gemini API key not set/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("streamGemini", () => {
  it("emits candidate text parts and completes", async () => {
    fetch.mockResolvedValue(
      sseRes([
        'data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}]}\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"b"}]}}]}\n',
      ]),
    );
    const c = collect();
    await streamGemini({ messages: [], _geminiKey: "g-1", ...c });
    expect(c.state.tokens).toEqual(["a", "b"]);
    expect(c.state.done).toBe(true);
  });

  it("reports http errors with the gemini error message", async () => {
    fetch.mockResolvedValue(jsonRes({ error: { message: "quota" } }, { ok: false, status: 429 }));
    const c = collect();
    await streamGemini({ messages: [], _geminiKey: "g-1", ...c });
    expect(c.state.err).toBe("HTTP 429: quota");
  });
});

describe("compressCtx", () => {
  it("returns an empty string for empty context", async () => {
    await expect(compressCtx([], "goal")).resolves.toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the model summary when the call succeeds", async () => {
    fetch.mockResolvedValue(jsonRes({ content: [{ text: "summary" }] }));
    const out = await compressCtx([{ agent: "CODER", output: "long output" }], "goal", "k");
    expect(out).toBe("\n\nPRIOR CONTEXT (compressed):\nsummary");
  });

  it("falls back to truncated raw context when the call fails", async () => {
    fetch.mockRejectedValue(new Error("offline"));
    const out = await compressCtx([{ agent: "CODER", output: "x".repeat(400) }], "goal", "k");
    expect(out).toBe(`\n\nPRIOR CONTEXT:\n[CODER]: ${"x".repeat(300)}`);
  });
});

describe("mkDb", () => {
  it("strips a trailing slash and inserts rows with representation preferred", async () => {
    fetch.mockResolvedValue(jsonRes([{ id: 1 }]));
    const rows = await mkDb("https://db.test/", "anon").ins("runs", { a: 1 });
    expect(rows).toEqual([{ id: 1 }]);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("https://db.test/rest/v1/runs");
    expect(opts.headers.Prefer).toBe("return=representation");
    expect(opts.headers.apikey).toBe("anon");
  });

  it("appends the query string when selecting", async () => {
    fetch.mockResolvedValue(jsonRes([]));
    await mkDb("https://db.test", "anon").sel("runs", "select=*");
    expect(fetch.mock.calls[0][0]).toBe("https://db.test/rest/v1/runs?select=*");
  });

  it("deletes by id filter", async () => {
    fetch.mockResolvedValue(jsonRes({}));
    await mkDb("https://db.test", "anon").del("runs", 7);
    expect(fetch.mock.calls[0][0]).toBe("https://db.test/rest/v1/runs?id=eq.7");
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("throws the postgrest message on failure", async () => {
    fetch.mockResolvedValue(jsonRes({ message: "rls denied" }, { ok: false, status: 403 }));
    await expect(mkDb("https://db.test", "anon").sel("runs")).rejects.toThrow("rls denied");
  });
});

describe("mkAuth", () => {
  it("signs in against the password grant endpoint", async () => {
    fetch.mockResolvedValue(jsonRes({ access_token: "t" }));
    const d = await mkAuth("https://db.test/", "anon").signIn("a@b.c", "pw");
    expect(d).toEqual({ access_token: "t" });
    expect(fetch.mock.calls[0][0]).toBe("https://db.test/auth/v1/token?grant_type=password");
  });

  it("signs up against the signup endpoint", async () => {
    fetch.mockResolvedValue(jsonRes({ user: { id: "u" } }));
    await mkAuth("https://db.test", "anon").signUp("a@b.c", "pw");
    expect(fetch.mock.calls[0][0]).toBe("https://db.test/auth/v1/signup");
  });

  it("throws the error description, falling back to a generic message", async () => {
    fetch.mockResolvedValue(jsonRes({ error_description: "bad login" }, { ok: false, status: 400 }));
    await expect(mkAuth("https://db.test", "anon").signIn("a@b.c", "pw")).rejects.toThrow("bad login");
    fetch.mockResolvedValue(jsonRes({}, { ok: false, status: 400 }));
    await expect(mkAuth("https://db.test", "anon").signUp("a@b.c", "pw")).rejects.toThrow("Failed");
  });
});
