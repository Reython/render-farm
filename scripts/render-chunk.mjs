// Chunk renderer for the render farm — Anakin-lineage interface, driven by env:
//   A, B          frame range (inclusive) to render, e.g. A=120 B=179
//   OUT           output mp4 path (default: out/chunks/p<AAAA>.mp4, A zero-padded to 4)
//   COMP          Remotion composition id (default: EgyptShort)
//   BROWSER_EXE   Chrome/Chromium executable (CI sets this to its own Chrome;
//                 locally it points at the VM's extracted Chrome)
//   GL            Chromium GL backend (default: swangle)
//   POSTJSON      JSON passed to the composition as inputProps, e.g. {"post":{"dpr":0.5,"msaa":0}}
//   CONC          Remotion render concurrency (default: 2; CI uses 4)
//   SCALE         optional renderMedia scale override
// usage: A=0 B=59 OUT=out/chunks/p0000.mp4 node scripts/render-chunk.mjs
import fs from "node:fs";
import path from "node:path";

if (process.env.REMOTION_TMP) {
  fs.mkdirSync(process.env.REMOTION_TMP, { recursive: true });
  process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP;
}

const { bundle } = await import("@remotion/bundler");
const { renderMedia, selectComposition } = await import("@remotion/renderer");

const A = Number(process.env.A ?? 0);
const B = Number(process.env.B ?? A);
if (!Number.isInteger(A) || !Number.isInteger(B) || B < A) {
  console.error(`invalid frame range A=${process.env.A} B=${process.env.B}`);
  process.exit(2);
}
const OUT = process.env.OUT || `out/chunks/p${String(A).padStart(4, "0")}.mp4`;
const COMP = process.env.COMP || "EgyptShort";
const CONC = Number(process.env.CONC || 2);
const browserExecutable = process.env.BROWSER_EXE || undefined;
const chromiumOptions = { gl: process.env.GL || "swangle" };
const inputProps = process.env.POSTJSON ? JSON.parse(process.env.POSTJSON) : undefined;

fs.mkdirSync(path.resolve("public"), { recursive: true });
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });

const serveUrl = await bundle({
  entryPoint: path.resolve("src/index.ts"),
  publicDir: path.resolve("public"),
});
const composition = await selectComposition({
  serveUrl,
  id: COMP,
  browserExecutable,
  chromiumOptions,
  inputProps,
});

const t0 = Date.now();
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: path.resolve(OUT),
  frameRange: [A, B],
  concurrency: CONC,
  browserExecutable,
  chromiumOptions,
  inputProps,
  timeoutInMilliseconds: 180000,
  ...(process.env.SCALE ? { scale: Number(process.env.SCALE) } : {}),
  onProgress: ({ progress }) => {
    console.log(`render ${A}-${B}: ${Math.round(progress * 100)}%`);
  },
});
console.log(`chunk done ${A}-${B} -> ${OUT} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
