# Neural Swarm — Feature Expansion (2026-08-06)

## Added Features Summary

1. **🛡 Security Audit & Bug Bounty Desk (`AUDIT` Tab)**:
   - Automated 3-stage security inspection pipeline: `RESEARCHER` → `DEBUGGER` → `REVIEWER`.
   - Supports targeting GitHub repository URLs or pasting raw code snippets.
   - Categorizes vulnerability issue severity ([CRITICAL], [MAJOR], [MINOR], [NIT]).
   - Generates exact root-cause diagnostics and patch code diffs.
   - Includes 1-click "Export as GitHub Issue" and "Save to Neural Vault".

2. **🕸 Visual DAG Agent Workflow Builder (`CANVAS` Tab)**:
   - Interactive visual graph node builder for customizing agent execution DAGs.
   - Preset topologies:
     - `SaaS Dev Pipeline`: Architect → Coder → Tester → Reviewer
     - `Bug Bounty Scan`: Researcher → Debugger → Reviewer
     - `Refactor & Polish`: Analyst → Refactorer → Tester
     - `UI/UX Spec & Code`: Designer → Coder → Reviewer
   - One-click launch into active Swarm execution.

3. **🗝 Neural Vault & Knowledge Base (`VAULT` Tab)**:
   - Storage for reusable IP snippets, architectural decisions, and agent prompts across runs.
   - Tag filtering (`Architecture`, `Security`, `Refactoring`, `Prompts`, `Code Snippet`) and keyword search.
   - 1-click "Inject into Swarm Goal" button to load stored knowledge directly into active prompt context.

4. **🎙 Audio Briefings (Text-To-Speech)**:
   - Web Speech API integration in Overseer evaluation cards for hands-free audio briefings.

5. **💻 Dispatch Code Exporter**:
   - Programmatic script generator for Node.js (`@anthropic-ai/sdk`), Python (`anthropic`), and cURL SSE endpoints.
