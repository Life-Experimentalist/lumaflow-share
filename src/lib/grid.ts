export type Columns = "auto" | 1 | 2 | 3 | 4;
export type GridLayout = { cols: number; tileWidth: number; maxCols: number };

type Options = { gap: number; minTileWidth: number; aspect: number };

// How far tiles may shrink so the last row fits on screen instead of scrolling.
const FIT_SHRINK = 0.15;

// Landscape screens get 3 columns and portrait screens 1, unless the viewer
// picked a count. Tiles fill the width and the page scrolls when rows run out
// of room, except when a small shrink would fit everything on one screen.
export function gridLayout(
  count: number,
  width: number,
  height: number,
  columns: Columns,
  { gap, minTileWidth, aspect }: Options,
): GridLayout {
  const maxCols = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
  if (count <= 0 || width <= 0) return { cols: 1, tileWidth: Math.max(width, 0), maxCols };

  const wanted = columns === "auto" ? (width >= height ? 3 : 1) : columns;
  const cols = Math.max(1, Math.min(wanted, count, maxCols));
  const rows = Math.ceil(count / cols);

  const byWidth = (width - gap * (cols - 1)) / cols;
  const byHeight = ((height - gap * (rows - 1)) / rows) * aspect;
  const oneScreen = height * aspect; // a single tile is never taller than the screen

  let tileWidth = Math.min(byWidth, oneScreen);
  if (byHeight < tileWidth && byHeight >= tileWidth * (1 - FIT_SHRINK)) tileWidth = byHeight;

  return { cols, tileWidth: Math.floor(tileWidth), maxCols };
}
