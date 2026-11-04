# render-farm

A GitHub Actions render farm for Remotion video chunks. Each workflow run
renders frame ranges (chunks of at most 60 frames) of a composition on free
public-repository runners (4 vCPU / 16 GB) — one parallel job per chunk — and
returns every chunk as a downloadable artifact. It exists so a small local VM
never has to render a whole episode by itself.

The project snapshot in this repo is the "What if Spider-Man ended up in
Ancient Egypt?" short (composition `EgyptShort`, 1080×1920, 30 fps), driven by
`scripts/render-chunk.mjs` (env interface: `A`, `B`, `OUT`, `COMP`,
`BROWSER_EXE`, `GL`, `POSTJSON`, `CONC`).

## Run it

1. Open the repo's **Actions** tab → **render** → **Run workflow**.
2. Inputs:
   - `comp` — composition id (default `EgyptShort`).
   - `ranges` — comma-separated frame ranges, e.g. `0-59,60-119,120-179`.
     Each range becomes one job and one chunk; max 60 frames per range,
     max-parallel is 10 jobs.
   - `postjson` — inputProps JSON for the composition
     (default `{"post":{"dpr":0.5,"msaa":0}}`).
3. Each job installs Chrome, runs `npm ci`, renders its range with a
   25-minute guard, then **verifies the chunk's frame count with ffprobe**
   (the job fails if the count doesn't match the range length) and uploads
   the chunk as an artifact named `chunk-<start>-<end>`.

## Collect the chunks

Pip downloads the `chunk-*` artifacts from the finished run (Actions → the
run → Artifacts), checks them against the episode's chunk list, and pushes
them to Google Drive. Assembly happens locally from the verified chunks.

## Notes

- **No secrets live in this repository** — no Drive credentials, no API keys,
  no tokens. Runners only render and upload artifacts to the run itself.
- Triggering runs is done from the GitHub web UI (the automation that manages
  this repo has no Actions dispatch tool).
- To render a different episode, replace the project snapshot (`src/`,
  `package.json`, `package-lock.json`) and pass its composition id as `comp`.
