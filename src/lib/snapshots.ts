import type { Snapshot, SnapshotIndex } from "./types";

const CACHE_MAX = 6;
const cache = new Map<string, Snapshot>();

function cacheSet(ts: string, snapshot: Snapshot): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(ts, snapshot);
}

export async function fetchIndex(): Promise<SnapshotIndex> {
  const res = await fetch("/data/index.json");
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  return res.json();
}

export async function fetchSnapshot(ts: string): Promise<Snapshot> {
  if (cache.has(ts)) return cache.get(ts)!;

  const [articlesRes, threadsRes] = await Promise.all([
    fetch(`/data/snapshots/snapshot_${ts}.json`),
    fetch(`/data/snapshots/threads_${ts}.json`),
  ]);

  if (!articlesRes.ok) throw new Error(`Failed to fetch snapshot ${ts}: ${articlesRes.status}`);
  if (!threadsRes.ok)  throw new Error(`Failed to fetch threads ${ts}: ${threadsRes.status}`);

  const [articles, threads] = await Promise.all([
    articlesRes.json(),
    threadsRes.json(),
  ]);

  const snapshot: Snapshot = { ts, articles, threads };
  cacheSet(ts, snapshot);
  return snapshot;
}

export function prefetchAdjacent(ts: string, allTimestamps: string[]): void {
  const idx = allTimestamps.indexOf(ts);
  const neighbors = [
    allTimestamps[idx - 1],
    allTimestamps[idx + 1],
  ].filter(Boolean);

  for (const neighbor of neighbors) {
    if (!cache.has(neighbor)) {
      fetchSnapshot(neighbor).catch(() => {});
    }
  }
}