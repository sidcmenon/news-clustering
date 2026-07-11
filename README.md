# News Clustering

An interactive visualization of how news stories develop across outlets over time.
Articles from ~15 RSS feeds are embedded with a sentence-transformer, projected to
2D with UMAP, and grouped into **story threads** by semantic similarity. A scrubbable
timeline lets you watch stories break, accelerate, and spread across outlets — and
inspect how differently each outlet frames the same story.

## How it works

The project has two halves: a **Python data pipeline** that turns raw RSS into
snapshot files, and a **React/Three.js frontend** that renders them.

### Pipeline (`pipeline/`)

Each stage reads from and writes to a local SQLite database (`news_drift.db`):

| Stage | File | What it does |
|-------|------|--------------|
| Ingest | `ingest.py` | Polls ~15 RSS feeds, stores new articles |
| Embed | `embedder.py` | Encodes `title + summary` with `BAAI/bge-base-en-v1.5` (768-dim, normalized) |
| Project | `projector.py` | Fits/loads a UMAP model, maps embeddings → 2D `(x, y)` |
| Thread | `story_thread.py` | Links articles into stories by cosine similarity + time proximity (single-linkage graph clustering) |
| Score | `scorer.py` | Flags each thread as `breaking` / `accelerating` / `fading` / `stable` from its hourly history |
| Diverge | `divergence.py` | Measures how far each outlet's framing sits from the thread's centroid (cross-outlet cosine distance) |
| Label | `labeler.py` | Generates a short label per thread via TF-IDF over its articles |
| Export | `exporter.py` | Writes per-timestamp `snapshot_*.json` + `threads_*.json` and updates `index.json` |

Output lands in `public/data/`, which the frontend fetches at runtime.

### Frontend (`src/`)

- **`Map.tsx` + `lib/`** — a Three.js scene renders each article as a point at its
  UMAP coordinates, colored by thread. The camera auto-frames the data on load.
- **`ThreadLabel.tsx`** — overlays clickable labels for the most significant threads,
  with collision-avoidance so they stay readable.
- **`DivergencePanel.tsx`** — on selecting a thread, shows a radial "source framing
  divergence" chart (each outlet placed by how far its framing diverges) plus the
  articles.
- **`Scrubber.tsx`** — a timeline to scrub or play through snapshots and watch the
  map evolve over time.

## Getting started

### Prerequisites

- **Node.js 18+** (for the Vite frontend)
- **Python 3.10+** (for the pipeline)

### 1. Run the frontend

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). The app loads whatever
snapshots exist in `public/data/` — the repo ships with a generated set, so it
works out of the box.

Other scripts:

```bash
npm run build     # production build to dist/
npm run preview   # serve the production build
```

### 2. Run the pipeline (optional — to generate fresh data)

```bash
cd pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python3 pipeline.py            # ingest → embed → project → thread → score → export
python3 pipeline.py --refit    # force a full UMAP refit on all embeddings
python3 pipeline.py --dry-run  # run every stage but skip writing to public/data/
```

The first run downloads the `BAAI/bge-base-en-v1.5` model (~440 MB).

### 3. Build a time series for playback

`pipeline.py` writes **one** snapshot per run. To populate a scrubbable timeline
without waiting hours between runs, `backfill.py` replays the existing database
hour-by-hour using each article's real `published_at`, reconstructing what every
hourly snapshot would have looked like (clusters, velocity flags, divergence, and
labels are all recomputed "as of" that hour, with thread IDs kept stable so a story
keeps its identity as it grows):

```bash
cd pipeline
python3 backfill.py --hours 36        # generate 36 hourly snapshots ending at the latest article
python3 backfill.py --retention 72    # how far back each snapshot looks (default 72h)
python3 backfill.py --min-articles 3  # skip hours with fewer than N articles
```

This is read-only with respect to the database — it only writes JSON into
`public/data/`. Reload the frontend and press ▶ to watch the stories develop.

## Project structure

```
news-drift/
├── index.html              # Vite entry
├── src/                    # React + Three.js frontend
│   ├── App.tsx             # snapshot loading, timeline playback
│   ├── components/         # Map, ThreadLabel, DivergencePanel, Scrubber
│   └── lib/                # Three.js scene, particles, bonds, layout, data fetch
├── public/data/            # generated snapshots (served at runtime)
│   ├── index.json          # list of snapshot timestamps (oldest-first) + latest
│   └── snapshots/          # snapshot_<ts>.json (articles) + threads_<ts>.json
├── pipeline/               # Python data pipeline
│   ├── pipeline.py         # main entry point (one snapshot per run)
│   ├── backfill.py         # replay history into an hourly time series
│   ├── ingest / embedder / projector / story_thread / scorer / divergence / labeler / exporter
│   ├── news_drift.db       # SQLite store (articles + thread history)
│   └── requirements.txt
└── .github/workflows/      # placeholder workflows for scheduled runs (not yet configured)
```

## Configuration

A few things worth knowing if you fork this:

- **Feeds** — edit `FEEDS` in `pipeline/ingest.py`.
- **Clustering** — `SIM_THRESHOLD` (0.65) and `MAX_GAP_HOURS` (36) in
  `pipeline/story_thread.py` control how aggressively articles merge into stories.
  Lowering the threshold below ~0.62 causes single-linkage chaining that collapses
  unrelated stories together.
- **Snapshot ordering** — `index.json` lists snapshots oldest-first; `latest` is the
  newest. The frontend plays forward through this order.

## Tech stack

React 18 · TypeScript · Vite · Three.js · Python · sentence-transformers
(`BAAI/bge-base-en-v1.5`) · umap-learn · scikit-learn · SciPy · SQLite
