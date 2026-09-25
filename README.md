# lumaflow-share

A full-screen grid of Lumaflow camera links, live at https://share.lumaflow.in.

The page reads `public/links.json` and lays the streams out as a grid sized to the
screen: it picks the column count that gives the biggest 16:9 tiles for the current
window, and re-flows when the window is resized. That covers phones, tablets,
foldables, portrait monitors and wide screens alike. The columns button in the
header overrides it with a fixed 1 to 4.

Feeds sit edge to edge and play muted with no player controls.

- Click a feed to enlarge it in the page. The wall gains a column so the other
  feeds shrink and flow around it. Click it again, or press Esc, to shrink it.
- Double click a feed (or use the button in its corner) to go straight to
  fullscreen. On a phone a single tap does this and turns the feed sideways.
- The header has a light, dark and system theme switch, and a fullscreen button
  for the whole wall.

## Adding or removing links

Edit [`public/links.json`](public/links.json) on GitHub and commit to `main`:

```json
[
  { "label": "Front gate", "url": "https://example.lumaflow.in/lens/site/front-gate" },
  "https://example.lumaflow.in/lens/site/2f1c9a1e-uuid"
]
```

Each entry is either a URL string or `{ "label", "url" }`. Only `http(s)` URLs are
shown, and duplicates are skipped.

The commit triggers the Pages workflow (about a minute). Open pages check for
changes every 30 seconds and whenever the tab comes back into focus, so new tiles
appear without a reload. Existing tiles keep playing when others are added or
removed. The site stays up during builds: Pages keeps serving the old version until
the new one is ready.

## Local development

```bash
npm install
npm run dev
```

Then open http://localhost:3000. `npm run build` writes the static site to `out/`.

To look at it from a phone on the same WiFi, serve the build on every interface
and open `http://<this computer's LAN IP>:4173/`:

```bash
python -m http.server 4173 --bind 0.0.0.0 --directory out
```

Dependencies and build output are pruned by
dev-prune when the repository is
idle (settings in `project.devprune.json`); `devp restore .` brings them back.

## Hosting

GitHub Pages via `.github/workflows/pages.yml`, with the custom domain in
`public/CNAME`. Each link must be a MediaMTX WebRTC page. The wall plays it
through that page's `whep` endpoint in its own video element (iframes stay
black in iPhone Safari), so the stream server must allow this site's origin
in CORS.
