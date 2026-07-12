import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Article, Snapshot, Thread } from "../lib/types";
import { initScene, getScene, getCamera, frameOnce, startLoop, teardown } from "../lib/scene";
import { initParticles, updateOpacities, updateSizes, updateColors, applyEmphasis, hitTest, disposeParticles } from "../lib/particles";
import { initBonds, updateBonds, updateBondOpacities, applyBondEmphasis, disposeBonds } from "../lib/bonds";
import { initAnimate, setPulse, triggerFlash, tickAnimations, clearAnimations } from "../lib/animate";

interface Props {
  snapshot:         Snapshot;
  onThreadSelect:   (thread: Thread | null) => void;
  onThreadHover:    (thread: Thread | null) => void;
  selectedThreadId: number | null;
}

export default function Map({ snapshot, onThreadSelect, onThreadHover, selectedThreadId }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const snapshotRef   = useRef<Snapshot | null>(null);
  const knownThreads  = useRef<Set<number>>(new Set());
  const hoverThreadId = useRef<number | null>(null);
  const selectedIdRef = useRef<number | null>(selectedThreadId);
  selectedIdRef.current = selectedThreadId;

  useEffect(() => {
    if (!containerRef.current) return;

    initScene(containerRef.current);
    initBonds(getScene());
    initAnimate(() => {
      return getScene().getObjectByName("particles") as THREE.Points;
    });

    startLoop(() => {
      if (!snapshotRef.current) return;
      tickAnimations(
        snapshotRef.current.articles,
        new Float32Array(0),
      );
    });

    return () => {
      disposeParticles(getScene());
      disposeBonds(getScene());
      clearAnimations();
      teardown();
    };
  }, []);

  useEffect(() => {
    if (!snapshot.articles.length) return;

    snapshotRef.current = snapshot;

    disposeParticles(getScene());
    initParticles(getScene(), snapshot.articles);

    const pts = getScene().children.find(c => c instanceof THREE.Points) as THREE.Points | undefined;
    if (pts) pts.name = "particles";

    // Frame the camera to the data once per scene. Subsequent snapshots keep
    // the user's current pan/zoom so playback doesn't jump around.
    frameOnce(snapshot.articles);

    updateColors(snapshot.threads);
    updateOpacities(snapshot.threads);
    updateSizes(snapshot.threads);
    updateBonds(snapshot.articles, snapshot.threads);
    updateBondOpacities(snapshot.threads);

    // Re-apply the current selection/hover emphasis against the fresh styling.
    applyEmphasis(selectedIdRef.current, hoverThreadId.current);
    applyBondEmphasis(selectedIdRef.current);

    snapshot.threads.forEach(t => {
      if (!knownThreads.current.has(t.id)) {
        triggerFlash(t.id);
        knownThreads.current.add(t.id);
      }
      if (t.velocity_flag === "accelerating") {
        setPulse(t.id, 2.5);
      }
    });
  }, [snapshot]);

  // Re-apply emphasis whenever the selection changes (grey out other threads).
  useEffect(() => {
    applyEmphasis(selectedThreadId, hoverThreadId.current);
    applyBondEmphasis(selectedThreadId);
  }, [selectedThreadId]);

  // Raycast the pointer position against the point cloud, returning the article
  // under the cursor (or null).
  function pick(clientX: number, clientY: number): Article | null {
    const rect = containerRef.current!.getBoundingClientRect();
    const ndc  = new THREE.Vector2(
      ((clientX - rect.left) / rect.width)  * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.6 };
    raycaster.setFromCamera(ndc, getCamera());
    return hitTest(raycaster);
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const article = pick(e.clientX, e.clientY);
    if (!article) {
      onThreadSelect(null);
      return;
    }
    const thread = snapshot.threads.find(t => t.id === article.thread_id) ?? null;
    onThreadSelect(thread);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const article = pick(e.clientX, e.clientY);
    const tid     = article ? article.thread_id : null;
    if (tid === hoverThreadId.current) return;   // only react to changes

    hoverThreadId.current = tid;
    applyEmphasis(selectedIdRef.current, tid);
    onThreadHover(tid !== null ? (snapshot.threads.find(t => t.id === tid) ?? null) : null);
    if (containerRef.current) containerRef.current.style.cursor = tid !== null ? "pointer" : "default";
  }

  function handleMouseLeave() {
    if (hoverThreadId.current === null) return;
    hoverThreadId.current = null;
    applyEmphasis(selectedIdRef.current, null);
    onThreadHover(null);
    if (containerRef.current) containerRef.current.style.cursor = "default";
  }

  return (
  <div
    ref={containerRef}
    onClick={handleClick}
    onMouseMove={handleMouseMove}
    onMouseLeave={handleMouseLeave}
    style={{ width: "100%", height: "100%", cursor: "default" }}
  />
  );
}