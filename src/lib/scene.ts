import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene:    THREE.Scene;
let camera:   THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let animId:   number;
let resizeObserver: ResizeObserver;
let framed = false;

export function initScene(container: HTMLDivElement): void {
  framed = false;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f14);

  const w = container.clientWidth;
  const h = container.clientHeight;

  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.set(0, 0, 50);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate     = false;
  controls.enableDamping    = true;
  controls.dampingFactor    = 0.08;
  controls.screenSpacePanning = true;

  resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);
}

export function getScene():    THREE.Scene              { return scene;    }
export function getCamera():   THREE.PerspectiveCamera  { return camera;   }
export function getRenderer(): THREE.WebGLRenderer      { return renderer; }

// Frame the camera to the data once per scene, then leave it alone so
// playback across snapshots keeps the user's current pan/zoom.
export function frameOnce(pts: { x: number; y: number }[]): void {
  if (framed) return;
  fitCameraToPoints(pts);
  framed = true;
}

// Frame the camera so the given points fill the viewport, centered.
export function fitCameraToPoints(pts: { x: number; y: number }[]): void {
  if (!pts.length) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const width  = Math.max(maxX - minX, 0.001);
  const height = Math.max(maxY - minY, 0.001);

  const pad  = 1.25; // leave a margin around the cloud
  const vFov = (camera.fov * Math.PI) / 180;
  const distH = (height * pad) / 2 / Math.tan(vFov / 2);
  const distW = (width  * pad) / 2 / Math.tan(vFov / 2) / camera.aspect;
  const dist  = Math.max(distH, distW, 5);

  camera.position.set(cx, cy, dist);
  camera.updateProjectionMatrix();
  controls.target.set(cx, cy, 0);
  controls.update();
}

export function startLoop(onFrame: () => void): void {
  function loop() {
    animId = requestAnimationFrame(loop);
    controls.update();
    onFrame();
    renderer.render(scene, camera);
  }
  loop();
}

export function teardown(): void {
  cancelAnimationFrame(animId);
  resizeObserver.disconnect();
  controls.dispose();
  renderer.dispose();
  // Remove the canvas from the DOM. Without this, a re-mount (e.g. React
  // StrictMode's double-invoke in dev) leaves a dead canvas behind and the
  // live one gets pushed out of the container.
  renderer.domElement.parentNode?.removeChild(renderer.domElement);
}