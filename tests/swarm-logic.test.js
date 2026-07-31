import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(opts) {
      this.opts = opts;
      this.messages = { create };
    }
  },
}));

const { SwarmSDK } = await import("../src/swarm-logic.js");

describe("SwarmSDK", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ content: [{ text: "result" }] });
  });

  it("exposes every agent name in upper case", () => {
    expect(SwarmSDK.agents).toContain("CODER");
    expect(SwarmSDK.agents).toHaveLength(10);
  });

  it("throws with the available agents listed for an unknown agent", async () => {
    await expect(SwarmSDK.triggerAgent("wizard")).rejects.toThrow(
      /Unknown agent: wizard\. Available: ARCHITECT/,
    );
  });

  it("resolves agent names case-insensitively", async () => {
    await SwarmSDK.triggerAgent("coder");
    expect(create.mock.calls[0][0].system).toMatch(/senior engineer/);
  });

  it("returns the first content block's text", async () => {
    await expect(SwarmSDK.triggerAgent("TESTER")).resolves.toBe("result");
  });

  it("prefixes the system prompt with a known personality", async () => {
    await SwarmSDK.triggerAgent("DEBUGGER", { personality: "Dark Detective" });
    const { system } = create.mock.calls[0][0];
    expect(system).toMatch(/^PERSONALITY: Approach like a hardboiled detective/);
    expect(system).toMatch(/debugging specialist/);
  });

  it("ignores an unknown personality", async () => {
    await SwarmSDK.triggerAgent("DEBUGGER", { personality: "Space Pirate" });
    expect(create.mock.calls[0][0].system).not.toMatch(/PERSONALITY/);
  });

  it("joins only the provided user content sections", async () => {
    await SwarmSDK.triggerAgent("CODER", { context: "ctx", task: "do it" });
    const { messages } = create.mock.calls[0][0];
    expect(messages).toEqual([
      { role: "user", content: "CONTEXT:\nctx\n\nTASK:\ndo it" },
    ]);
  });

  it("includes error logs between context and task", async () => {
    await SwarmSDK.triggerAgent("CODER", { context: "c", errorLogs: "boom", task: "t" });
    expect(create.mock.calls[0][0].messages[0].content).toBe(
      "CONTEXT:\nc\n\nERROR LOGS:\nboom\n\nTASK:\nt",
    );
  });

  it("sends an empty user message when no sections are given", async () => {
    await SwarmSDK.triggerAgent("WRITER");
    expect(create.mock.calls[0][0].messages[0].content).toBe("");
  });

  it("uses the configured model and token budget", async () => {
    await SwarmSDK.triggerAgent("ANALYST");
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
    });
  });
});
