# ritvik-lumaflow

A full-screen grid of Lumaflow camera links, live at https://share.lumaflow.in.

The page reads `public/links.json` and lays the streams out as a grid sized to the
screen: it picks the column count that gives the biggest 16:9 tiles for the current
window, and re-flows when the window is resized.

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

## Hosting

GitHub Pages via `.github/workflows/pages.yml`, with the custom domain in
`public/CNAME`. The linked pages must allow being embedded in an iframe.
