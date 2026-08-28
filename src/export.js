// Single Markdown rendering of a run, shared by the file download and the Gist
// export so the two can't drift.
export function buildRunMarkdown({goal,branch,agents,overseer,agentDefs={},fallbackIcon="⬡"}) {
  const parts=[`# Neural Swarm Run\n**Goal:** ${goal}\n**Branch:** ${branch}\n**Date:** ${new Date().toLocaleString()}\n`];
  Object.entries(agents).forEach(([name,out])=>{
    parts.push(`## ${agentDefs[name]?.i||fallbackIcon} ${name}\n\`\`\`\n${out.text}\n\`\`\`\n`);
  });
  if(overseer)parts.push(`## ◈ OVERSEER\n${overseer}\n`);
  return parts.join("\n");
}
