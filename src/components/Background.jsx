import { useEffect, useRef } from "react";
import { AGENTS, AGENT_KEYS } from "../lib/constants.js";

const PALETTE = Object.values(AGENTS).map((a) => a.color);
const PHASE_TINT = {
  idle: [0, 0, 0],
  planning: [16, 10, 0],
  running: [0, 14, 14],
  overseeing: [10, 0, 18],
  done: [0, 14, 7],
  error: [18, 6, 6],
  aborted: [10, 8, 0],
};

const hexToRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/**
 * Ambient swarm canvas: drifting nodes, connections that brighten while an
 * agent is streaming, and travelling packets between active agents.
 *
 * Performance notes: device-pixel-ratio capped at 1.5, node count scales with
 * viewport area, and the whole loop stops for `prefers-reduced-motion` or when
 * the document is hidden.
 */
export default function Background({ agOut = {}, phase = "idle" }) {
  const canvasRef = useRef(null);
  const live = useRef({ agOut: {}, phase: "idle", mx: -9999, my: -9999 });
  const rafRef = useRef(0);

  useEffect(() => {
    live.current.agOut = agOut;
    live.current.phase = phase;
  }, [agOut, phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d", { alpha: true });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    };
    resize();

    const onMove = (e) => {
      live.current.mx = e.clientX * dpr;
      live.current.my = e.clientY * dpr;
    };
    const onLeave = () => {
      live.current.mx = -9999;
      live.current.my = -9999;
    };
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    const agentKeys = AGENT_KEYS;
    const nodeCount = clamp(Math.round((window.innerWidth * window.innerHeight) / 26000), 18, 46);
    const nodes = Array.from({ length: nodeCount + agentKeys.length }, (_, i) => {
      const isAgent = i >= nodeCount;
      const key = isAgent ? agentKeys[i - nodeCount] : null;
      const z = isAgent ? 0.75 : 0.2 + Math.random() * 0.8;
      return {
        id: i,
        agent: key,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z,
        vx: (Math.random() - 0.5) * 0.35 * z,
        vy: (Math.random() - 0.5) * 0.35 * z,
        color: isAgent ? AGENTS[key].color : PALETTE[i % PALETTE.length],
        radius: isAgent ? 3.4 : 0.9 + z * 2,
        glow: 0,
        pulse: Math.random() * Math.PI * 2,
      };
    });

    const packets = [];
    const prevStatus = {};
    let last = performance.now();

    const frame = (now) => {
      const dt = clamp((now - last) / 16.67, 0.05, 3);
      last = now;
      const W = canvas.width;
      const H = canvas.height;
      const state = live.current;
      const tint = PHASE_TINT[state.phase] || PHASE_TINT.idle;

      ctx.clearRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.5, -H * 0.2, 0, W * 0.5, -H * 0.2, H * 1.1);
      glow.addColorStop(0, `rgba(${16 + tint[0]},${185 + tint[1]},${129 + tint[2]},0.10)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      const speed = state.phase === "running" ? 1.5 : state.phase === "planning" ? 1.2 : 1;

      for (const node of nodes) {
        node.pulse += 0.02 * dt;
        const status = node.agent ? state.agOut[node.agent]?.status : null;
        node.glow = lerp(node.glow, status === "running" ? 1 : status === "done" ? 0.4 : status === "error" ? 0.8 : 0, 0.05 * dt);
        if (node.agent && status === "running" && prevStatus[node.agent] !== "running") {
          packets.push({ from: node, to: null, t: 0, burst: true });
        }
        if (node.agent) prevStatus[node.agent] = status;

        const dx = node.x - state.mx;
        const dy = node.y - state.my;
        const dist2 = dx * dx + dy * dy;
        const reach = 170 * dpr;
        if (dist2 < reach * reach && dist2 > 1) {
          const d = Math.sqrt(dist2);
          node.vx += (dx / d) * (1 - d / reach) * 0.5 * dt;
          node.vy += (dy / d) * (1 - d / reach) * 0.5 * dt;
        }

        node.vx += (W * 0.5 - node.x) * 0.00003 * dt;
        node.vy += (H * 0.5 - node.y) * 0.00003 * dt;
        node.vx *= 1 - 0.02 * dt;
        node.vy *= 1 - 0.02 * dt;
        const sp = Math.hypot(node.vx, node.vy);
        const max = 0.75 * node.z * speed * dpr;
        if (sp > max) {
          node.vx *= max / sp;
          node.vy *= max / sp;
        }
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        const margin = 60 * dpr;
        if (node.x < margin) node.vx += (margin - node.x) * 0.002 * dt;
        if (node.x > W - margin) node.vx -= (node.x - (W - margin)) * 0.002 * dt;
        if (node.y < margin) node.vy += (margin - node.y) * 0.002 * dt;
        if (node.y > H - margin) node.vy -= (node.y - (H - margin)) * 0.002 * dt;
      }

      const near = 150 * dpr;
      const agentNear = 210 * dpr;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          const limit = a.agent || b.agent ? agentNear : near;
          if (d2 > limit * limit) continue;
          const d = Math.sqrt(d2);
          const t = 1 - d / limit;
          const active = (a.agent && state.agOut[a.agent]?.status === "running") || (b.agent && state.agOut[b.agent]?.status === "running");
          const alpha = t * (active ? 0.5 : 0.085) * Math.min(a.z, b.z);
          const [ar, ag, ab] = hexToRgb(a.color);
          const [br, bg, bb] = hexToRgb(b.color);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${(ar + br) >> 1},${(ag + bg) >> 1},${(ab + bb) >> 1},${alpha})`;
          ctx.lineWidth = (active ? t * 1.7 : t * 0.6) * dpr;
          ctx.stroke();
          if (active && !reduce && Math.random() < 0.0022 * dt) packets.push({ from: a, to: b, t: 0 });
        }
      }

      for (let i = packets.length - 1; i >= 0; i -= 1) {
        const p = packets[i];
        if (!p.to) {
          // startup ripple on the agent node itself
          p.t += 0.06 * dt;
          if (p.t > 1) {
            packets.splice(i, 1);
            continue;
          }
          const [r, g, b] = hexToRgb(p.from.color);
          ctx.beginPath();
          ctx.arc(p.from.x, p.from.y, 6 * dpr + p.t * 46 * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - p.t) * 0.6})`;
          ctx.lineWidth = 1.4 * dpr;
          ctx.stroke();
          continue;
        }
        p.t += 0.012 * dt;
        if (p.t >= 1) {
          packets.splice(i, 1);
          continue;
        }
        const [r, g, b] = hexToRgb(p.from.color);
        const x = lerp(p.from.x, p.to.x, p.t);
        const y = lerp(p.from.y, p.to.y, p.t);
        ctx.beginPath();
        ctx.arc(x, y, 2.4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
        ctx.fill();
      }

      for (const node of nodes) {
        const pulse = 0.8 + 0.2 * Math.sin(node.pulse);
        const radius = node.radius * pulse * (1 + node.glow * 0.5) * dpr;
        const [r, g, b] = hexToRgb(node.color);
        if (node.glow > 0.05) {
          const halo = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 9);
          halo.addColorStop(0, `rgba(${r},${g},${b},${node.glow * 0.3})`);
          halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * 9, 0, Math.PI * 2);
          ctx.fillStyle = halo;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${node.agent ? 0.55 + node.glow * 0.45 : 0.16 + node.z * 0.26})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    if (reduce) {
      // Draw a single static frame — no animation loop for reduced motion.
      frame(performance.now());
      cancelAnimationFrame(rafRef.current);
    } else {
      rafRef.current = requestAnimationFrame(frame);
    }

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(rafRef.current);
      else if (!reduce) rafRef.current = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none", opacity: 0.7 }}
    />
  );
}
