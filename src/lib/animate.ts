import * as THREE from "three";

interface PulseAnimation {
  type:      "pulse";
  threadId:  number;
  zScore:    number;
}

interface FlashAnimation {
  type:      "flash";
  threadId:  number;
  startedAt: number;
  duration:  number;
}

type Animation = PulseAnimation | FlashAnimation;

const animations = new Map<string, Animation>();

let getPointsRef: (() => THREE.Points) | null = null;

export function initAnimate(getPoints: () => THREE.Points): void {
  getPointsRef = getPoints;
}

export function setPulse(threadId: number, zScore: number): void {
  if (zScore < 2) {
    animations.delete(`pulse-${threadId}`);
    return;
  }
  animations.set(`pulse-${threadId}`, { type: "pulse", threadId, zScore });
}

export function triggerFlash(threadId: number): void {
  animations.set(`flash-${threadId}`, {
    type:      "flash",
    threadId,
    startedAt: Date.now(),
    duration:  1500,
  });
}

export function tickAnimations(
  articleIndex: { thread_id: number }[],
  opacities: Float32Array,
): void {
  if (!getPointsRef) return;

  const now     = Date.now();
  const points  = getPointsRef();
  let   changed = false;

  const threadArticles = new Map<number, number[]>();
  articleIndex.forEach((a, i) => {
    const arr = threadArticles.get(a.thread_id) ?? [];
    arr.push(i);
    threadArticles.set(a.thread_id, arr);
  });

  for (const [key, anim] of animations) {
    if (anim.type === "flash") {
      const elapsed  = now - anim.startedAt;
      const progress = elapsed / anim.duration;

      if (progress >= 1) {
        animations.delete(key);
        continue;
      }

      const brightness = 1.0 + (1.0 - progress);
      const indices    = threadArticles.get(anim.threadId) ?? [];
      indices.forEach(i => {
        opacities[i] = Math.min(brightness, 1.0);
      });
      changed = true;
    }

    if (anim.type === "pulse") {
      const amplitude = Math.min((anim.zScore - 2) * 0.1, 0.3);
      const offset    = Math.sin(now / 800) * amplitude;
      const indices   = threadArticles.get(anim.threadId) ?? [];
      indices.forEach(i => {
        opacities[i] = Math.max(0, Math.min(1, 0.85 + offset));
      });
      changed = true;
    }
  }

  if (changed) {
    const attr = points.geometry.getAttribute("opacity") as THREE.BufferAttribute;
    if (attr) attr.needsUpdate = true;
  }
}

export function clearAnimations(): void {
  animations.clear();
}