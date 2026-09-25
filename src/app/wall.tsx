"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { gridLayout, type Columns } from "@/lib/grid";
import { usePref } from "@/lib/prefs";
import { useLinks, type Link } from "@/lib/use-links";

const GAP = 12;
const PAD = 12;
const MIN_TILE_WIDTH = 300;
const ASPECT = 16 / 9;

const ALLOW =
  "autoplay; fullscreen; camera; microphone; display-capture; encrypted-media; picture-in-picture";

const COLUMN_OPTIONS = ["auto", "1", "2", "3", "4"] as const;
const THEME_OPTIONS = ["system", "light", "dark"] as const;
type Theme = (typeof THEME_OPTIONS)[number];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const icons = {
  expand: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  collapse: <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />,
  enlarge: <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />,
  shrink: <path d="M13.5 2.5 9 7m0-4v4h4M2.5 13.5 7 9m0 4V9H3" />,
  grid: <path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" />,
  system: <path d="M2 3h12v8H2zM6 14h4M8 11v3" />,
  light: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
    </>
  ),
  dark: <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />,
};

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--ground)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="3" fill="var(--accent)" />
    </svg>
  );
}

// Animates tiles from their old spots to their new ones when one is enlarged
// or shrunk. Falls back to an instant change where view transitions are missing.
function animateTiles(update: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced) {
    update();
    return;
  }
  const tiles = [...document.querySelectorAll<HTMLElement>(".tile")];
  tiles.forEach((tile, i) => (tile.style.viewTransitionName = `tile-${i}`));
  const transition = document.startViewTransition(update);
  transition.finished.finally(() => tiles.forEach((tile) => (tile.style.viewTransitionName = "")));
}

function toggleFullscreen(el: HTMLElement | null) {
  if (document.fullscreenElement) document.exitFullscreen();
  else el?.requestFullscreen?.();
}

type TileProps = {
  link: Link;
  open: boolean;
  span: { start: number; size: number };
  onToggle: () => void;
};

function Tile({ link, open, span, onToggle }: TileProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={open ? "tile is-open" : "tile"}
      data-url={link.url}
      style={open ? { gridColumn: `${span.start} / span ${span.size}`, gridRow: `span ${span.size}` } : undefined}
    >
      {/* Small feeds are previews: the player only takes input once enlarged. */}
      <iframe src={link.url} title={link.name} allow={ALLOW} allowFullScreen inert={!open} />
      {open ? (
        <div className="tools">
          {/* Only rendered after a click, so reading document here is safe. */}
          {document.fullscreenEnabled && (
            <button
              type="button"
              className="tool"
              aria-label={`Show ${link.name} fullscreen`}
              title="Fullscreen"
              onClick={() => toggleFullscreen(ref.current)}
            >
              <Icon>{icons.expand}</Icon>
            </button>
          )}
          <button
            type="button"
            className="tool shrink"
            aria-label={`Shrink ${link.name}`}
            title="Shrink (Esc)"
            onClick={onToggle}
          >
            <Icon>{icons.shrink}</Icon>
          </button>
        </div>
      ) : (
        <button type="button" className="hit" aria-label={`Enlarge ${link.name}`} onClick={onToggle}>
          <span className="hint">
            <Icon>{icons.enlarge}</Icon>
          </span>
        </button>
      )}
      <span className="tag" title={link.name}>
        {link.name}
      </span>
    </div>
  );
}

// Width of the wall and the viewport height left under the header.
function useWallSize() {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const header = document.querySelector(".bar")?.getBoundingClientRect().height ?? 0;
      setSize({
        width: el.clientWidth - PAD * 2,
        height: window.innerHeight - header - PAD * 2,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { ref, ...size };
}

function useWallFullscreen() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement === document.documentElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return { active, toggle: () => toggleFullscreen(document.documentElement) };
}

export default function Wall() {
  const { links, status } = useLinks();
  const { ref, width, height } = useWallSize();
  const wallFullscreen = useWallFullscreen();
  const [columns, setColumns] = usePref("columns", "auto", COLUMN_OPTIONS);
  const [theme, setTheme] = usePref<Theme>("theme", "system", THEME_OPTIONS);
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const count = links?.length ?? 0;
  const { cols, tileWidth, maxCols } = gridLayout(
    count,
    width,
    height,
    (columns === "auto" ? "auto" : Number(columns)) as Columns,
    { gap: GAP, minTileWidth: MIN_TILE_WIDTH, aspect: ASPECT },
  );
  const tileHeight = Math.floor(tileWidth / ASPECT);
  const autoCols = gridLayout(count, width, height, "auto", {
    gap: GAP,
    minTileWidth: MIN_TILE_WIDTH,
    aspect: ASPECT,
  }).cols;

  // An enlarged feed spans all but one column (the whole row when there are
  // two) and as many rows, so it keeps 16:9 and the others flow around it.
  // A single column is already full width, so there it just becomes live.
  const span = cols >= 2 ? Math.max(2, cols - 1) : 1;

  // Forget the enlarged feed if it drops out of links.json.
  const openLink = links?.some((link) => link.url === openUrl) ? openUrl : null;

  const toggle = (url: string) => {
    const next = openLink === url ? null : url;
    animateTiles(() => {
      flushSync(() => setOpenUrl(next));
      if (next) {
        document
          .querySelector(`.tile[data-url="${CSS.escape(next)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }
    });
  };

  // Esc shrinks the enlarged feed (the browser keeps Esc for leaving fullscreen).
  useEffect(() => {
    if (!openLink) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        animateTiles(() => flushSync(() => setOpenUrl(null)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openLink]);

  return (
    <>
      <header className="bar">
        <div className="brand">
          <Logo />
          <span className="word">Lumaflow</span>
        </div>
        <div className="meta">
          {links && (
            <span>
              {count} {count === 1 ? "stream" : "streams"}
            </span>
          )}
          {status === "offline" && (
            <>
              <span className="sep" />
              <span className="offline">Connection lost, retrying</span>
            </>
          )}
        </div>
        <div className="spacer" />

        <div className="seg cols" role="group" aria-label="Columns">
          <span className="lead" title="Columns">
            <Icon>{icons.grid}</Icon>
          </span>
          {COLUMN_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={columns === option}
              disabled={option !== "auto" && Number(option) > maxCols}
              title={
                option === "auto"
                  ? `Automatic (${autoCols} ${autoCols === 1 ? "column" : "columns"} on this screen)`
                  : `${option} ${option === "1" ? "column" : "columns"}`
              }
              onClick={() => setColumns(option)}
            >
              {option === "auto" ? "Auto" : option}
            </button>
          ))}
        </div>

        <div className="seg" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={theme === option}
              aria-label={`${option[0].toUpperCase()}${option.slice(1)} theme`}
              title={option === "system" ? "Match system" : option === "light" ? "Light" : "Dark"}
              onClick={() => setTheme(option)}
            >
              <Icon>{icons[option]}</Icon>
            </button>
          ))}
        </div>

        <button
          className="btn"
          type="button"
          onClick={wallFullscreen.toggle}
          title={wallFullscreen.active ? "Exit fullscreen" : "Fullscreen"}
          aria-label={wallFullscreen.active ? "Exit fullscreen" : "Fullscreen"}
        >
          <Icon>{wallFullscreen.active ? icons.collapse : icons.expand}</Icon>
          <span className="label">{wallFullscreen.active ? "Exit fullscreen" : "Fullscreen"}</span>
        </button>
      </header>

      <main className="wall" ref={ref}>
        {!links ? (
          <div className="notice">
            <p>Loading streams</p>
          </div>
        ) : count === 0 ? (
          <div className="notice">
            <h1>No streams right now</h1>
            <p>Streams show up here as soon as they are added.</p>
          </div>
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${tileWidth}px)`,
              gridAutoRows: `${tileHeight}px`,
              minHeight: Math.max(height, 0),
            }}
          >
            {links.map((link, i) => (
              <Tile
                key={link.url}
                link={link}
                open={link.url === openLink}
                // Grow from the feed's own column, toward the middle, so it
                // stays on the side of the wall it was clicked on.
                span={{ start: Math.min(i % cols, cols - span) + 1, size: span }}
                onToggle={() => toggle(link.url)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
