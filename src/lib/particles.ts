import * as THREE from "three";
import type { Article, Thread } from "./types";

const PALETTE = [
  0x60a5fa, 0x34d399, 0xf472b6, 0xfbbf24, 0xa78bfa,
  0xfb923c, 0x38bdf8, 0x4ade80, 0xf87171, 0xe879f9,
  0xfacc15, 0x2dd4bf, 0x818cf8, 0xfb7185, 0xa3e635,
  0x22d3ee, 0xc084fc, 0xfdba74, 0x86efac, 0x67e8f9,
];

const NOISE_COLOR = 0x475569;

const BASE_SIZE      = 4.0;   // world-size multiplier for a singleton dot
const SINGLETON_DIM  = 0.30;  // opacity for one-article threads (recede)
const HIGHLIGHT_GROW = 1.8;   // size boost for a hovered thread's dots

function threadColor(threadId: number): number {
  return PALETTE[threadId % PALETTE.length];
}

export function threadColorRGB(threadId: number): [number, number, number] {
  const hex = threadColor(threadId);
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const FADED_COLOR: [number, number, number] = [0.29, 0.33, 0.41]; // slate grey
const FADED_OPACITY = 0.07;                                        // non-selected threads

let points:    THREE.Points;
let positions: Float32Array;
let colors:    Float32Array;
let opacities: Float32Array;
let sizes:     Float32Array;
// "Base" style (thread colour + per-thread opacity/size before emphasis).
let baseColors:    Float32Array;
let baseOpacities: Float32Array;
let baseSizes:     Float32Array;
let articleIndex: Article[] = [];

export function initParticles(scene: THREE.Scene, articles: Article[]): void {
  articleIndex = articles;
  const n = articles.length;

  positions     = new Float32Array(n * 3);
  colors        = new Float32Array(n * 3);
  opacities     = new Float32Array(n);
  sizes         = new Float32Array(n);
  baseColors    = new Float32Array(n * 3);
  baseOpacities = new Float32Array(n);
  baseSizes     = new Float32Array(n);

  articles.forEach((a, i) => {
    positions[i * 3]     = a.x;
    positions[i * 3 + 1] = a.y;
    positions[i * 3 + 2] = 0;

    const hex = threadColor(a.thread_id);
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8)  & 255) / 255;
    const b = (hex         & 255) / 255;
    colors[i * 3] = baseColors[i * 3]     = r;
    colors[i * 3 + 1] = baseColors[i * 3 + 1] = g;
    colors[i * 3 + 2] = baseColors[i * 3 + 2] = b;

    opacities[i]     = 1.0;
    baseOpacities[i] = 1.0;
    sizes[i]         = BASE_SIZE;
    baseSizes[i]     = BASE_SIZE;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
  geometry.setAttribute("opacity",  new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute("size",     new THREE.BufferAttribute(sizes,     1));

  const material = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent:  true,
    vertexShader: `
      attribute float opacity;
      attribute float size;
      varying vec3  vColor;
      varying float vOpacity;
      void main() {
        vColor   = color;
        vOpacity = opacity;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        // Scale with distance for a constant-ish world size, but clamp so
        // points stay visible when zoomed in (huge sizes get culled by the
        // GPU) and don't vanish to sub-pixel when zoomed out.
        gl_PointSize = clamp(size * (300.0 / -mvPos.z), 2.5, 30.0);
        gl_Position  = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3  vColor;
      varying float vOpacity;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        // Mostly-solid disk with a thin anti-aliased edge (crisp, not blurry).
        float alpha = vOpacity * (1.0 - smoothstep(0.44, 0.5, d));
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);
}

// Dim singleton (one-article) threads so real, multi-article stories stand out.
export function updateOpacities(threads: Thread[]): void {
  const info = new Map<number, Thread>(threads.map(t => [t.id, t]));

  articleIndex.forEach((a, i) => {
    const t     = info.get(a.thread_id);
    const count = t?.article_count ?? 1;
    const flag  = t?.velocity_flag ?? "stable";

    let o = count < 2 ? SINGLETON_DIM : 1.0;
    if (flag === "fading") o = Math.min(o, 0.25);

    baseOpacities[i] = o;
    opacities[i]     = o;
  });

  (points.geometry.getAttribute("opacity") as THREE.BufferAttribute).needsUpdate = true;
}

// Grow dots for larger threads so clusters read as weightier than lone dots.
export function updateSizes(threads: Thread[]): void {
  const info = new Map<number, Thread>(threads.map(t => [t.id, t]));

  articleIndex.forEach((a, i) => {
    const count = info.get(a.thread_id)?.article_count ?? 1;
    const s = count < 2
      ? BASE_SIZE * 0.75
      : BASE_SIZE * (1.0 + Math.min(count, 12) * 0.07);

    baseSizes[i] = s;
    sizes[i]     = s;
  });

  (points.geometry.getAttribute("size") as THREE.BufferAttribute).needsUpdate = true;
}

export function updateColors(threads: Thread[]): void {
  const colorMap = new Map<number, number>(
    threads.map(t => [t.id, threadColor(t.id)])
  );

  articleIndex.forEach((a, i) => {
    const hex = colorMap.get(a.thread_id) ?? NOISE_COLOR;
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8)  & 255) / 255;
    const b = (hex         & 255) / 255;
    colors[i * 3] = baseColors[i * 3]     = r;
    colors[i * 3 + 1] = baseColors[i * 3 + 1] = g;
    colors[i * 3 + 2] = baseColors[i * 3 + 2] = b;
  });

  (points.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
}

// Compute each dot's live style from its base style plus the current selection
// and hover. When a thread is selected, every other thread greys out and fades
// so the selection stands alone. Hover grows/brightens a thread's dots. Pass
// (null, null) to clear.
export function applyEmphasis(selectedId: number | null, hoveredId: number | null): void {
  if (!points) return;

  articleIndex.forEach((a, i) => {
    const isSelected = selectedId !== null && a.thread_id === selectedId;
    const isHovered  = hoveredId  !== null && a.thread_id === hoveredId;
    const faded      = selectedId !== null && !isSelected;

    if (faded) {
      colors[i * 3]     = FADED_COLOR[0];
      colors[i * 3 + 1] = FADED_COLOR[1];
      colors[i * 3 + 2] = FADED_COLOR[2];
      opacities[i]      = FADED_OPACITY;
      sizes[i]          = baseSizes[i] * 0.85;
    } else {
      colors[i * 3]     = baseColors[i * 3];
      colors[i * 3 + 1] = baseColors[i * 3 + 1];
      colors[i * 3 + 2] = baseColors[i * 3 + 2];
      opacities[i]      = isSelected || isHovered ? 1.0 : baseOpacities[i];
      sizes[i]          = isHovered  ? baseSizes[i] * HIGHLIGHT_GROW
                        : isSelected ? baseSizes[i] * 1.15
                        : baseSizes[i];
    }
  });

  (points.geometry.getAttribute("color")   as THREE.BufferAttribute).needsUpdate = true;
  (points.geometry.getAttribute("opacity") as THREE.BufferAttribute).needsUpdate = true;
  (points.geometry.getAttribute("size")    as THREE.BufferAttribute).needsUpdate = true;
}

export function hitTest(raycaster: THREE.Raycaster): Article | null {
  const result = raycaster.intersectObject(points);
  if (!result.length) return null;
  let best = result[0];
  for (const r of result) {
    const d  = r.distanceToRay    ?? Infinity;
    const bd = best.distanceToRay ?? Infinity;
    if (d < bd) best = r;
  }

  const idx = best.index;
  return idx !== undefined ? (articleIndex[idx] ?? null) : null;
}

export function disposeParticles(scene: THREE.Scene): void {
  if (!points) return;
  scene.remove(points);
  points.geometry.dispose();
  (points.material as THREE.Material).dispose();
}
