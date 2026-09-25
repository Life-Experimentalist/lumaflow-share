"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { gridLayout, type Columns } from "@/lib/grid";
import MediaMTXWebRTCReader from "@/lib/mediamtx-reader";
import { usePref } from "@/lib/prefs";
import { useLinks, type Link } from "@/lib/use-links";

const MIN_TILE_WIDTH = 280;
const ASPECT = 16 / 9;
// How long a click waits to see if it becomes a double click.
const DOUBLE_CLICK_MS = 240;

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

// Each feed page on the stream server takes WebRTC through its "whep" endpoint.
function whepUrl(url: string) {
  return new URL("whep", url.endsWith("/") ? url : `${url}/`).href;
}

// iPhone Safari only autoplays video that is muted as a property, not just
// as a React prop, and inline rather than in its own fullscreen player.
function muteForAutoplay(video: HTMLVideoElement | null) {
  if (!video) return;
  video.defaultMuted = true;
  video.muted = true;
}

// iPhone has no element fullscreen, only the native player on a video.
type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

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

// Phones turn sideways for a fullscreen feed. Browsers that cannot lock
// (desktops, iOS) reject, which is fine.
function lockLandscape() {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  orientation?.lock?.("landscape").catch(() => {});
}

type TileProps = {
  link: Link;
  open: boolean;
  pseudo: boolean;
  // A tap goes straight to fullscreen, with no wait for a second click.
  direct: boolean;
  span: { start: number; size: number };
  onToggle: () => void;
  onFullscreen: (el: HTMLElement) => void;
  onBlocked: () => void;
};

function Tile({ link, open, pseudo, direct, span, onToggle, onFullscreen, onBlocked }: TileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const timer = useRef<number>(undefined);
  const [message, setMessage] = useState("Connecting");

  // Play the feed in our own video element, not the server's player page in
  // an iframe: iPhone Safari leaves a cross-origin WebRTC iframe black.
  useEffect(() => {
    const reader = new MediaMTXWebRTCReader({
      url: whepUrl(link.url),
      user: "",
      pass: "",
      token: "",
      onError: (err) =>
        setMessage(err.includes("not found") ? "Stream offline, retrying" : err.replace(/^Error: /, "")),
      onTrack: (event) => {
        const el = video.current;
        if (!el) return;
        el.srcObject = event.streams[0];
        setMessage("");
        el.play().catch((err) => err?.name === "NotAllowedError" && onBlocked());
      },
      onDataChannel: () => {},
    });
    return () => reader.close();
    // onBlocked only raises a page flag, so a stale copy is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.url]);

  // One click enlarges (or shrinks), two go straight to fullscreen.
  const onClick = (event: MouseEvent) => {
    window.clearTimeout(timer.current);
    const el = ref.current;
    if (!el) return;
    if (event.detail >= 2 || direct) {
      onFullscreen(el);
      return;
    }
    // In fullscreen a single click does nothing; a double click leaves.
    // The page-covering view has no other way out, so a tap closes it.
    if (document.fullscreenElement) return;
    if (pseudo) {
      onFullscreen(el);
      return;
    }
    timer.current = window.setTimeout(onToggle, DOUBLE_CLICK_MS);
  };

  const classes = ["tile", open && "is-open", pseudo && "is-pseudo"].filter(Boolean).join(" ");

  return (
    <div
      ref={ref}
      className={classes}
      data-url={link.url}
      style={open ? { gridColumn: `${span.start} / span ${span.size}`, gridRow: `span ${span.size}` } : undefined}
    >
      <video
        ref={(el) => {
          video.current = el;
          muteForAutoplay(el);
        }}
        title={link.name}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
      />
      {message && <p className="status">{message}</p>}
      <button
        type="button"
        className="hit"
        aria-label={open ? `Shrink ${link.name}` : `Enlarge ${link.name}`}
        title={open ? "Click to shrink, double click for fullscreen" : "Click to enlarge, double click for fullscreen"}
        onClick={onClick}
      />
      <div className="tools">
        <button
          type="button"
          className="tool"
          aria-label={`Show ${link.name} fullscreen`}
          title="Fullscreen"
          onClick={() => ref.current && onFullscreen(ref.current)}
        >
          <Icon>{icons.expand}</Icon>
        </button>
      </div>
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
      setSize({ width: el.clientWidth, height: window.innerHeight - header });
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

function ColumnsMenu({
  columns,
  autoCols,
  maxCols,
  onChange,
}: {
  columns: (typeof COLUMN_OPTIONS)[number];
  autoCols: number;
  maxCols: number;
  onChange: (option: (typeof COLUMN_OPTIONS)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-haspopup="true"
        title="Columns"
        onClick={() => setOpen(!open)}
      >
        <Icon>{icons.grid}</Icon>
        <span>{columns === "auto" ? "Auto" : columns}</span>
      </button>
      {open && (
        <div className="seg menu" role="group" aria-label="Columns">
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
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option === "auto" ? "Auto" : option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Wall() {
  const { links, status } = useLinks();
  const { ref, width, height } = useWallSize();
  const wallFullscreen = useWallFullscreen();
  const [columns, setColumns] = usePref("columns", "auto", COLUMN_OPTIONS);
  const [theme, setTheme] = usePref<Theme>("theme", "system", THEME_OPTIONS);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  // Feed shown fullscreen by covering the page, for browsers (iPhone) that
  // cannot put an element fullscreen.
  const [pseudoUrl, setPseudoUrl] = useState<string | null>(null);
  // The browser refused to autoplay (iPhone in Low Power Mode, for one).
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const count = links?.length ?? 0;
  const options = { minTileWidth: MIN_TILE_WIDTH, aspect: ASPECT };
  const { cols, tileWidth, maxCols } = gridLayout(
    count,
    width,
    height,
    (columns === "auto" ? "auto" : Number(columns)) as Columns,
    options,
  );
  const autoCols = gridLayout(count, width, height, "auto", options).cols;

  // Forget the enlarged feed if it drops out of links.json.
  const openLink = links?.some((link) => link.url === openUrl) ? openUrl : null;

  // An enlarged feed switches the wall to one more, narrower column, so the
  // other feeds get smaller. The big one spans all but one of those columns
  // and as many rows, capped at what fits on screen but always at least double.
  const enlarged = openLink !== null && cols >= 2;
  const gridCols = enlarged ? cols + 1 : cols;
  const cellWidth = enlarged ? Math.floor(width / gridCols) : tileWidth;
  const cellHeight = Math.floor(cellWidth / ASPECT);
  const rowsOnScreen = cellHeight > 0 ? Math.floor(height / cellHeight) : 1;
  const span = enlarged ? Math.max(2, Math.min(gridCols - 1, rowsOnScreen)) : 1;

  const toggle = (url: string) => {
    const next = openLink === url ? null : url;
    animateTiles(() => {
      flushSync(() => setOpenUrl(next));
      const tile = next
        ? document.querySelector<HTMLElement>(`.tile[data-url="${CSS.escape(next)}"]`)
        : null;
      // Bring it fully into view, or its top edge when it is taller than the screen.
      tile?.scrollIntoView({ block: tile.offsetHeight > height ? "start" : "nearest" });
    });
  };

  const fullscreen = (url: string, tile: HTMLElement) => {
    if (pseudoUrl) {
      setPseudoUrl(null);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    const video = tile.querySelector<IOSVideo>("video");
    if (!document.fullscreenEnabled && video?.webkitEnterFullscreen) {
      try {
        video.webkitEnterFullscreen();
        return;
      } catch {
        // Not playing yet: fall through to covering the page.
      }
    }
    if (document.fullscreenEnabled && tile.requestFullscreen) {
      // If the browser refuses, cover the page instead.
      tile.requestFullscreen().then(lockLandscape, () => setPseudoUrl(url));
    } else {
      setPseudoUrl(url);
    }
  };

  // Esc shrinks the enlarged feed or closes the page-covering one (the
  // browser keeps Esc for leaving real fullscreen).
  useEffect(() => {
    if (!openLink && !pseudoUrl) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement) return;
      if (pseudoUrl) setPseudoUrl(null);
      else animateTiles(() => flushSync(() => setOpenUrl(null)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openLink, pseudoUrl]);

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

        <ColumnsMenu columns={columns} autoCols={autoCols} maxCols={maxCols} onChange={setColumns} />

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
              gridTemplateColumns: `repeat(${gridCols}, ${cellWidth}px)`,
              gridAutoRows: `${cellHeight}px`,
              minHeight: Math.max(height, 0),
            }}
          >
            {links.map((link, i) => (
              <Tile
                key={link.url}
                link={link}
                open={enlarged && link.url === openLink}
                pseudo={link.url === pseudoUrl}
                // A single column is already full width, so a tap means fullscreen.
                direct={cols < 2}
                // Grow from the feed's own column, toward the middle, so it
                // stays on the side of the wall it was clicked on.
                span={{ start: Math.min(i % cols, gridCols - span) + 1, size: span }}
                onToggle={() => toggle(link.url)}
                onFullscreen={(el) => fullscreen(link.url, el)}
                onBlocked={() => setBlocked(true)}
              />
            ))}
          </div>
        )}
        {blocked && (
          <button
            type="button"
            className="unblock"
            onClick={() => {
              // Play every feed inside this one tap, while the browser allows it.
              document.querySelectorAll("video").forEach((el) => el.play().catch(() => {}));
              setBlocked(false);
            }}
          >
            Tap to play
          </button>
        )}
      </main>
    </>
  );
}
