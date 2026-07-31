// Renders a completed run as Markdown (used by file export and Gist export).
export function buildRunMarkdown({goal,branch,agents,overseer,agentDefs={}}) {
  const parts=[`# Neural Swarm Run\n**Goal:** ${goal}\n**Branch:** ${branch}\n**Date:** ${new Date().toLocaleString()}\n`];
  Object.entries(agents).forEach(([name,out])=>{
    parts.push(`## ${agentDefs[name]?.i||"⬡"} ${name}\n\`\`\`\n${out.text}\n\`\`\`\n`);
  });
  if(overseer)parts.push(`## ◈ OVERSEER\n${overseer}\n`);
  return parts.join("\n");
}
