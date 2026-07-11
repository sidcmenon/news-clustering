import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Thread } from "../lib/types";
import { getCamera } from "../lib/scene";

interface Props {
  threads:   Thread[];
  articles:  { thread_id: number; x: number; y: number }[];
  onSelect:  (thread: Thread) => void;
}

interface LabelPos {
  thread:  Thread;
  screenX: number;
  screenY: number;
}

// Only label threads that carry enough articles to be worth naming. Most
// threads are singletons, and labelling all of them just produces a pile of
// overlapping text. Show at most MAX_LABELS, largest threads first.
const MIN_ARTICLES = 2;
const MAX_LABELS   = 14;

// Approximate pixel footprint of a label, used for greedy overlap rejection.
const LABEL_W = 130;
const LABEL_H = 16;

export default function ThreadLabel({ threads, articles, onSelect }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null);
  const frameRef  = useRef<number>(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Compute centroid in world space for each thread
  function computeCentroids(): Map<number, { x: number; y: number }> {
    const sums = new Map<number, { x: number; y: number; n: number }>();
    for (const a of articles) {
      const cur = sums.get(a.thread_id) ?? { x: 0, y: 0, n: 0 };
      sums.set(a.thread_id, { x: cur.x + a.x, y: cur.y + a.y, n: cur.n + 1 });
    }
    const centroids = new Map<number, { x: number; y: number }>();
    sums.forEach(({ x, y, n }, id) => {
      centroids.set(id, { x: x / n, y: y / n });
    });
    return centroids;
  }

  // Project world coords to screen coords using the Three.js camera
  function projectToScreen(
    wx: number,
    wy: number,
    svgW: number,
    svgH: number,
  ): { x: number; y: number } {
    const vec = new THREE.Vector3(wx, wy, 0);
    vec.project(getCamera());
    return {
      x: (vec.x  + 1) / 2 * svgW,
      y: (-vec.y + 1) / 2 * svgH,
    };
  }

  useEffect(() => {
    function update() {
      const svg = svgRef.current;
      if (!svg) {
        frameRef.current = requestAnimationFrame(update);
        return;
      }

      const svgW = svg.clientWidth;
      const svgH = svg.clientHeight;

      const centroids = computeCentroids();
      const labels: LabelPos[] = [];
      const placed: { x: number; y: number }[] = [];

      // Largest threads first, so the most significant labels win when two
      // would overlap.
      const ranked = [...threads]
        .filter(t => t.article_count >= MIN_ARTICLES)
        .sort((a, b) => b.article_count - a.article_count);

      for (const thread of ranked) {
        if (labels.length >= MAX_LABELS) break;

        const centroid = centroids.get(thread.id);
        if (!centroid) continue;

        const { x, y } = projectToScreen(centroid.x, centroid.y, svgW, svgH);

        // Skip labels outside the viewport
        if (x < 0 || x > svgW || y < 0 || y > svgH) continue;

        // Greedy declutter: drop a label that collides with one already placed.
        const collides = placed.some(
          p => Math.abs(p.x - x) < LABEL_W && Math.abs(p.y - y) < LABEL_H,
        );
        if (collides) continue;

        placed.push({ x, y });
        labels.push({ thread, screenX: x, screenY: y });
      }

      // Clear and re-render labels
      svg.innerHTML = "";
      for (const { thread, screenX, screenY } of labels) {
        const opacity = thread.velocity_flag === "fading" ? 0.3 : 1.0;
        const size    = thread.velocity_flag === "breaking"     ? 13
                      : thread.velocity_flag === "accelerating" ? 12
                      : 11;

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x",              String(screenX));
        text.setAttribute("y",              String(screenY - 10));
        text.setAttribute("text-anchor",    "middle");
        text.setAttribute("font-size",      String(size));
        text.setAttribute("font-weight",    "600");
        text.setAttribute("fill",           "#cbd5e1");
        text.setAttribute("opacity",        String(opacity));
        // Clickable: selects the thread and opens the divergence panel. The
        // parent <svg> stays pointer-events:none so drags pass through to the
        // map; only the text itself intercepts clicks.
        text.setAttribute("pointer-events", "auto");
        text.style.cursor = "pointer";
        text.style.textShadow = "0 1px 3px #0d0f14";
        text.textContent = thread.label;
        text.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRef.current(thread);
        });
        svg.appendChild(text);
      }

      frameRef.current = requestAnimationFrame(update);
    }

    frameRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameRef.current);
  }, [threads, articles]);

  return (
    <svg
      ref={svgRef}
      style={{
        position:      "absolute",
        inset:         0,
        width:         "100%",
        height:        "100%",
        pointerEvents: "none",
      }}
    />
  );
}