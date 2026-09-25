export type Columns = "auto" | 1 | 2 | 3 | 4;

export type GridLayout = { cols: number; tileWidth: number; maxCols: number };

type Options = { minTileWidth: number; aspect: number };

// Tiles sit edge to edge, so every size is a plain division of the wall.
export function gridLayout(
  count: number,
  width: number,
  height: number,
  columns: Columns,
  { minTileWidth, aspect }: Options,
): GridLayout {
  const maxCols = Math.max(1, Math.floor(width / minTileWidth));
  if (count <= 0 || width <= 0 || height <= 0) {
    return { cols: 1, tileWidth: Math.max(width, 0), maxCols };
  }

  // Fill the width, but never grow a feed taller than the screen.
  const filling = (cols: number) => ({
    cols,
    tileWidth: Math.floor(Math.min(width / cols, height * aspect)),
    maxCols,
  });

  if (columns !== "auto") return filling(Math.max(1, Math.min(columns, count, maxCols)));

  // Auto: the column count that shows every feed on one screen at the
  // largest size, whatever the window's shape.
  const fitted = (cols: number) =>
    Math.min(width / cols, (height / Math.ceil(count / cols)) * aspect);
  let best = 1;
  for (let cols = 2; cols <= count; cols++) {
    if (fitted(cols) > fitted(best)) best = cols;
  }
  if (fitted(best) >= minTileWidth) {
    return { cols: best, tileWidth: Math.floor(fitted(best)), maxCols };
  }

  // Too many feeds to fit at a watchable size: fill the width and scroll.
  return filling(Math.min(maxCols, count));
}
