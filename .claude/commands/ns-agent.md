---
description: Scaffold a new Neural Swarm agent — creates system prompt, API route (SSE), UI component, and Supabase logging.
argument-hint: "[agent name and description, e.g. 'Recon Node - scrapes and summarizes web targets']"
---

# Neural Swarm — New Agent

Scaffold a complete new agent for Neural Swarm.

## Agent Spec
$ARGUMENTS

## What Gets Created

### 1. Agent Definition (`/agents/[name]/index.ts`)
- System prompt (corporate noir voice, specialized role)
- Input schema (TypeScript interface)
- Output schema (structured JSON)
- Tool list (if agent uses tools)

### 2. API Route (`/app/api/agents/[name]/route.ts`)
- Clerk auth check
- Stripe subscription gate (check active plan)
- Anthropic streaming SSE handler
- Supabase dispatch logging
- Token counting + limit enforcement

```typescript
// Standard agent route pattern
export async function POST(req: Request) {
  const { userId } = auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })
  
  // Check subscription
  // Parse input
  // Stream from Anthropic
  // Log to dispatches table
  // Return SSE stream
}
```

### 3. UI Component (`/components/agents/[Name]Node.tsx`)
- Agent card with corporate noir styling (mahogany/gold)
- Input form (no HTML `<form>` tag — use onClick handlers)
- Streaming output display (reads SSE, renders token by token)
- Status indicator (idle / running / complete / error)

### 4. Supabase Migration
```sql
-- dispatch logging (may already exist — check first)
INSERT INTO dispatches (user_id, agent_id, input, output, tokens)
```

## Naming Convention
- API route: `/api/agents/[kebab-name]`
- Component: `[PascalName]Node`
- Agent file: `/agents/[kebab-name]/index.ts`

## Neural Swarm Agent Voice
Agents speak in corporate noir style:
- Terse, professional, slightly ominous
- Technical precision over verbosity
- First-person when reporting results
- Example: "Target acquired. 47 vectors identified. Three critical exposures flagged."

Create all files, then show the user how to wire the new agent into the dashboard.
