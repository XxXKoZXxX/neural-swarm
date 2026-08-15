import Anthropic from "@anthropic-ai/sdk";

const AGENTS = {
  ARCHITECT:  { sys: "You are a senior software architect. Design schemas, system breakdowns, and technical decisions. Be production-grade and concise." },
  CODER:      { sys: "You are a senior engineer. Write complete, runnable, production-ready code. Include a HOW TO RUN section." },
  DEBUGGER:   { sys: "You are a debugging specialist. Find real bugs, explain each one clearly, output fully fixed code." },
  TESTER:     { sys: "You are a QA engineer. Write complete test suites with edge cases, mocks, and assertions." },
  ANALYST:    { sys: "You are a critical analyst. Score work /10, identify weaknesses, give prioritized improvements." },
  REFACTORER: { sys: "You are a refactoring expert. Apply DRY, clean naming, patterns. Output change log + refactored code." },
  RESEARCHER: { sys: "You are a technical researcher. Deep research with comparisons, tradeoffs, version-specific details." },
  WRITER:     { sys: "You are a technical writer. Write READMEs, docs, reports. Adapt tone to the audience." },
  REVIEWER:   { sys: "You are a principal engineer. Code review: rate [CRITICAL/MAJOR/MINOR/NIT]. Correctness, security, performance." },
  DESIGNER:   { sys: "You are a UI/UX designer. Detailed visual direction: layout, palette, typography, components, UX flows." },
};

const PERSONALITIES = {
  "Dark Detective":      "Approach like a hardboiled detective — methodical, suspicious of every assumption, never satisfied until the real culprit is found.",
  "Wall Street Shark":   "Cut through noise. What matters? What's the ROI? Be ruthlessly practical.",
  "Mad Scientist":       "Explore every edge case. Challenge conventions. Find the elegant hidden solution.",
  "Silicon Valley CEO":  "Ship fast, iterate. Focus on what moves the needle. No perfectionism.",
  "Stoic Philosopher":   "Reason from first principles. Be calm, precise, and principled.",
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const SwarmSDK = {
  async triggerAgent(agentName, { context = "", errorLogs = "", task = "", personality = "" } = {}) {
    const agent = AGENTS[agentName.toUpperCase()];
    if (!agent) throw new Error(`Unknown agent: ${agentName}. Available: ${Object.keys(AGENTS).join(", ")}`);

    const personalityPrefix = PERSONALITIES[personality] ? `PERSONALITY: ${PERSONALITIES[personality]}\n\n` : "";
    const systemPrompt = `${personalityPrefix}${agent.sys}`;

    const userContent = [
      context && `CONTEXT:\n${context}`,
      errorLogs && `ERROR LOGS:\n${errorLogs}`,
      task && `TASK:\n${task}`,
    ].filter(Boolean).join("\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    return response.content[0].text;
  },

  agents: Object.keys(AGENTS),
};
