/**
 * Dependency-free markdown renderer.
 *
 * Everything is turned into React elements — no `dangerouslySetInnerHTML`
 * anywhere — so model output can never inject script into the app.
 */
import { memo, useState } from "react";
import { copyText } from "../lib/store.js";
import { Icon } from "./icons.jsx";

/* ── inline formatting ──────────────────────────────────────────────────── */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<)]+)/g;

const SAFE_URL = /^(https?:|mailto:)/i;

function inlineNodes(text, keyPrefix = "i") {
  const nodes = [];
  let last = 0;
  let match;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("`")) nodes.push(<code className="inline-code" key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<del key={key}>{token.slice(2, -2)}</del>);
    else if (token.startsWith("*") || token.startsWith("_")) nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("[")) {
      const link = token.match(/\[([^\]]+)\]\(([^)\s]+)\)/);
      if (link && SAFE_URL.test(link[2]))
        nodes.push(
          <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>,
        );
      else nodes.push(token);
    } else if (SAFE_URL.test(token))
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer noopener">
          {token}
        </a>,
      );
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* ── syntax highlighting (lightweight, language-agnostic) ───────────────── */
const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|new|await|async|try|catch|finally|throw|typeof|instanceof|interface|type|enum|implements|public|private|readonly|static|def|elif|lambda|pass|with|as|in|not|and|or|None|True|False|null|undefined|true|false|this|super|yield|match|case|break|continue|do|switch|package|struct|impl|fn|pub|use|mut|select|from|where|insert|update|delete|create|table|join|on|group|order|by|limit|values|into|alter|index|primary|key|references)\b/;

function highlight(code, lang = "") {
  const out = [];
  const pattern =
    /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)\b|([{}()[\];,.<>=+\-*/%!?&|:]+)/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = pattern.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [token, comment, str, num, word] = m;
    if (comment) out.push(<span className="tok-com" key={`c${key++}`}>{token}</span>);
    else if (str) out.push(<span className="tok-str" key={`s${key++}`}>{token}</span>);
    else if (num) out.push(<span className="tok-num" key={`n${key++}`}>{token}</span>);
    else if (word) {
      if (KEYWORDS.test(word)) out.push(<span className="tok-key" key={`k${key++}`}>{token}</span>);
      else if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) out.push(<span className="tok-tag" key={`t${key++}`}>{token}</span>);
      else if (code[m.index + token.length] === "(") out.push(<span className="tok-fn" key={`f${key++}`}>{token}</span>);
      else out.push(token);
    } else out.push(token);
    last = m.index + token.length;
  }
  if (last < code.length) out.push(code.slice(last));
  void lang;
  return out;
}

export function CodeBlock({ code = "", lang = "", path = "", maxHeight = 380 }) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };
  return (
    <div style={{ margin: "10px 0" }}>
      <div className="row between" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-soft)", borderBottom: "none", borderRadius: "var(--r-sm) var(--r-sm) 0 0", padding: "6px 10px" }}>
        <span className="mono tiny dim truncate">
          {path || lang || "code"}
          {code ? ` · ${code.split("\n").length} lines` : ""}
        </span>
        <span className="row gap-4">
          <button className="btn btn-sm btn-ghost" onClick={() => setWrapped((w) => !w)} title="Toggle line wrapping">
            {wrapped ? "no wrap" : "wrap"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={copy}>
            <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </div>
      <pre className="code" style={{ borderRadius: "0 0 var(--r-sm) var(--r-sm)", maxHeight, whiteSpace: wrapped ? "pre-wrap" : "pre" }}>
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  );
}

/* ── block parser ───────────────────────────────────────────────────────── */
function renderBlocks(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let key = 0;

  const flushList = (items, ordered) => {
    if (!items.length) return;
    const Tag = ordered ? "ol" : "ul";
    out.push(
      <Tag key={`l${key++}`}>
        {items.map((item, idx) => (
          <li key={idx} className={item.task !== null ? "task" : undefined}>
            {item.task !== null && <input type="checkbox" checked={item.task} readOnly tabIndex={-1} style={{ marginTop: 4 }} />}
            <span>{inlineNodes(item.text, `li${key}-${idx}`)}</span>
          </li>
        ))}
      </Tag>,
    );
    items.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, "").trim();
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const [maybePath, maybeLang] = lang.split(/[\s:]+/).filter(Boolean);
      const isPath = maybePath && /[./]/.test(maybePath);
      out.push(
        <CodeBlock
          key={`cd${key++}`}
          code={body.join("\n")}
          lang={(isPath ? maybeLang : maybePath) || ""}
          path={isPath ? maybePath : ""}
        />,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 5);
      const Tag = `h${level}`;
      out.push(<Tag key={`h${key++}`}>{inlineNodes(heading[2], `h${key}`)}</Tag>);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
      out.push(<hr key={`hr${key++}`} />);
      i += 1;
      continue;
    }

    // tables: header row followed by a separator row
    if (line.includes("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || "")) {
      const cells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      out.push(
        <table key={`tb${key++}`}>
          <thead>
            <tr>{head.map((c, idx) => <th key={idx}>{inlineNodes(c, `th${idx}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ridx) => (
              <tr key={ridx}>{r.map((c, cidx) => <td key={cidx}>{inlineNodes(c, `td${ridx}-${cidx}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(<blockquote key={`bq${key++}`}>{renderBlocks(quoted.join("\n"))}</blockquote>);
      continue;
    }

    const listItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      const ordered = /\d/.test(listItem[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        const text = m[3];
        const task = /^\[[ xX]\]\s*/.test(text) ? /^\[[xX]\]/.test(text) : null;
        items.push({ text: task === null ? text : text.replace(/^\[[ xX]\]\s*/, ""), task });
        i += 1;
      }
      flushList(items, ordered);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (!para.length) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(<p key={`p${key++}`}>{inlineNodes(para.join(" "), `p${key}`)}</p>);
  }
  return out;
}

function MarkdownBase({ children = "", className = "" }) {
  if (!children) return null;
  return <div className={`prose ${className}`.trim()}>{renderBlocks(children)}</div>;
}

export const Markdown = memo(MarkdownBase);
export default Markdown;
