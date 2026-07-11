import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Snapshot, Thread } from "../lib/types";
import { initScene, getScene, getCamera, frameOnce, startLoop, teardown } from "../lib/scene";
import { initParticles, updateOpacities, updateColors, hitTest, disposeParticles } from "../lib/particles";
import { initBonds, updateBonds, updateBondOpacities, disposeBonds } from "../lib/bonds";
import { initAnimate, setPulse, triggerFlash, tickAnimations, clearAnimations } from "../lib/animate";

interface Props {
  snapshot:         Snapshot;
  onThreadSelect:   (thread: Thread | null) => void;
  selectedThreadId: number | null;
}

export default function Map({ snapshot, onThreadSelect, selectedThreadId }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const snapshotRef   = useRef<Snapshot | null>(null);
  const knownThreads  = useRef<Set<number>>(new Set());

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
    updateBonds(snapshot.articles, snapshot.threads);
    updateBondOpacities(snapshot.threads);

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

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect    = containerRef.current!.getBoundingClientRect();
    const ndc     = new THREE.Vector2(
      ((e.clientX - rect.left)  / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.5 };
    raycaster.setFromCamera(ndc, getCamera());

    const article = hitTest(raycaster);
    if (!article) {
      onThreadSelect(null);
      return;
    }

    const thread = snapshot.threads.find(t => t.id === article.thread_id) ?? null;
    onThreadSelect(thread);
  }

  return (
  <div
    ref={containerRef}
    onClick={handleClick}
    style={{ width: "100%", height: "100%", cursor: "crosshair" }}
  />
  );
}