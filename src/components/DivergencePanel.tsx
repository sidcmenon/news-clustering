import type { Thread } from "../lib/types";
import { computeRadialLayout, viewportSize } from "../lib/radial";
import React from "react";

interface Props {
  thread:  Thread;
  onClose: () => void;
}

const PALETTE = [
  "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa",
  "#fb923c", "#38bdf8", "#4ade80", "#f87171", "#e879f9",
];

function sourceColor(source: string, outlets: string[]): string {
  const idx = [...outlets].sort().indexOf(source);
  return PALETTE[idx % PALETTE.length];
}

export default function DivergencePanel({ thread, onClose }: Props) {
  const points = computeRadialLayout(thread);
  const size   = viewportSize();
  const center = size / 2;

  const topArticles = thread.article_ids.slice(0, 5);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.label}>{thread.label}</span>
        <button onClick={onClose} style={styles.close}>✕</button>
      </div>

      <div style={styles.meta}>
        <span style={flagStyle(thread.velocity_flag)}>{thread.velocity_flag}</span>
        <span style={styles.dim}>{thread.article_count} articles · {thread.n_outlets} outlets</span>
      </div>

      {points.length >= 2 && (
        <>
          <p style={styles.sectionLabel}>Source framing divergence</p>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            style={styles.svg}
          >
            {/* Guide circles */}
            {[0.33, 0.66, 1.0].map(r => (
              <circle
                key={r}
                cx={center} cy={center}
                r={r * 80}
                fill="none"
                stroke="#1e2535"
                strokeWidth={1}
              />
            ))}

            {/* Spokes */}
            {points.map(p => (
              <line
                key={p.source}
                x1={center} y1={center}
                x2={p.x}    y2={p.y}
                stroke="#1e2535"
                strokeWidth={1}
              />
            ))}

            {/* Outlet dots */}
            {points.map(p => (
              <g key={p.source}>
                <circle
                  cx={p.x} cy={p.y} r={5}
                  fill={sourceColor(p.source, thread.outlets)}
                />
                <text
                  x={p.x + Math.cos(p.angle) * 12}
                  y={p.y + Math.sin(p.angle) * 12}
                  fontSize={9}
                  fill="#94a3b8"
                  textAnchor={p.x < center ? "end" : "start"}
                  dominantBaseline="middle"
                >
                  {p.source}
                </text>
              </g>
            ))}

            {/* Center dot */}
            <circle cx={center} cy={center} r={3} fill="#475569" />
          </svg>

          <p style={styles.dim}>
            Divergence score: {thread.divergence_score.toFixed(3)}
          </p>
        </>
      )}

      <p style={styles.sectionLabel}>Recent articles</p>
      <ul style={styles.list}>
        {topArticles.map(id => (
          <ArticleRow key={id} id={id} thread={thread} />
        ))}
      </ul>
    </div>
  );
}

function ArticleRow({ id, thread }: { id: string; thread: Thread }) {
  // article_ids are URLs — derive source from outlet_distances keys
  // We don't have full article objects here, so link directly
  return (
    <li style={styles.listItem}>
      <a href={id} target="_blank" rel="noopener noreferrer" style={styles.link}>
        {id}
      </a>
    </li>
  );
}

function flagStyle(flag: string): React.CSSProperties {
  const colors: Record<string, string> = {
    breaking:     "#f87171",
    accelerating: "#fbbf24",
    fading:       "#64748b",
    stable:       "#34d399",
  };
  return { fontSize: 11, fontWeight: 700, color: colors[flag] ?? "#94a3b8", textTransform: "uppercase" };
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width:       320,
    height:      "100%",
    background:  "#111827",
    borderLeft:  "1px solid #1e2535",
    overflowY:   "auto",
    padding:     16,
    display:     "flex",
    flexDirection: "column",
    gap:         12,
    flexShrink:  0,
  },
  header: {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "flex-start",
    gap:            8,
  },
  label: {
    fontSize:   15,
    fontWeight: 600,
    color:      "#f1f5f9",
    lineHeight: 1.4,
  },
  close: {
    background: "none",
    border:     "none",
    color:      "#64748b",
    cursor:     "pointer",
    fontSize:   16,
    flexShrink: 0,
  },
  meta: {
    display:    "flex",
    alignItems: "center",
    gap:        10,
  },
  dim: {
    fontSize: 12,
    color:    "#64748b",
  },
  sectionLabel: {
    fontSize:    11,
    color:       "#475569",
    fontWeight:  600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  svg: {
    display:    "block",
    margin:     "0 auto",
    overflow:   "visible",
  },
  list: {
    listStyle: "none",
    display:   "flex",
    flexDirection: "column",
    gap:       8,
  },
  listItem: {
    fontSize:   13,
    lineHeight: 1.4,
  },
  link: {
    color:          "#60a5fa",
    textDecoration: "none",
    wordBreak:      "break-all",
  },
};