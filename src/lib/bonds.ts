import * as THREE from "three";
import type { Article, Thread, VelocityFlag } from "./types";
import { threadColorRGB } from "./particles";

const MAX_MEMBERS = 12;

let lineSegments: THREE.LineSegments;
let positions:  Float32Array;
let colors:     Float32Array;
let opacities:  Float32Array;
let baseOpacities: Float32Array;    // flag-derived opacity before selection emphasis
let bondThreadIds: number[] = [];   // thread id per line segment (for opacity refresh)

export function initBonds(scene: THREE.Scene): void {
  positions = new Float32Array(0);
  colors    = new Float32Array(0);
  opacities = new Float32Array(0);

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    transparent:  true,
    depthWrite:   false,
    vertexColors: true,
    vertexShader: `
      attribute float opacity;
      varying vec3  vColor;
      varying float vOpacity;
      void main() {
        vColor      = color;
        vOpacity    = opacity;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3  vColor;
      varying float vOpacity;
      void main() {
        gl_FragColor = vec4(vColor, vOpacity);
      }
    `,
  });

  lineSegments = new THREE.LineSegments(geometry, material);
  scene.add(lineSegments);
}

function flagOpacity(flag: VelocityFlag): number {
  switch (flag) {
    case "breaking":     return 0.55;
    case "accelerating": return 0.45;
    case "fading":       return 0.10;
    default:             return 0.30;   // stable — still clearly visible
  }
}

// Draw a thread as a burst of lines from its centroid to each member, so a
// multi-article story reads as a connected constellation of its colour.
export function updateBonds(articles: Article[], threads: Thread[]): void {
  const byThread = new Map<number, Article[]>();
  for (const a of articles) {
    if (a.thread_id == null) continue;
    const arr = byThread.get(a.thread_id);
    if (arr) arr.push(a);
    else byThread.set(a.thread_id, [a]);
  }

  const flagMap = new Map<number, VelocityFlag>(threads.map(t => [t.id, t.velocity_flag]));

  const segs: { ax: number; ay: number; cx: number; cy: number; tid: number }[] = [];
  byThread.forEach((members, tid) => {
    if (members.length < 2) return;                 // singletons get no bonds
    const m  = members.slice(0, MAX_MEMBERS);
    const cx = m.reduce((s, a) => s + a.x, 0) / m.length;
    const cy = m.reduce((s, a) => s + a.y, 0) / m.length;
    for (const a of m) segs.push({ ax: a.x, ay: a.y, cx, cy, tid });
  });

  const n = segs.length;
  positions     = new Float32Array(n * 6);
  colors        = new Float32Array(n * 6);
  opacities     = new Float32Array(n * 2);
  baseOpacities = new Float32Array(n * 2);
  bondThreadIds = new Array(n);

  segs.forEach((s, i) => {
    positions[i * 6]     = s.ax; positions[i * 6 + 1] = s.ay; positions[i * 6 + 2] = 0;
    positions[i * 6 + 3] = s.cx; positions[i * 6 + 4] = s.cy; positions[i * 6 + 5] = 0;

    const [r, g, b] = threadColorRGB(s.tid);
    colors[i * 6]     = r; colors[i * 6 + 1] = g; colors[i * 6 + 2] = b;
    colors[i * 6 + 3] = r; colors[i * 6 + 4] = g; colors[i * 6 + 5] = b;

    const o = flagOpacity(flagMap.get(s.tid) ?? "stable");
    opacities[i * 2] = baseOpacities[i * 2]     = o;
    opacities[i * 2 + 1] = baseOpacities[i * 2 + 1] = o;
    bondThreadIds[i] = s.tid;
  });

  const geometry = lineSegments.geometry;
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
  geometry.setAttribute("opacity",  new THREE.BufferAttribute(opacities, 1));
}

export function updateBondOpacities(threads: Thread[]): void {
  const flagMap = new Map<number, VelocityFlag>(threads.map(t => [t.id, t.velocity_flag]));

  for (let i = 0; i < bondThreadIds.length; i++) {
    const o = flagOpacity(flagMap.get(bondThreadIds[i]) ?? "stable");
    opacities[i * 2]     = baseOpacities[i * 2]     = o;
    opacities[i * 2 + 1] = baseOpacities[i * 2 + 1] = o;
  }

  const attr = lineSegments.geometry.getAttribute("opacity") as THREE.BufferAttribute | undefined;
  if (attr) attr.needsUpdate = true;
}

// When a thread is selected, hide every other thread's bonds so only the
// selection's constellation remains. Pass null to restore all bonds.
export function applyBondEmphasis(selectedId: number | null): void {
  for (let i = 0; i < bondThreadIds.length; i++) {
    const keep = selectedId === null || bondThreadIds[i] === selectedId;
    opacities[i * 2]     = keep ? baseOpacities[i * 2]     : 0.0;
    opacities[i * 2 + 1] = keep ? baseOpacities[i * 2 + 1] : 0.0;
  }

  const attr = lineSegments.geometry.getAttribute("opacity") as THREE.BufferAttribute | undefined;
  if (attr) attr.needsUpdate = true;
}

export function disposeBonds(scene: THREE.Scene): void {
  scene.remove(lineSegments);
  lineSegments.geometry.dispose();
  (lineSegments.material as THREE.Material).dispose();
}
