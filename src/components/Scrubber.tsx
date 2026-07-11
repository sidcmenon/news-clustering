import type { SnapshotIndex } from "../lib/types";

interface Props {
  index:      SnapshotIndex;
  currentTs:  string;
  onChange:   (ts: string) => void;
  playing:    boolean;
  onPlayPause: () => void;
}

export default function Scrubber({ index, currentTs, onChange, playing, onPlayPause }: Props) {
  const { snapshots } = index;
  const currentIdx    = snapshots.indexOf(currentTs);

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const idx = Number(e.target.value);
    onChange(snapshots[idx]);
  }

  // Format "20260711T1500Z" → "Jul 11, 15:00"
  function formatTs(ts: string): string {
    const year  = ts.slice(0, 4);
    const month = ts.slice(4, 6);
    const day   = ts.slice(6, 8);
    const hour  = ts.slice(9, 11);
    const date  = new Date(`${year}-${month}-${day}T${hour}:00:00Z`);
    return date.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    });
  }

  return (
    <div style={styles.wrap}>
      <button onClick={onPlayPause} style={styles.button}>
        {playing ? "⏸" : "▶"}
      </button>

      <span style={styles.label}>{formatTs(snapshots[0])}</span>

      <input
        type="range"
        min={0}
        max={snapshots.length - 1}
        value={currentIdx === -1 ? 0 : currentIdx}
        onChange={handleSlider}
        style={styles.slider}
      />

      <span style={styles.label}>{formatTs(snapshots[snapshots.length - 1])}</span>

      <span style={styles.current}>{formatTs(currentTs)}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display:    "flex",
    alignItems: "center",
    gap:        12,
    width:      "100%",
  },
  button: {
    background:  "none",
    border:      "1px solid #334155",
    borderRadius: 4,
    color:       "#e2e8f0",
    cursor:      "pointer",
    padding:     "4px 10px",
    fontSize:    14,
  },
  slider: {
    flex:   1,
    cursor: "pointer",
    accentColor: "#60a5fa",
  },
  label: {
    fontSize:   12,
    color:      "#64748b",
    whiteSpace: "nowrap",
  },
  current: {
    fontSize:   13,
    color:      "#e2e8f0",
    whiteSpace: "nowrap",
    minWidth:   110,
    textAlign:  "right",
  },
};