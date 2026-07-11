import { useState, useEffect, useCallback, useRef } from "react";
import type { Snapshot, SnapshotIndex, Thread } from "./lib/types";
import { fetchIndex, fetchSnapshot, prefetchAdjacent } from "./lib/snapshots";
import Map            from "./components/Map";
import Scrubber       from "./components/Scrubber";
import DivergencePanel from "./components/DivergencePanel";
import ThreadLabel    from "./components/ThreadLabel";

const POLL_MS      = 5 * 60 * 1000;
const PLAY_STEP_MS = 1000;           
export default function App() {
  const [index,          setIndex]          = useState<SnapshotIndex | null>(null);
  const [snapshot,       setSnapshot]       = useState<Snapshot | null>(null);
  const [currentTs,      setCurrentTs]      = useState<string>("");
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [playing,        setPlaying]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const idx = await fetchIndex();
        setIndex(idx);
        const snap = await fetchSnapshot(idx.latest);
        setSnapshot(snap);
        setCurrentTs(idx.latest);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    load();
  }, []);

  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const idx = await fetchIndex();
        setIndex(idx);
        if (idx.latest !== currentTs && currentTs === index?.latest) {
          const snap = await fetchSnapshot(idx.latest);
          setSnapshot(snap);
          setCurrentTs(idx.latest);
        }
      } catch (_) {}
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [currentTs, index]);

  // Load a snapshot without touching playback state — shared by the play loop
  // and manual scrubbing.
  const loadSnapshot = useCallback(async (ts: string) => {
    try {
      const snap = await fetchSnapshot(ts);
      setSnapshot(snap);
      setCurrentTs(ts);
      if (index) prefetchAdjacent(ts, index.snapshots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load snapshot");
    }
  }, [index]);

  // Manual scrub (slider / play-restart): loading pauses playback.
  const handleTsChange = useCallback((ts: string) => {
    setPlaying(false);
    loadSnapshot(ts);
  }, [loadSnapshot]);

  useEffect(() => {
    if (!playing || !index) return;

    playIntervalRef.current = setInterval(() => {
      const snapshots = index.snapshots;
      const idx       = snapshots.indexOf(currentTs);
      const nextIdx   = idx + 1;

      if (nextIdx >= snapshots.length) {
        setPlaying(false);
        return;
      }

      loadSnapshot(snapshots[nextIdx]);
    }, PLAY_STEP_MS);

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [playing, currentTs, index, loadSnapshot]);

  const handlePlayPause = useCallback(() => {
    if (!index) return;
    // Starting playback at the last (newest) snapshot rewinds to the oldest so
    // it always plays forward through time instead of stopping immediately.
    if (!playing && currentTs === index.snapshots[index.snapshots.length - 1]) {
      setCurrentTs(index.snapshots[0]);
      fetchSnapshot(index.snapshots[0]).then(setSnapshot).catch(() => {});
    }
    setPlaying(p => !p);
  }, [playing, currentTs, index]);

  if (error) {
    return (
      <div style={styles.centered}>
        <p style={{ color: "#f87171" }}>{error}</p>
      </div>
    );
  }

  if (!index || !snapshot) {
    return (
      <div style={styles.centered}>
        <p style={{ color: "#64748b" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <span style={styles.title}>News Drift</span>
        <span style={styles.subtitle}>
          {snapshot.articles.length} articles · {snapshot.threads.length} threads
        </span>
      </header>

      <div style={styles.body}>
        <div style={styles.mapWrap}>
          <Map
            snapshot={snapshot}
            onThreadSelect={setSelectedThread}
            selectedThreadId={selectedThread?.id ?? null}
          />
          <ThreadLabel
            threads={snapshot.threads}
            articles={snapshot.articles}
            onSelect={setSelectedThread}
          />
        </div>

        {selectedThread && (
          <DivergencePanel
            thread={selectedThread}
            onClose={() => setSelectedThread(null)}
          />
        )}
      </div>

      <footer style={styles.footer}>
        <Scrubber
          index={index}
          currentTs={currentTs}
          onChange={handleTsChange}
          playing={playing}
          onPlayPause={handlePlayPause}
        />
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display:       "flex",
    flexDirection: "column",
    width:         "100%",
    height:        "100%",
  },
  header: {
    display:        "flex",
    alignItems:     "center",
    gap:            12,
    padding:        "10px 20px",
    borderBottom:   "1px solid #1e2535",
    background:     "#111827",
    flexShrink:     0,
  },
  title: {
    fontSize:   18,
    fontWeight: 700,
    color:      "#f1f5f9",
  },
  subtitle: {
    fontSize: 13,
    color:    "#64748b",
  },
  body: {
    display:  "flex",
    flex:     1,
    overflow: "hidden",
  },
  mapWrap: {
    flex:     1,
    position: "relative",
    overflow: "hidden",
    height:   "100%",
  },
  footer: {
    padding:    "10px 20px",
    borderTop:  "1px solid #1e2535",
    background: "#111827",
    flexShrink: 0,
  },
  centered: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    width:          "100%",
    height:         "100%",
  },
};