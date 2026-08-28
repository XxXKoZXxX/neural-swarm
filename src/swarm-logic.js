import Anthropic from "@anthropic-ai/sdk";
import { AGENT_PROMPTS } from "./agents.js";

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
    const agentPrompt = AGENT_PROMPTS[agentName.toUpperCase()];
    if (!agentPrompt) throw new Error(`Unknown agent: ${agentName}. Available: ${Object.keys(AGENT_PROMPTS).join(", ")}`);

    const personalityPrefix = PERSONALITIES[personality] ? `PERSONALITY: ${PERSONALITIES[personality]}\n\n` : "";
    const systemPrompt = `${personalityPrefix}${agentPrompt}`;

    const userContent = [
      context && `CONTEXT:\n${context}`,
      errorLogs && `ERROR LOGS:\n${errorLogs}`,
      task && `TASK:\n${task}`,
    ].filter(Boolean).join("\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    return response.content[0].text;
  },

  agents: Object.keys(AGENT_PROMPTS),
};
