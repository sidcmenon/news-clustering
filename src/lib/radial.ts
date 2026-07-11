import type { Thread } from "./types";

export interface RadialPoint {
  source:   string;
  distance: number;
  x:        number;
  y:        number;
  angle:    number;
}

const VIEWPORT  = 200;
const CENTER    = VIEWPORT / 2;
const MAX_RADIUS = 80;

export function computeRadialLayout(thread: Thread): RadialPoint[] {
  const { outlet_distances } = thread;
  const sources = Object.keys(outlet_distances).sort();

  if (sources.length === 0) return [];

  const maxDist = Math.max(...Object.values(outlet_distances), 0.001);

  return sources.map((source, i) => {
    const angle    = (2 * Math.PI * i) / sources.length - Math.PI / 2;
    const distance = outlet_distances[source];
    const r        = (distance / maxDist) * MAX_RADIUS;

    return {
      source,
      distance,
      x: CENTER + r * Math.cos(angle),
      y: CENTER + r * Math.sin(angle),
      angle,
    };
  });
}

export function viewportSize(): number {
  return VIEWPORT;
}