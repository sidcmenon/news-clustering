import type { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot;
}

interface Stat {
  label: string;
  value: number;
  color?: string;
}

export default function StatsBar({ snapshot }: Props) {
  const { articles, threads } = snapshot;

  const singletons   = threads.filter(t => t.article_count < 2).length;
  const multiOutlet  = threads.filter(t => t.n_outlets >= 2).length;
  const breaking     = threads.filter(t => t.velocity_flag === "breaking").length;
  const accelerating = threads.filter(t => t.velocity_flag === "accelerating").length;

  const stats: Stat[] = [
    { label: "articles",     value: articles.length },
    { label: "threads",      value: threads.length },
    { label: "multi-outlet", value: multiOutlet },
    { label: "singletons",   value: singletons },
    { label: "breaking",     value: breaking,     color: "#f87171" },
    { label: "accelerating", value: accelerating, color: "#fbbf24" },
  ];

  return (
    <div style={styles.bar}>
      {stats.map(s => (
        <div key={s.label} style={styles.chip}>
          <span style={{ ...styles.value, color: s.color ?? "#e2e8f0" }}>{s.value}</span>
          <span style={styles.label}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display:    "flex",
    alignItems: "center",
    gap:        18,
    marginLeft: "auto",
  },
  chip: {
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    lineHeight:    1.1,
  },
  value: {
    fontSize:   15,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  label: {
    fontSize:      10,
    color:         "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
};
