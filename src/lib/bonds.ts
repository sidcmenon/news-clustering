import * as THREE from "three";
import type { Article, Thread } from "./types";

const MAX_BONDS_PER_THREAD = 10;

let lineSegments: THREE.LineSegments;
let positions:    Float32Array;
let opacities:    Float32Array;

export function initBonds(scene: THREE.Scene): void {
  positions = new Float32Array(0);
  opacities = new Float32Array(0);

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    vertexShader: `
      attribute float opacity;
      varying float vOpacity;
      void main() {
        vOpacity    = opacity;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      void main() {
        gl_FragColor = vec4(0.6, 0.7, 0.9, vOpacity);
      }
    `,
  });

  lineSegments = new THREE.LineSegments(geometry, material);
  scene.add(lineSegments);
}

export function updateBonds(articles: Article[], threads: Thread[]): void {
  const articleMap = new Map<string, Article>(
    articles.map(a => [a.id, a])
  );

  const pairs: [Article, Article][] = [];

  for (const thread of threads) {
    const members = thread.article_ids
      .slice(0, MAX_BONDS_PER_THREAD)
      .map(id => articleMap.get(id))
      .filter((a): a is Article => a !== undefined);

    for (let i = 0; i < members.length - 1; i++) {
      pairs.push([members[i], members[i + 1]]);
    }
  }

  const n = pairs.length;
  positions = new Float32Array(n * 6);
  opacities = new Float32Array(n * 2);

  pairs.forEach(([a, b], i) => {
    positions[i * 6]     = a.x;
    positions[i * 6 + 1] = a.y;
    positions[i * 6 + 2] = 0;
    positions[i * 6 + 3] = b.x;
    positions[i * 6 + 4] = b.y;
    positions[i * 6 + 5] = 0;
  });

  const geometry = lineSegments.geometry;
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("opacity",  new THREE.BufferAttribute(opacities, 1));
}

export function updateBondOpacities(threads: Thread[]): void {
  const now = Date.now();

  const ageMap = new Map<number, string>(
    threads.map(t => [t.id, t.velocity_flag])
  );

  const articleMap = new Map<string, Article>();

  let pairIdx = 0;
  for (const thread of threads) {
    const flag    = ageMap.get(thread.id) ?? "stable";
    const opacity = flag === "breaking"     ? 0.6
                  : flag === "accelerating" ? 0.45
                  : flag === "fading"       ? 0.05
                  : 0.15;

    const bondCount = Math.max(0, Math.min(thread.article_ids.length - 1, MAX_BONDS_PER_THREAD - 1));
    for (let i = 0; i < bondCount; i++) {
      if (pairIdx * 2 + 1 < opacities.length) {
        opacities[pairIdx * 2]     = opacity;
        opacities[pairIdx * 2 + 1] = opacity;
      }
      pairIdx++;
    }
  }

  const attr = lineSegments.geometry.getAttribute("opacity") as THREE.BufferAttribute;
  if (attr) attr.needsUpdate = true;
}

export function disposeBonds(scene: THREE.Scene): void {
  scene.remove(lineSegments);
  lineSegments.geometry.dispose();
  (lineSegments.material as THREE.Material).dispose();
}