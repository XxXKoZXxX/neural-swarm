/** Inline stroke-icon set (no icon dependency, ~1KB gzipped for the whole app). */

const PATHS = {
  swarm: ["M12 3v4", "M12 17v4", "M5 12H3", "M21 12h-2", "M6.3 6.3 4.9 4.9", "M19.1 19.1l-1.4-1.4", "M17.7 6.3l1.4-1.4", "M4.9 19.1l1.4-1.4"],
  circle: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  sparkles: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  play: ["M6 4l14 8-14 8z"],
  stop: ["M7 7h10v10H7z"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  check: ["M4 12.5l5 5L20 6.5"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4-4"],
  settings: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L6 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"],
  sun: ["M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z", "M12 1v2", "M12 21v2", "M4.2 4.2l1.4 1.4", "M18.4 18.4l1.4 1.4", "M1 12h2", "M21 12h2", "M4.2 19.8l1.4-1.4", "M18.4 5.6l1.4-1.4"],
  moon: ["M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"],
  chevronRight: ["M9 6l6 6-6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronLeft: ["M15 6l-6 6 6 6"],
  arrowRight: ["M5 12h14", "M13 6l6 6-6 6"],
  trash: ["M4 7h16", "M9 7V5h6v2", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"],
  download: ["M12 4v11", "M7 11l5 5 5-5", "M5 20h14"],
  upload: ["M12 20V9", "M7 13l5-5 5 5", "M5 4h14"],
  refresh: ["M20 12a8 8 0 1 1-2.3-5.6", "M20 4v4h-4"],
  copy: ["M9 9h10v10H9z", "M5 15V5h10"],
  shield: ["M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z", "M9 12l2 2 4-4"],
  folder: ["M3 7h6l2 2h10v10H3z"],
  file: ["M6 3h8l4 4v14H6z", "M14 3v4h4"],
  terminal: ["M4 5h16v14H4z", "M8 10l2.5 2.5L8 15", "M13 15h4"],
  layout: ["M4 4h16v16H4z", "M4 9h16", "M10 9v11"],
  gitBranch: ["M7 4v10", "M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M7 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M17 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M17 8v2c0 2-2 3-4 3H9"],
  history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v4h4", "M12 8v4l3 2"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  brain: ["M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8V4z", "M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8V4z"],
  book: ["M4 5c3-1 5-1 8 0v14c-3-1-5-1-8 0z", "M20 5c-3-1-5-1-8 0v14c3-1 5-1 8 0z"],
  cart: ["M3 5h2l2.2 10.2A2 2 0 0 0 9.2 17h8.3a2 2 0 0 0 2-1.6L21 8H6", "M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", "M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"],
  wand: ["M15 4V2", "M15 10V8", "M11.5 6.5h2", "M18.5 6.5h2", "M4 20l10-10", "M13 7l4 4"],
  alert: ["M12 4l9 16H3z", "M12 10v4", "M12 17h.01"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v5", "M12 8h.01"],
  link: ["M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 7.3", "M14 10a4 4 0 0 0-5.7 0L6 12.3a4 4 0 0 0 5.7 5.7l1.3-1.3"],
  zap: ["M13 2L5 14h6l-1 8 8-12h-6z"],
  lock: ["M6 11h12v9H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"],
  external: ["M14 4h6v6", "M20 4l-8 8", "M18 14v6H4V6h6"],
  code: ["M9 7l-5 5 5 5", "M15 7l5 5-5 5"],
  eye: ["M12 5c5 0 8 4 9 7-1 3-4 7-9 7s-8-4-9-7c1-3 4-7 9-7z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"],
  edit: ["M4 20h4l11-11-4-4L4 16z", "M14 5l4 4"],
  save: ["M5 4h11l3 3v13H5z", "M9 4v6h6V4", "M9 20v-6h6v6"],
  layers: ["M12 3l9 5-9 5-9-5z", "M3 13l9 5 9-5"],
  cpu: ["M7 7h10v10H7z", "M4 10h3", "M4 14h3", "M17 10h3", "M17 14h3", "M10 4v3", "M14 4v3", "M10 17v3", "M14 17v3"],
  activity: ["M3 12h4l3 7 4-14 3 7h4"],
  filter: ["M3 5h18l-7 8v6l-4-2v-4z"],
  star: ["M12 3l2.7 6 6.3.6-4.8 4.3 1.4 6.1L12 17l-5.6 3 1.4-6.1L3 9.6 9.3 9z"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  key: ["M15 8a4 4 0 1 0-3.5 4l-1 1H8v2H6v2H3v-3l8-8", "M16.5 7.5h.01"],
  database: ["M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z", "M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  cloud: ["M7 18a4 4 0 0 1 .6-8 5 5 0 0 1 9.5 1.4A3.5 3.5 0 0 1 17 18z"],
  server: ["M4 4h16v6H4z", "M4 14h16v6H4z", "M7 7h.01", "M7 17h.01"],
  wifi: ["M5 12a10 10 0 0 1 14 0", "M8.5 15.5a5 5 0 0 1 7 0", "M12 19h.01"],
  send: ["M4 12l16-8-6 16-3-6z"],
  rocket: ["M14 4c4 1 6 3 6 6l-6 6-6-6 6-6z", "M8 10l-4 1 3 3", "M14 16l1 4 3-3", "M12 12l-3 6 6-3"],
  target: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 11h.01"],
  gauge: ["M12 20a8 8 0 1 1 8-8", "M12 12l4-3"],
  scale: ["M12 4v16", "M6 8l-3 6h6z", "M18 8l-3 6h6z", "M4 8h16"],
  puzzle: ["M10 4h4v3a2 2 0 1 0 4 0V4h2v6h-3a2 2 0 1 0 0 4h3v6H4v-6h3a2 2 0 1 0 0-4H4V4h6z"],
  palette: ["M12 3a9 9 0 1 0 0 18c1.7 0 2-1.3 1.3-2.2-.8-1 .1-2.3 1.4-2.3H18a3 3 0 0 0 3-3 9 9 0 0 0-9-10.5z", "M8 10h.01", "M12 8h.01", "M16 11h.01"],
  pin: ["M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z", "M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  flame: ["M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-4 .5 1.5 1.5 2 1.5 2C11 8 11.5 5 12 3z"],
  grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3.5 6h.01", "M3.5 12h.01", "M3.5 18h.01"],
  flow: ["M5 5h5v5H5z", "M14 14h5v5h-5z", "M10 7.5h2a2 2 0 0 1 2 2V14"],
  package: ["M12 3l8 4.5v9L12 21l-8-4.5v-9z", "M12 12l8-4.5", "M12 12v9", "M12 12L4 7.5"],
};

export function Icon({ name = "circle", size = 16, strokeWidth = 1.7, className = "", style, title }) {
  const d = PATHS[name] || PATHS.circle;
  return (
    <svg
      className={className}
      style={{ flex: "none", ...style }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
export default Icon;
