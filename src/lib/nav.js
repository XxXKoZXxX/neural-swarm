/**
 * Navigation model — one source of truth for the rail, the mobile tab bar,
 * the "all views" sheet, the command palette and the context bar.
 */

export const NAV = [
  {
    group: "Build",
    items: [
      { id: "swarm", label: "Studio", icon: "swarm", blurb: "Compose a goal, watch the swarm work" },
      { id: "preview", label: "Preview", icon: "play", blurb: "Run what was built, at real widths" },
      { id: "files", label: "Files", icon: "folder", blurb: "Every generated file, editable" },
      { id: "terminal", label: "Terminal", icon: "terminal", blurb: "Engine log and auto-heal console" },
      { id: "canvas", label: "Canvas", icon: "flow", blurb: "Design the agent topology" },
    ],
  },
  {
    group: "Research",
    items: [
      { id: "security", label: "Security", icon: "shield", blurb: "Severity-rated audit desk" },
      { id: "research", label: "Research", icon: "search", blurb: "Briefs, tradeoffs, sources" },
      { id: "vault", label: "Vault", icon: "book", blurb: "Saved notes and decisions" },
    ],
  },
  {
    group: "Manage",
    items: [
      { id: "market", label: "Marketplace", icon: "cart", blurb: "Templates to fork and publish" },
      { id: "history", label: "History", icon: "history", blurb: "Every run, restorable and diffable" },
      { id: "insights", label: "Insights", icon: "chart", blurb: "Tokens, cost, score trend" },
      { id: "brain", label: "Memory", icon: "brain", blurb: "What the swarm learned about you" },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((group) => group.items);

export const TAB_LABELS = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item.label]));

export const TAB_BLURBS = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item.blurb]));

/** The four destinations that earn a slot in the phone tab bar. */
export const PRIMARY_TABS = ["swarm", "preview", "files", "terminal"];
