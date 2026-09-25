import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, Field, IconButton, Input, Select } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import { Icon } from "./icons.jsx";
import { AGENT_KEYS, FLOW_PRESETS, STORAGE, getAgent, uid } from "../lib/constants.js";
import { readStored, writeStored } from "../lib/store.js";

const NODE_W = 176;
const NODE_H = 84;

const topoSort = (nodes, edges) => {
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!indegree.has(e.to) || !indegree.has(e.from)) continue;
    indegree.set(e.to, indegree.get(e.to) + 1);
    adj.get(e.from).push(e.to);
  }
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adj.get(id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return { order, cyclic: order.length !== nodes.length };
};

/** Visual agent topology builder → runs as a fixed pipeline. */
export default function Canvas({ goal, swarm, onOpenTab, isGated, onUpgrade }) {
  const toast = useToast();
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [nodes, setNodes] = useState(() => FLOW_PRESETS[0].nodes.map((name, i) => ({ id: uid("n"), name, x: 60 + i * 210, y: 150 + (i % 2) * 90 })));
  const [edges, setEdges] = useState(() => nodes.slice(0, -1).map((n, i) => ({ id: uid("e"), from: n.id, to: nodes[i + 1].id })));
  const [selected, setSelected] = useState(null);
  const [linking, setLinking] = useState(null);
  const [addAgent, setAddAgent] = useState(AGENT_KEYS[0]);
  const [flows, setFlows] = useState(() => readStored(STORAGE.flows, []));
  const [flowName, setFlowName] = useState("");
  const isMobile = useIsMobile();

  useEffect(() => {
    writeStored(STORAGE.flows, flows);
  }, [flows]);

  const loadPreset = useCallback((preset) => {
    const next = preset.nodes.map((name, i) => ({ id: uid("n"), name, x: 60 + i * 210, y: 150 + (i % 2) * 90 }));
    setNodes(next);
    setEdges(next.slice(0, -1).map((n, i) => ({ id: uid("e"), from: n.id, to: next[i + 1].id })));
    setSelected(null);
    setLinking(null);
  }, []);

  const { order, cyclic } = useMemo(() => topoSort(nodes, edges), [nodes, edges]);


  const onPointerDown = (e, node) => {
    const rect = wrapRef.current.getBoundingClientRect();
    dragRef.current = { id: node.id, dx: e.clientX - rect.left - node.x, dy: e.clientY - rect.top - node.y };
    setSelected(node.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const { id, dx, dy } = dragRef.current;
    const x = Math.max(6, Math.min(rect.width - NODE_W - 6, e.clientX - rect.left - dx));
    const y = Math.max(6, Math.min(rect.height - NODE_H - 6, e.clientY - rect.top - dy));
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const connect = (from, to) => {
    if (from === to || edges.some((e) => e.from === from && e.to === to)) return;
    const next = [...edges, { id: uid("e"), from, to }];
    setEdges(next);
    if (topoSort(nodes, next).cyclic) {
      toast.warn("That link would create a cycle — connections must stay acyclic.");
      setEdges(edges);
    }
  };

  const removeNode = (id) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    setSelected(null);
  };

  const addNode = () => {
    const id = uid("n");
    setNodes((prev) => [...prev, { id, name: addAgent, x: 60 + (prev.length % 4) * 190, y: 40 + Math.floor(prev.length / 4) * 110 }]);
  };

  const chain = cyclic ? [] : order.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);

  /** Rebuild the edges so the graph runs in exactly this order. */
  const setChainOrder = (ordered) => {
    setEdges(ordered.slice(0, -1).map((n, i) => ({ id: `e_${n.id}_${ordered[i + 1].id}`, from: n.id, to: ordered[i + 1].id })));
    setNodes(ordered.map((n, i) => ({ ...n, x: 60 + i * 190, y: 120 + (i % 2) * 90 })));
  };

  const move = (index, delta) => {
    const next = [...chain];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setChainOrder(next);
  };

  const launch = async () => {
    if (isGated) return onUpgrade?.();
    if (!goal.trim()) {
      toast.warn("Add a goal on the Swarm tab first — the canvas reuses it.");
      onOpenTab("swarm");
      return;
    }
    if (!chain.length) return toast.warn("Add at least one agent to the canvas.");
    onOpenTab("swarm");
    await swarm.run(goal, { ...{}, fixedAgents: chain.map((n) => ({ name: n.name, instruction: `Execute your ${n.name} responsibility for this goal.` })) });
  };

  const edgePath = (from, to) => {
    const a = nodes.find((n) => n.id === from);
    const b = nodes.find((n) => n.id === to);
    if (!a || !b) return "";
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Flow canvas</h1>
          <p className="page-sub">
            Drag nodes, connect the ports, and run the graph as a fixed pipeline. Cycles are rejected before they reach the runtime.
          </p>
        </div>
        <div className="row gap-8 wrap">
          <Button icon="play" variant="primary" onClick={launch} disabled={!chain.length || swarm.isRunning}>
            Run this topology
          </Button>
          <Button icon="refresh" variant="ghost" onClick={() => loadPreset(FLOW_PRESETS[Math.floor(Math.random() * FLOW_PRESETS.length)])}>
            Shuffle preset
          </Button>
        </div>
      </div>

      <div className="toolbar mb-12">
        <Field label="Presets" className="grow" style={{ maxWidth: 260 }}>
          <Select
            defaultValue=""
            onChange={(e) => {
              const preset = FLOW_PRESETS.find((p) => p.id === e.target.value);
              if (preset) loadPreset(preset);
            }}
            options={[{ value: "", label: "Choose a preset…" }, ...FLOW_PRESETS.map((p) => ({ value: p.id, label: `${p.name} — ${p.desc}` }))]}
          />
        </Field>
        <Field label="Add agent">
          <div className="row gap-6">
            <Select value={addAgent} onChange={(e) => setAddAgent(e.target.value)} options={AGENT_KEYS} />
            <Button icon="plus" onClick={addNode}>
              Add
            </Button>
          </div>
        </Field>
        <span className="grow" />
        <div className="row gap-6">
          <Input placeholder="Flow name" value={flowName} onChange={(e) => setFlowName(e.target.value)} style={{ width: 160 }} />
          <Button
            icon="save"
            onClick={() => {
              if (!flowName.trim()) return toast.warn("Name the flow first.");
              setFlows((prev) => [...prev, { id: uid("f"), name: flowName.trim(), nodes, edges }]);
              setFlowName("");
              toast.success("Flow saved to this device");
            }}
          >
            Save
          </Button>
          <Select
            defaultValue=""
            onChange={(e) => {
              const saved = flows.find((f) => f.id === e.target.value);
              if (saved) {
                setNodes(saved.nodes);
                setEdges(saved.edges);
              }
            }}
            options={[{ value: "", label: `Saved (${flows.length})` }, ...flows.map((f) => ({ value: f.id, label: f.name }))]}
          />
        </div>
      </div>

      <div className="canvas-wrap" ref={wrapRef} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag} onClick={(e) => e.target === e.currentTarget && setLinking(null)}>
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {edges.map((e) => (
            <path key={e.id} d={edgePath(e.from, e.to)} fill="none" stroke="var(--accent-line)" strokeWidth="1.6" markerEnd="" />
          ))}
        </svg>

        {nodes.map((node) => {
          const agent = getAgent(node.name);
          const isSelected = selected === node.id;
          return (
            <div
              key={node.id}
              className="dag-node"
              data-selected={isSelected}
              style={{ left: node.x, top: node.y }}
              onPointerDown={(e) => onPointerDown(e, node)}
            >
              <div className="dag-node-head" style={{ color: agent.color }}>
                <span>{agent.icon}</span>
                <span className="grow truncate">{node.name}</span>
                <button
                  className="btn btn-icon btn-ghost"
                  style={{ width: 22, height: 22 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNode(node.id);
                  }}
                  aria-label={`Remove ${node.name}`}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
              <div className="dag-node-body">{agent.blurb || "Custom specialist"}</div>
              <span
                className="port port-in"
                data-active={linking && linking !== node.id}
                title="Input"
                onClick={(e) => {
                  e.stopPropagation();
                  if (linking && linking !== node.id) connect(linking, node.id);
                  setLinking(null);
                }}
              />
              <span
                className="port port-out"
                data-active={linking === node.id}
                title="Output — click, then click another node's input"
                onClick={(e) => {
                  e.stopPropagation();
                  setLinking(linking === node.id ? null : node.id);
                }}
              />
            </div>
          );
        })}

        {!nodes.length ? <EmptyState icon="flow" title="No agents on the canvas" action={<Button icon="plus" onClick={() => loadPreset(FLOW_PRESETS[0])}>Load the first preset</Button>} /> : null}
      </div>

      {isMobile ? (
        <div className="card mt-12" style={{ padding: 12 }}>
          <div className="row between gap-8">
            <span className="strong small">Run order</span>
            <span className="dimmer tiny">top to bottom</span>
          </div>
          <p className="tiny muted mt-4">Reordering on a phone beats dragging: move a step up or down and the links rebuild themselves.</p>
          <div className="col gap-6 mt-10">
            {chain.map((node, index) => {
              const agent = getAgent(node.name);
              return (
                <div key={node.id} className="row gap-8 inset" style={{ padding: "6px 8px" }}>
                  <span className="dimmer tiny mono" style={{ width: 18 }}>
                    {index + 1}
                  </span>
                  <span style={{ color: agent.color }}>{agent.icon}</span>
                  <span className="small truncate grow">{node.name}</span>
                  <IconButton name="chevronDown" label={`Move ${node.name} down`} size={14} onClick={() => move(index, 1)} />
                  <IconButton name="chevronLeft" label={`Move ${node.name} up`} size={14} onClick={() => move(index, -1)} />
                  <IconButton name="trash" label={`Remove ${node.name}`} size={14} onClick={() => removeNode(node.id)} />
                </div>
              );
            })}
            {!chain.length ? <div className="dim tiny" style={{ padding: 8 }}>No steps yet — add an agent above.</div> : null}
          </div>
          <div className="row gap-8 mt-10">
            <Select aria-label="Agent to append" className="grow" value={addAgent} onChange={(e) => setAddAgent(e.target.value)} options={AGENT_KEYS} />
            <Button size="sm" icon="plus" onClick={addNode}>
              Append
            </Button>
          </div>
        </div>
      ) : null}

      <div className="row between wrap gap-12 mt-12">
        <div className="row gap-8 wrap">
          {cyclic ? (
            <Badge tone="danger" icon="alert">
              cycle detected — the graph cannot run
            </Badge>
          ) : (
            <>
              <Badge tone="accent" icon="flow">
                {chain.length} node{chain.length === 1 ? "" : "s"} in order
              </Badge>
              <span className="dimmer tiny mono">{chain.map((n) => n.name).join(" → ") || "empty graph"}</span>
            </>
          )}
        </div>
        <span className="dimmer tiny">Runs reuse the goal from the Swarm tab{goal ? `: “${goal.slice(0, 48)}…”` : ""}</span>
      </div>
    </div>
  );
}
