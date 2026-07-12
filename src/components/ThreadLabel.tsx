import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Thread } from "../lib/types";
import { getCamera } from "../lib/scene";

interface Props {
  threads:          Thread[];
  articles:         { thread_id: number; x: number; y: number }[];
  hoveredThreadId:  number | null;
  selectedThreadId: number | null;
}

// Labels are no longer shown for every thread (that was a wall of overlapping
// text). Instead we show a single label for the thread the cursor is over, plus
// the selected thread — anchored to that cluster's centroid and tracking the
// camera each frame.
export default function ThreadLabel({ threads, articles, hoveredThreadId, selectedThreadId }: Props) {
  const svgRef   = useRef<SVGSVGElement>(null);
  const frameRef = useRef<number>(0);

  // Keep the latest props available to the animation loop without restarting it.
  const stateRef = useRef({ threads, articles, hoveredThreadId, selectedThreadId });
  stateRef.current = { threads, articles, hoveredThreadId, selectedThreadId };

  function centroidFor(
    id: number,
    articles: { thread_id: number; x: number; y: number }[],
  ): { x: number; y: number } | null {
    let sx = 0, sy = 0, n = 0;
    for (const a of articles) {
      if (a.thread_id === id) { sx += a.x; sy += a.y; n++; }
    }
    return n ? { x: sx / n, y: sy / n } : null;
  }

  function projectToScreen(wx: number, wy: number, svgW: number, svgH: number) {
    const vec = new THREE.Vector3(wx, wy, 0);
    vec.project(getCamera());
    return { x: (vec.x + 1) / 2 * svgW, y: (-vec.y + 1) / 2 * svgH };
  }

  useEffect(() => {
    function update() {
      frameRef.current = requestAnimationFrame(update);
      const svg = svgRef.current;
      if (!svg) return;

      const { threads, articles, hoveredThreadId, selectedThreadId } = stateRef.current;
      const svgW = svg.clientWidth;
      const svgH = svg.clientHeight;

      // Selected first (drawn under), hovered last (drawn on top); dedupe.
      const ids = [selectedThreadId, hoveredThreadId].filter(
        (id, i, arr): id is number => id !== null && arr.indexOf(id) === i,
      );

      svg.innerHTML = "";
      for (const id of ids) {
        const thread = threads.find(t => t.id === id);
        if (!thread) continue;
        const centroid = centroidFor(id, articles);
        if (!centroid) continue;

        const { x, y } = projectToScreen(centroid.x, centroid.y, svgW, svgH);
        if (x < 0 || x > svgW || y < 0 || y > svgH) continue;

        const isSelected = id === selectedThreadId;

        // Rounded backing pill so the label reads over the busy point cloud.
        const padX = 8, h = 22;
        const approxW = thread.label.length * 7.2 + padX * 2;
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x - approxW / 2));
        rect.setAttribute("y", String(y - 26 - h / 2));
        rect.setAttribute("width",  String(approxW));
        rect.setAttribute("height", String(h));
        rect.setAttribute("rx", "6");
        rect.setAttribute("fill", "#0d0f14");
        rect.setAttribute("opacity", "0.82");
        rect.setAttribute("stroke", isSelected ? "#93c5fd" : "#334155");
        rect.setAttribute("stroke-width", "1");
        svg.appendChild(rect);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(x));
        text.setAttribute("y", String(y - 26));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("font-size", "12.5");
        text.setAttribute("font-weight", "600");
        text.setAttribute("fill", "#f1f5f9");
        text.textContent = thread.label;
        svg.appendChild(text);
      }
    }

    frameRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

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
