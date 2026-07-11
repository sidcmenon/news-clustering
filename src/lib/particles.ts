import * as THREE from "three";
import type { Article, Thread, VelocityFlag } from "./types";

const PALETTE = [
  0x60a5fa, 0x34d399, 0xf472b6, 0xfbbf24, 0xa78bfa,
  0xfb923c, 0x38bdf8, 0x4ade80, 0xf87171, 0xe879f9,
  0xfacc15, 0x2dd4bf, 0x818cf8, 0xfb7185, 0xa3e635,
  0x22d3ee, 0xc084fc, 0xfdba74, 0x86efac, 0x67e8f9,
];

const NOISE_COLOR = 0x475569;

function threadColor(threadId: number): number {
  return PALETTE[threadId % PALETTE.length];
}

let points:    THREE.Points;
let positions: Float32Array;
let colors:    Float32Array;
let opacities: Float32Array;
let articleIndex: Article[] = [];

export function initParticles(scene: THREE.Scene, articles: Article[]): void {
  articleIndex = articles;
  const n = articles.length;

  positions = new Float32Array(n * 3);
  colors    = new Float32Array(n * 3);
  opacities = new Float32Array(n);

  articles.forEach((a, i) => {
    positions[i * 3]     = a.x;
    positions[i * 3 + 1] = a.y;
    positions[i * 3 + 2] = 0;

    const hex = threadColor(a.thread_id);
    colors[i * 3]     = ((hex >> 16) & 255) / 255;
    colors[i * 3 + 1] = ((hex >> 8)  & 255) / 255;
    colors[i * 3 + 2] = (hex         & 255) / 255;

    opacities[i] = 1.0;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
  geometry.setAttribute("opacity",  new THREE.BufferAttribute(opacities, 1));

  const material = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent:  true,
    vertexShader: `
      attribute float opacity;
      varying vec3  vColor;
      varying float vOpacity;
      void main() {
        vColor   = color;
        vOpacity = opacity;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        // Scale with distance for a constant-ish world size, but clamp so
        // points stay visible when zoomed in (huge sizes get culled by the
        // GPU) and don't vanish to sub-pixel when zoomed out.
        gl_PointSize = clamp(5.0 * (300.0 / -mvPos.z), 3.0, 22.0);
        gl_Position  = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3  vColor;
      varying float vOpacity;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        if (length(uv) > 0.5) discard;
        gl_FragColor = vec4(vColor, vOpacity);
      }
    `,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);
}

export function updateOpacities(threads: Thread[]): void {
  const flagMap = new Map<number, VelocityFlag>(
    threads.map(t => [t.id, t.velocity_flag])
  );

  articleIndex.forEach((a, i) => {
    const flag = flagMap.get(a.thread_id) ?? "stable";
    opacities[i] = flag === "fading" ? 0.25 : 1.0;
  });

  const attr = points.geometry.getAttribute("opacity") as THREE.BufferAttribute;
  attr.needsUpdate = true;
}

export function updateColors(threads: Thread[]): void {
  const colorMap = new Map<number, number>(
    threads.map(t => [t.id, threadColor(t.id)])
  );

  articleIndex.forEach((a, i) => {
    const hex = colorMap.get(a.thread_id) ?? NOISE_COLOR;
    colors[i * 3]     = ((hex >> 16) & 255) / 255;
    colors[i * 3 + 1] = ((hex >> 8)  & 255) / 255;
    colors[i * 3 + 2] = (hex         & 255) / 255;
  });

  const attr = points.geometry.getAttribute("color") as THREE.BufferAttribute;
  attr.needsUpdate = true;
}

export function hitTest(raycaster: THREE.Raycaster): Article | null {
  const result = raycaster.intersectObject(points);
  if (!result.length) return null;
  const idx = result[0].index;
  return idx !== undefined ? (articleIndex[idx] ?? null) : null;
}

export function disposeParticles(scene: THREE.Scene): void {
  if (!points) return;
  scene.remove(points);
  points.geometry.dispose();
  (points.material as THREE.Material).dispose();
}