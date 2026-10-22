# AGENTS.md — frontends/frontend_web notes (untracked, do not publish)

Moved verbatim from frontends/frontend_web/README.md.

---

# bakajiten-web — browser frontend (Vue 3 + Vite + shadcn-vue)

Dictionary + handwriting search over the same Rust WASM backend as
everything else (`bindings/typescript`, UniFFI). Single-page app:
search with IME-style kana input, results + ruby article pane,
kanji hover cards and information dialog, floating recognizer
panel, settings — built on the official shadcn-vue components
(`npx shadcn-vue add`, reka-ui based, under `src/components/ui/`
with `components.json` + `@/` alias; `cn` from the `cn` package).
Theme tokens live in `src/assets/css/main.css` — dark background
#2C2C2C, orange primary. The persisted theme drives
dark mode through the `.dark` class).
Shared icons come from the Qt frontend
(`frontends/qt/resources/icons/`, `currentColor` SVGs via
`src/components/AppIcon.vue`).
The results list holds the full index hit list and virtualizes
rows (`searchIndices` + per-row `entryAt`, measured uniform row
height, spacer rows), so any result count scrolls with a bounded
DOM. Desktop lays each row on a CSS grid (heading | reading |
meaning — headword/reading widths resize by header drag and
persist via VueUse `useLocalStorage` (`bakajiten-web-columns`));
narrow screens stack the headline (heading + reading,
Android-style) over the senses line. The meaning column shows the
desktop runs (numbered senses with pos tags and the query-match
span), clipped without ellipsis to keep row geometry uniform.

## Run

```sh
pnpm install
pnpm dev      # app shell only; data downloads from the data-repo release
```

## Data: consent, gzip, IndexedDB

The app never downloads blobs uninvited. On launch it fetches only
`manifest.json` from its data base (the Pages deploy bundles the
data release into `public/data/`, baked in as `VITE_DATA_BASE`;
overridable per session with `?data=<base-url>`) and checks the
IndexedDB cache (`bakajiten-data` store); when files are missing
or the manifest changed, it shows a consent screen (one-tap bulk
download plus the same Dictionaries manager used under Settings,
so per-file status and actions match; Names/Kokugo download on
demand there — the scope dropdown greys out files not yet
downloaded) and downloads on confirmation.
All fetches go direct, same-origin — the old CORS proxy is gone
(data releases re-trigger the Pages deploy, so hosted artifacts
track the latest release). Offline with a warm cache loads from
the cache without touching the network. Blobs ship as `*.bin.gz`
straight from the release and decode client-side
via `DecompressionStream` — with a magic sniff, so hosts that
transcode `.gz` (`Content-Encoding: gzip`) and hosts that serve
bytes both work. Values chunk at 8 MB (Chromium caps one record
around ~127 MB). Fresh downloads verify size, then sha256 when the
manifest publishes one; a bad file is evicted and the load throws,
so retry re-downloads it clean (other cached files are kept).
Settings shows cache usage with a Clear button, plus a
Dictionaries list (Required then Optional sections, Android-style
title-subtitle rows) listing every file up front: title plus
status/saved/latest lines fill in asynchronously once the catalog
check resolves, and each row carries an always-present action —
Download when missing, Update when stale, Up to date when current,
Delete for cached optional files, per-file progress while working.
Nothing is vendored:
no local data tree is needed to run the app (tests serve a fixture
tree explicitly).

Serving a local tree (dev/debugging): run
`BAKAJITEN_DATA_BASE=<release-url> pnpm fetch-data` to fill
`public/data/`, then open the dev server with `?data=/data`
(same-origin base, fetched direct).

Production: `pnpm build` (typecheck, then bundle) and serve `dist/`
over HTTP —
`file://` won't load the WASM. The build precaches an offline app
shell (service worker over the hashed js/css/html/wasm): after one
online visit the UI loads with no network and dictionaries come
from the IndexedDB cache (see the offline e2e). The update prompt
waits for the new worker to activate before reloading, so the
refresh lands on the new bundle.

`pnpm sync-bindings` (also predev/prebuild) regenerates the
TypeScript + WASM bindings into `src/vendor/` with `@ts-nocheck`
via `uniffi-bindgen-js` (needs the freshly built
`target/wasm32-unknown-unknown/release/*.wasm` from the Rust
workspace); nothing outside `src/vendor/` imports generated code.

## Tests (vitest)

```sh
pnpm test   # unit (labels, kana traces, backend) + headless-Chromium e2e
```

Unit tests run in node against the real WASM backend (`tests/setup.ts`
serves `../data` once per run). The e2e suite builds nothing itself —
run `pnpm build` first — then drives `vite preview` with a
Chromium headless shell (`pnpm dlx playwright install chromium
--only-shell`, or `CHROME_SHELL=`); it skips when no shell is
found: load, consent + download, cache-reuse-on-reload, search,
result virtualization, kana typing, kanji dialog, drawn stroke, and a
no-JS-errors gate.
