import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.jsx";

/**
 * Command palette / global search.
 *
 * One input for everything: jump to a view, run the swarm, open a file, open a
 * vault note, recall a run by its goal, install a template. Results are
 * grouped and keyboard-navigable (↑ ↓ ↵ Esc), and the groups are ordered by
 * how directly they answer "where do I want to be".
 */

const GROUP_ORDER = ["Views", "Actions", "Files", "Runs", "Vault", "Templates", "Recent"];
const MAX_PER_GROUP = 6;

/** Cheap relevance: exact > prefix > word-start > substring, plus keyword hits. */
function score(item, query) {
  const label = item.label.toLowerCase();
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label)) return 60;
  if (label.includes(query)) return 40;
  const keywords = (item.keywords || []).join(" ").toLowerCase();
  if (keywords.includes(query)) return 20;
  const hint = (item.hint || "").toLowerCase();
  if (hint.includes(query)) return 10;
  return 0;
}

export default function CommandPalette({ commands = [], recents = [], onClose }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...commands, ...recents];
    const matched = all
      .map((item) => ({ item, s: q ? score(item, q) : item.group === "Views" || item.group === "Actions" ? 1 : 0 }))
      .filter(({ s }) => s > 0);

    const byGroup = new Map();
    for (const entry of matched) {
      const group = entry.item.group || "Actions";
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(entry);
    }

    const ordered = [...byGroup.keys()].sort(
      (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
    );

    const flat = [];
    for (const group of ordered) {
      const items = byGroup.get(group).sort((a, b) => b.s - a.s).slice(0, MAX_PER_GROUP);
      if (!items.length) continue;
      flat.push({ section: group });
      for (const { item } of items) flat.push(item);
    }
    return flat;
  }, [commands, query, recents]);

  const selectable = useMemo(() => results.filter((r) => !r.section), [results]);
  const current = Math.min(active, Math.max(selectable.length - 1, 0));

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const node = listRef.current?.querySelector(`[data-index="${current}"]`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  const runAt = (index) => {
    const item = selectable[index];
    if (!item) return;
    item.run?.();
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, selectable.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(current);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let selectableIndex = -1;

  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="Search views, files, runs, notes…"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            aria-label="Command input"
          />
          <button className="kbd" onClick={onClose} aria-label="Close search">
            Esc
          </button>
        </div>

        <div className="palette-list" ref={listRef} role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <div className="dim small" style={{ padding: 16 }}>
              Nothing matches “{query}”. Try a file name, a run goal or a view.
            </div>
          ) : null}

          {results.map((entry) => {
            if (entry.section) {
              return (
                <div key={`s-${entry.section}`} className="palette-section">
                  {entry.section}
                </div>
              );
            }
            selectableIndex += 1;
            const index = selectableIndex;
            return (
              <button
                key={entry.id}
                data-index={index}
                className="palette-item"
                data-active={index === current}
                role="option"
                aria-selected={index === current}
                onMouseEnter={() => setActive(index)}
                onClick={() => runAt(index)}
              >
                <span className="palette-item-icon">
                  <Icon name={entry.icon || "arrowRight"} size={14} />
                </span>
                <span className="col grow" style={{ minWidth: 0 }}>
                  <span className="truncate">{entry.label}</span>
                  {entry.hint ? <span className="dimmer tiny truncate">{entry.hint}</span> : null}
                </span>
                {index === current ? <span className="kbd">↵</span> : null}
              </button>
            );
          })}
        </div>

        <div className="palette-foot dimmer tiny">
          <span className="row gap-6">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span className="row gap-6">
            <span className="kbd">↵</span> open
          </span>
          <span className="grow" />
          <span>{selectable.length} result{selectable.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
