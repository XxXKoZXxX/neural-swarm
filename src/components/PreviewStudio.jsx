import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, Segmented } from "./ui.jsx";
import { useToast } from "../hooks/useToast.js";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import { Icon } from "./icons.jsx";
import Markdown from "./Markdown.jsx";
import { buildPreviewDoc, extractCodeFiles } from "../lib/api.js";
import { copyText, downloadText } from "../lib/store.js";

const DEVICES = {
  desktop: { label: "Desktop", width: "100%", icon: "monitor" },
  tablet: { label: "Tablet", width: "820px", icon: "layers" },
  mobile: { label: "Mobile", width: "390px", icon: "phone" },
};

const CONSOLE_BRIDGE = `<script>
(function(){
  var send=function(level,args){try{parent.postMessage({__ns:true,level:level,text:Array.prototype.map.call(args,function(a){try{return typeof a==='string'?a:JSON.stringify(a)}catch(e){return String(a)}}).join(' ')},'*')}catch(e){}};
  ['log','warn','error','info'].forEach(function(k){var o=console[k].bind(console);console[k]=function(){send(k,arguments);o.apply(null,arguments)}});
  window.addEventListener('error',function(e){send('error',[e.message+' @ '+((e.filename||'')+':'+(e.lineno||0))])});
  window.addEventListener('unhandledrejection',function(e){send('error',['Unhandled rejection: '+e.reason])});
})();
</script>`;

/** Live preview of whatever the swarm produced, v0/Bolt style. */
export default function PreviewStudio({ swarm, goal, onOpenTab, routeDevice }) {
  const toast = useToast();
  const isMobile = useIsMobile();
  // On a phone the honest default is the phone frame; deep links can override.
  const [device, setDevice] = useState(() => (routeDevice && DEVICES[routeDevice] ? routeDevice : isMobile ? "mobile" : "desktop"));
  const [tab, setTab] = useState("preview");
  const [nonce, setNonce] = useState(0);
  const [messages, setMessages] = useState([]);
  const iframeRef = useRef(null);

  const files = useMemo(() => {
    const all = [];
    for (const [agent, out] of Object.entries(swarm.outputs || {})) {
      if (out?.text) all.push(...extractCodeFiles(out.text, { agentName: agent }));
    }
    const seen = new Set();
    return all.filter((f) => (seen.has(f.path) ? false : seen.add(f.path)));
  }, [swarm.outputs]);

  const spec = useMemo(
    () =>
      Object.entries(swarm.outputs || {})
        .map(([agent, out]) => `## ${agent}\n\n${out?.text || ""}`)
        .join("\n\n---\n\n"),
    [swarm.outputs],
  );

  const doc = useMemo(() => {
    let html = buildPreviewDoc(files, { goal, spec }).html;
    // The bridge must be present in every document shape, including HTML
    // fragments that have neither <head> nor </body>.
    html = /<head>/i.test(html) ? html.replace(/<head>/i, `<head>${CONSOLE_BRIDGE}`) : `${CONSOLE_BRIDGE}${html}`;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${CONSOLE_BRIDGE}</body>`) : `${html}${CONSOLE_BRIDGE}`;
    return html;
  }, [files, goal, spec]);

  useEffect(() => {
    const onMsg = (e) => {
      const data = e.data;
      if (!data || data.__ns !== true) return;
      setMessages((prev) => [...prev.slice(-80), { id: Math.random().toString(36).slice(2), level: data.level, text: String(data.text).slice(0, 900), at: new Date() }]);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const errors = messages.filter((m) => m.level === "error").length;

  if (!Object.keys(swarm.outputs || {}).length) {
    return (
      <div>
        <PageHead />
        <EmptyState
          icon="play"
          title="Nothing to preview yet"
          action={
            <Button variant="primary" icon="rocket" onClick={() => onOpenTab("swarm")}>
              Go run a mission
            </Button>
          }
        >
          The preview renders any HTML the swarm produced — CSS and JS files are inlined automatically. When the delivery is only React or TypeScript sources, you get the specification
          view instead, plus a console that captures runtime errors.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHead files={files} errors={errors} />

      <div className="toolbar mb-12 wrap">
        <Segmented value={tab} onChange={setTab} options={[{ value: "preview", label: "Preview", icon: "play" }, { value: "spec", label: "Spec", icon: "file" }]} />
        {tab === "preview" ? <Segmented value={device} onChange={setDevice} options={Object.entries(DEVICES).map(([v, d]) => ({ value: v, label: d.label, icon: d.icon }))} /> : null}
        <span className="grow" />
        <Button size="sm" icon="refresh" onClick={() => setNonce((n) => n + 1)}>
          Reload
        </Button>
        <Button
          size="sm"
          icon="external"
          onClick={() => {
            const win = window.open("", "_blank");
            if (!win) return toast.warn("Popup blocked — allow popups to open the preview in a tab.");
            win.document.write(doc);
            win.document.close();
          }}
        >
          New tab
        </Button>
        <Button size="sm" icon="download" onClick={() => downloadText("preview.html", doc, "text/html;charset=utf-8")}>
          Export HTML
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="copy"
          onClick={async () => {
            if (await copyText(doc)) toast.success("Preview HTML copied");
          }}
        >
          Copy HTML
        </Button>
      </div>

      {tab === "preview" ? (
        <div className="col gap-12">
          <div className="device-frame" style={{ width: DEVICES[device].width, maxWidth: "100%" }}>
            <div className="device-bar">
              <span className="dot" style={{ background: "#ff5f56" }} />
              <span className="dot" style={{ background: "#ffbd2e" }} />
              <span className="dot" style={{ background: "#27c93f" }} />
              <span className="dimmer tiny mono grow truncate" style={{ marginLeft: 8 }}>
                {goal.slice(0, 70) || "preview"}
              </span>
              <Badge tone={errors ? "danger" : "accent"}>{errors ? `${errors} error${errors === 1 ? "" : "s"}` : "no errors"}</Badge>
            </div>
            <div className="iframe-shell">
              <iframe
                key={`${nonce}-${device}`}
                ref={iframeRef}
                title="Swarm preview"
                srcDoc={doc}
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
                style={{ width: "100%", height: "100%", border: 0, background: "#fff", display: "block" }}
              />
            </div>
          </div>

          <div className="card">
            <div className="row between" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-soft)" }}>
              <span className="row gap-8">
                <Icon name="terminal" size={14} />
                <span className="small strong">Preview console</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setMessages([])} disabled={!messages.length}>
                Clear
              </Button>
            </div>
            <div className="console" style={{ border: 0, borderRadius: 0, maxHeight: 220, minHeight: 92 }}>
              {messages.length === 0 ? (
                <span className="dimmer">No console output. Errors, warnings and logs from the preview appear here.</span>
              ) : (
                messages.map((m) => (
                  <div className="console-line" key={m.id}>
                    <span className="dimmer">{m.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    <span style={{ color: m.level === "error" ? "var(--accent-rose)" : m.level === "warn" ? "var(--accent-amber)" : "var(--text-2)" }}>{m.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card card-pad" style={{ maxHeight: "70vh", overflow: "auto" }}>
          <Markdown>{spec || "_No specification text yet._"}</Markdown>
        </div>
      )}
    </div>
  );
}

function PageHead({ files = [], errors = 0 }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">Live preview</h1>
        <p className="page-sub">
          {files.length} file{files.length === 1 ? "" : "s"} rendered in a sandboxed frame with a script-less bridge for console output. Errors surface immediately
          {errors ? ` — ${errors} right now.` : "."}
        </p>
      </div>
    </div>
  );
}
