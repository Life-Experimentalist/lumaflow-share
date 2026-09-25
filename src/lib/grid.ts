// Pick the column count that gives the largest tiles for `count` tiles of the
// given aspect ratio inside a width x height viewport.
export function bestColumns(count: number, width: number, height: number, aspect = 16 / 9): number {
  if (count <= 1 || width <= 0 || height <= 0) return 1;
  let best = 1;
  let bestArea = 0;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileW = Math.min(width / cols, (height / rows) * aspect);
    const area = tileW * (tileW / aspect);
    if (area > bestArea) {
      bestArea = area;
      best = cols;
    }
  }
  return best;
}
