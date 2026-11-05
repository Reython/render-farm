// Timeline of "What if Spider-Man ended up in Ancient Egypt?": 15 narration beats -> 15 shots (v2 80 s cut).
// All timing derives from the BEAT table (seconds), so locking the picture to the recorded voice is a
// one-table edit. Story events (fall, palm bend, obelisk swing, rope snap, block slide, small-block catch)
// are pure functions of story time t (seconds) exported for cast.ts (cards) and world.ts (props + webs).

export const FPS = 30;
export const SITE = {
  pyramid: { x: -38, z: -52, base: 96, h: 52, courses: 12 },
  ramp: { topZ: -16, topY: 30, botZ: 14, botY: 0, x: -38, w: 17 },
  sphinx: { x: 14, z: -46 },
  temple: { x: 52, z: -18 },
  obelisks: [{ x: 30, z: 2 }, { x: 44, z: 2 }],
  dais: { x: 19, z: -4 },
  heroPalm: { x: -6, z: 6 },
};

export type V3 = [number, number, number];
export const D0 = 0; // ground level (the bridge template's bank height; Egypt is flat)

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const easeIn = (u: number) => clamp01(u) ** 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ---------------- beats (provisional durations; locked to the voice at the sound pass) ----------------
export const BEAT_DUR = [6.128, 5.977, 5.698, 5.478, 3.982, 5.941, 6.199, 6.593, 4.555, 6.633, 5.611, 4.642, 5.348, 3.858, 1.691]; // v2 80 s cut: locked to the re-recorded voice (line + 0.4 s each)
export const BEAT_T: number[] = [];
{ let s = 0; for (const d of BEAT_DUR) { BEAT_T.push(s); s += d; } }
export const TOTAL_S = BEAT_T[14] + BEAT_DUR[14] + 1.2; // + tail hold
export const TOTAL = Math.round(TOTAL_S * FPS);

// event times (seconds), anchored to beats
export const T_LAND = 2.1;
export const T_PALM_FIRE = BEAT_T[4] + 1.41;        // web hits the palm (beat 5, at "Just palm trees")
export const T_PALM_DUMP = BEAT_T[4] + 3.35;        // palm has bent him to the ground (at "bend")
export const T_SWING0 = BEAT_T[5] + 1.5;            // obelisk swing window (at "It works exactly once")
export const T_SWING1 = BEAT_T[5] + 4.9;
export const T_SNAP = BEAT_T[7] + 4.6;              // the rope parts (beat 8, as the block starts sliding)
export const T_CATCH = BEAT_T[8] + 2.1;             // webs hit the block (beat 9, at "fires both webs")
export const T_STOP = T_CATCH + 2.4;                // block fully stopped
export const T_WOBBLE = BEAT_T[12] + 3.4;           // the small stone wobbles (beat 13, at "official catcher")
export const T_SMALLCATCH = T_WOBBLE + 1.1;

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: string };
const shot = (id: number, beatFrom: number, beatTo: number, light: Light, crowd = "none"): ShotDef => ({
  id, a: Math.round(BEAT_T[beatFrom] * FPS), b: Math.round((BEAT_T[beatTo] + BEAT_DUR[beatTo]) * FPS), light, crowd,
});
export const SHOTS: ShotDef[] = [
  shot(1, 0, 0, "golden"),        // hook: the fall
  shot(2, 1, 1, "day"),           // aerial setting
  shot(3, 2, 2, "day"),           // ramp crews + the pharaoh
  shot(4, 3, 3, "day"),           // he looks for something tall
  shot(5, 4, 4, "day"),           // palm trees bend
  shot(6, 5, 5, "day"),           // the obelisk works exactly once
  shot(7, 6, 6, "day"),           // the word is god
  shot(8, 7, 8, "day"),           // rope snap + the catch
  { id: 9, a: Math.round(BEAT_T[9] * FPS), b: Math.round((BEAT_T[9] + 2.12) * FPS), light: "day", crowd: "none" }, // luckily: the pharaoh claps
  { id: 10, a: Math.round((BEAT_T[9] + 2.12) * FPS), b: Math.round((BEAT_T[9] + BEAT_DUR[9]) * FPS), light: "day", crowd: "none" }, // unluckily: a god's welcome
  shot(11, 10, 10, "golden"),     // the fact: platform -> 3 hard pyramid cuts (v2; v1's crane glide removed)
  shot(12, 11, 11, "golden"),     // the sand sketch (analogy)
  shot(13, 12, 12, "day"),        // official catcher of falling stones
  shot(14, 13, 13, "day"),        // a second sphinx
  { id: 15, a: Math.round(BEAT_T[14] * FPS), b: TOTAL, light: "day", crowd: "none" }, // eight legs
];
export const XFADE: Record<number, number> = { 11: 8, 13: 8 };
export const FLASH_AT = SHOTS[0].b;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- story state (pure functions of t) ----------------
export type EgyptState = {
  blockU: number;      // 0..1 along the slide path (0 = parked, 1 = fully stopped position)
  blockShake: number;  // grinding shake amplitude
  palmBend: number;    // 0..1 hero palm bend
  snapped: boolean;    // rope has parted
  smallWob: number;    // small block wobble angle (deg)
  smallCaught: boolean;
};
export const rampY = (z: number) => Math.max(0, (14 - z)); // ramp surface height at z (slope 30 m over 30 m)
export const BLOCK_Z0 = -4, BLOCK_Z1 = 8.6;
export const blockZ = (u: number) => lerp(BLOCK_Z0, BLOCK_Z1, u);
export const blockPos = (u: number): V3 => [SITE.ramp.x, rampY(blockZ(u)) + 0.1, blockZ(u)];

export const egyptState = (t: number): EgyptState => {
  // block slide: parked until the snap; free acceleration, then the webs bite and it grinds to a stop
  let blockU = 0, blockShake = 0;
  if (t > T_SNAP) {
    const ts = t - T_SNAP, tc = T_CATCH - T_SNAP, tt = T_STOP - T_SNAP;
    if (t < T_CATCH) blockU = 0.34 * (ts / tc) ** 2;
    else if (t < T_STOP) { const k = (t - T_CATCH) / (tt - tc); blockU = 0.34 + 0.62 * (1 - (1 - k) ** 2.2); }
    else blockU = 0.96;
    if (t > T_SNAP + 0.15 && t < T_STOP + 0.4) blockShake = Math.min(1, (t - T_SNAP) / 0.4) * (t > T_STOP - 0.3 ? Math.max(0, 1 - (t - T_STOP) / 0.4) : 1);
  }
  // palm bend: fired at T_PALM_FIRE, bends over ~1.6 s, dumps him, springs back slowly after the shot
  let palmBend = 0;
  if (t > T_PALM_FIRE) {
    const k = (t - T_PALM_FIRE) / 1.7;
    palmBend = k < 1 ? easeOut(k) : Math.max(0.25, 1 - (t - T_PALM_DUMP) * 0.1);
  }
  const smallWob = t > T_WOBBLE && !smallCaughtAt(t) ? Math.sin((t - T_WOBBLE) * 9) * 6 * Math.min(1, (t - T_WOBBLE) / 0.5) : 0;
  return { blockU, blockShake, palmBend, snapped: t >= T_SNAP, smallWob: smallWob, smallCaught: smallCaughtAt(t) };
};
const smallCaughtAt = (t: number) => t >= T_SMALLCATCH;

/** spidey's anchor points for webs, per story phase (world draws the lines; cast places the card) */
export const SPIDEY_HOME: V3 = [-20, 0, 2];
/** the hero palm's crown (where the fronds attach) at time t: build.ts setBend() puts the crown at the
 *  end of its quadratic trunk curve, and world.ts drives it with bend = 0.05 + palmBend * 0.95. The web
 *  anchors HERE, on the moving crown — not on a fixed point the bending trunk leaves behind. */
export const palmCrown = (t: number): V3 => {
  const b = 0.05 + egyptState(t).palmBend * 0.95, h = 9;
  return [SITE.heroPalm.x - b * h * 0.55, h * (1 - b * 0.28), SITE.heroPalm.z];
};
export const swingPalm = (t: number) => {
  // pendulum from the moving crown: he swings in as the palm bends and is lowered to the ground
  // (the crown's descent plus a shortening line set his feet down at the dump instead of under it)
  const st = egyptState(t);
  const a0 = palmCrown(t);
  const u = clamp01((t - T_PALM_FIRE) / 1.9);
  const th = -0.95 + 1.35 * smooth(u); // swing angle from vertical
  const L = 6.4 - 1.55 * smooth(u);
  const hand: V3 = [a0[0] + Math.sin(th) * L, a0[1] - Math.cos(th) * L, a0[2]];
  return { hand, th, bend: st.palmBend };
};
export const OBELISK_A: V3 = [SITE.obelisks[0].x, 21.1, SITE.obelisks[0].z]; // the pyramidion TIP (was 20.4: inside the cone)
export const swingObelisk = (t: number) => {
  const u = clamp01((t - T_SWING0) / (T_SWING1 - T_SWING0));
  const th = -0.62 * Math.cos(u * Math.PI * 1.9) * (1 - u * 0.25); // one big arc, decaying
  const L = 12.5, a0 = OBELISK_A;
  const hand: V3 = [a0[0] + Math.sin(th) * L, a0[1] - Math.cos(th) * L, a0[2]];
  return { hand, th };
};
/** after the obelisk swing he pays out line and drops to the landing spot (cast places the card by this hand) */
export const descentHand = (t: number): V3 => {
  const hs = swingObelisk(T_SWING1).hand;
  const k = clamp01((t - T_SWING1) / 0.4);
  return [lerp(hs[0], 24.2, k), lerp(hs[1], 2.0, easeIn(k)), lerp(hs[2], 2.6, k)];
};
/** during the catch: spidey is dragged from his firing spot toward the ramp as the block decelerates */
export const dragPos = (t: number): V3 => {
  if (t < T_CATCH) return [-26.5, 0, 7.5];
  const k = smooth((t - T_CATCH) / (T_STOP - T_CATCH));
  return [lerp(-26.5, -27.3, k), 0, lerp(7.5, 6.4, k)];
};
/** the two catch-web ends ON the great block's front face (granite spans group y 0.8..3.9, front z +1.65;
 *  seat the caps just proud of the face, never buried inside the block volume) */
export const blockWebEnds = (t: number): [V3, V3] => {
  const bp = blockPos(egyptState(t).blockU);
  return [[bp[0] - 1.2, bp[1] + 3.1, bp[2] + 1.68], [bp[0] + 1.3, bp[1] + 2.8, bp[2] + 1.68]];
};
/** the small-catch web end ON the small block's top face (box is 1.5 tall, centred on SMALL_BLOCK) */
export const smallWebEnd = (): V3 => [SMALL_BLOCK[0] + 0.3, SMALL_BLOCK[1] + 0.76, SMALL_BLOCK[2]];
/** when each shot's webs fire; world.ts grows the line out of the hero's hand over ~0.13 s */
export const WEB_FIRE: Record<number, number> = { 5: T_PALM_FIRE, 6: T_SWING0 - 0.12, 8: T_CATCH - 0.05, 13: T_SMALLCATCH - 0.05 };
export const webGrowth = (id: number, t: number) => (WEB_FIRE[id] === undefined ? 1 : clamp01((t - WEB_FIRE[id]) / 0.13));
/** web segments to draw this frame: [from, to] pairs in world space. Hero-side ends are NOMINAL here —
 *  world.ts replaces them with the hero's drawn hand positions, so a web always starts at the hand. */
export const webSegs = (id: number, t: number): { a: V3; b: V3 }[] => {
  const out: { a: V3; b: V3 }[] = [];
  const st = egyptState(t);
  if (id === 5 && t >= T_PALM_FIRE && t < T_PALM_DUMP) {
    const { hand } = swingPalm(t);
    out.push({ a: palmCrown(t), b: hand });
  }
  if (id === 6 && t > T_SWING0 - 0.12 && t < T_SWING1 + 0.22) {
    const hand = t <= T_SWING1 ? swingObelisk(t).hand : descentHand(t);
    out.push({ a: OBELISK_A, b: hand });
  }
  if (id === 8 && t >= T_CATCH - 0.05 && t < T_STOP) {
    const d = dragPos(t), [e1, e2] = blockWebEnds(t);
    out.push({ a: [d[0] + 0.35, 2.45, d[2] - 0.3], b: e1 });
    out.push({ a: [d[0] - 0.1, 2.3, d[2] + 0.25], b: e2 });
  }
  if (id === 13 && t >= T_SMALLCATCH - 0.05) {
    out.push({ a: [-23.4, 1.9, 8.6], b: smallWebEnd() });
  }
  return out;
};
export const SMALL_BLOCK: V3 = [SITE.ramp.x + 3.5, rampY(-1) + 3.4, -1];

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
/** drift: a slow linear travel between two framings across the whole shot (for glides/cranes) */
const drift = (a: Shot, b: Shot, f: number, f0: number, f1: number): Shot => {
  const k = glide((f - f0) / Math.max(1, f1 - f0));
  const A = full(a), B = full(b);
  return mix(A, B, k);
};
const S = (id: number) => SHOTS[id - 1];

// v2 (PLAN_V2): every sub-shot is a HARD CUT on a narration phrase boundary or a story
// anchor; each framing is static + a punch-in at its start (pushK punch, creep <= 0.0008).
// No non-cut mixes remain (v1's glides swept blank walls — BUGS_V2 B5). Only the shot-2
// aerial inserts keep small drifts, each inside its own sub-shot window.
const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: (f) => dolly([2, 10, 26], [-26, 16, -12], pushK(f, 0, 0.0006, 0.028, 14), { fov: 46 }) },
    { f: 67, cut: true, s: (f) => dolly([-11, 3.2, 15], [-20, 2.4, 2], pushK(f, 67, 0.0006, 0.016, 12), { fov: 42 }) },
    { f: 108, cut: true, s: (f) => dolly([-5, 4.2, 18], [-22.5, 1.2, 4.5], pushK(f, 108, 0.0005, 0.012, 12), { fov: 44 }) },
  ],
  2: [
    { f: S(2).a, s: (f) => drift({ pos: [124, 64, 96], look: [-8, 0, -22], fov: 46 }, { pos: [112, 58, 104], look: [-4, 0, -18], fov: 45 }, f, S(2).a, 212) },
    { f: 212, cut: true, s: (f) => drift({ pos: [54, 22, 128], look: [-16, 0, 26], fov: 44 }, { pos: [46, 19, 122], look: [-12, 0, 22], fov: 44 }, f, 261, 296) },
    { f: 256, cut: true, s: (f) => drift({ pos: [26, 30, 44], look: [-38, 14, -12], fov: 44 }, { pos: [20, 27, 40], look: [-38, 15, -10], fov: 43 }, f, 296, 335) },
    { f: 290, cut: true, s: (f) => drift({ pos: [36, 8, -16], look: [14, 5, -46], fov: 42 }, { pos: [33, 7, -15], look: [14, 5, -46], fov: 42 }, f, 290, S(2).b) },
  ],
  3: [
    { f: S(3).a, s: (f) => dolly([-2, 4, 24], [-34, 9, -4], pushK(f, S(3).a, 0.0006, 0.014, 12), { fov: 44 }) },
    { f: 415, cut: true, s: (f) => dolly([28, 2.7, 9], [19, 2.3, -4], pushK(f, 415, 0.0006, 0.014, 12), { fov: 40 }) },
    { f: 463, cut: true, s: (f) => dolly([-24, 16, 10], [-38, 19, -4], pushK(f, 463, 0.0005, 0.012, 12), { fov: 40 }) },
  ],
  4: [
    { f: S(4).a, s: (f) => dolly([-12.5, 2.5, 10.5], [-20, 2.7, 2], pushK(f, S(4).a, 0.0006, 0.014, 12), { fov: 38 }) },
    { f: 605, cut: true, s: (f) => dolly([-15.5, 2.6, 7.5], [-20, 2.5, 2], pushK(f, 605, 0.0005, 0.012, 10), { fov: 34 }) },
    { f: 634, cut: true, s: (f) => dolly([1, 2.6, 16.5], [-12.5, 4.6, 3.5], pushK(f, 634, 0.0006, 0.014, 12), { fov: 46 }) },
    { f: 662, cut: true, s: (f) => dolly([-1, 4, 12], [-6, 8.5, 6], pushK(f, 662, 0.0004, 0.01, 10), { fov: 40 }) },
  ],
  5: [
    { f: S(5).a, s: (f) => dolly([5, 2.4, 15.5], [-10.5, 3.4, 5], pushK(f, S(5).a, 0.0006, 0.016, 12), { fov: 41 }) },
    { f: 740, cut: true, s: (f) => dolly([-11, 3.6, 24], [-11.1, 3.9, 6], pushK(f, 740, 0.0005, 0.012, 12), { fov: 40 }) },
    { f: 776, cut: true, s: (f) => dolly([-9.9, 3, 21], [-9.9, 3.2, 6], pushK(f, 776, 0.0005, 0.014, 12), { fov: 40 }) },
    { f: 803, cut: true, s: (f) => dolly([-10.5, 2, 16], [-10.2, 1.1, 6], pushK(f, 803, 0.0004, 0.01, 10), { fov: 40 }) },
  ],
  6: [
    { f: S(6).a, s: (f) => dolly([30, 5.5, 47], [30, 10.5, 2], pushK(f, S(6).a, 0.0006, 0.012, 12), { fov: 47 }) },
    { f: 903, cut: true, s: (f) => dolly([23, 1.6, 17], [33.5, 11, 2], pushK(f, 903, 0.0006, 0.014, 12), { fov: 46 }) },
    { f: 953, cut: true, s: (f) => dolly([12, 3.4, 27], [25.5, 7.2, 3], pushK(f, 953, 0.0005, 0.012, 12), { fov: 48 }) },
  ],
  7: [
    { f: S(7).a, s: (f) => dolly([-30, 2.6, 10], [-13.5, 1.5, -0.5], pushK(f, S(7).a, 0.0005, 0.012, 12), { fov: 46 }) },
    { f: 1133, cut: true, s: (f) => dolly([26.5, 2.6, 7], [19, 2.4, -4], pushK(f, 1133, 0.0006, 0.014, 12), { fov: 38 }) },
    { f: 1155, cut: true, s: (f) => dolly([25, 2.8, 4], [19.5, 2.6, -4], pushK(f, 1155, 0.0004, 0.01, 10), { fov: 36 }) },
  ],
  8: [
    { f: S(8).a, s: (f) => dolly([-12, 6, 22], [-37, 12, -4], pushK(f, S(8).a, 0.0006, 0.014, 12), { fov: 46 }) },
    { f: 1211, cut: true, s: (f) => dolly([-22, 19, 10], [-38, 18.5, -4], pushK(f, 1211, 0.0005, 0.012, 10), { fov: 40 }) },
    { f: 1252, cut: true, s: (f) => dolly([-27, 2.6, 24], [-38.5, 1.6, 12], pushK(f, 1252, 0.0005, 0.012, 12), { fov: 46 }) },
    { f: 1300, cut: true, s: (f) => dolly([-19, 2.2, 13], [-26.5, 1.8, 7.5], pushK(f, 1300, 0.0005, 0.014, 10), { fov: 38 }) },
    { f: 1320, cut: true, s: (f) => dolly([-22, 2.3, 19], [-38, 1.8, 11.5], pushK(f, 1320, 0.0006, 0.016, 12), { fov: 38 }) },
    { f: 1347, cut: true, s: (f) => dolly([-6, 5.5, 25], [-34, 8, -2], pushK(f, 1347, 0.0006, 0.016, 12), { fov: 46 }) },
    { f: 1443, cut: true, s: (f) => dolly([-14, 3, 16], [-29, 2.5, 4], pushK(f, 1443, 0.0005, 0.016, 12), { fov: 42 }) },
    { f: 1473, cut: true, s: (f) => dolly([-16, 2.8, 14.5], [-27.6, 2.2, 5.9], pushK(f, 1473, 0.0005, 0.014, 10), { fov: 40 }) },
  ],
  9: [
    { f: S(9).a, s: (f) => dolly([27, 3, 9], [18.5, 2.4, 0], pushK(f, S(9).a, 0.0006, 0.014, 10), { fov: 42 }) },
    { f: 1547, cut: true, s: (f) => dolly([24, 2.6, 8], [18.6, 2.2, 2], pushK(f, 1547, 0.0005, 0.012, 12), { fov: 40 }) },
  ],
  10: [
    { f: S(10).a, s: (f) => dolly([29, 2.8, 9], [17.5, 1.7, -2.4], pushK(f, S(10).a, 0.0006, 0.012, 12), { fov: 42 }) },
    { f: 1607, cut: true, s: (f) => dolly([23.5, 2.6, 5], [17.6, 2.2, -1.6], pushK(f, 1607, 0.0005, 0.012, 10), { fov: 38 }) },
    { f: 1629, cut: true, s: (f) => dolly([30, 2.6, 10], [16, 1.2, 0.8], pushK(f, 1629, 0.0005, 0.012, 12), { fov: 44 }) },
    { f: 1663, cut: true, s: (f) => dolly([23.5, 2.6, 5], [17.6, 2.0, -1.6], pushK(f, 1663, 0.0004, 0.01, 10), { fov: 38 }) },
  ],
  11: [
    { f: S(11).a, s: (f) => dolly([28.5, 3.1, 6], [18.5, 2.7, -4], pushK(f, S(11).a, 0.0006, 0.012, 12), { fov: 42 }) },
    { f: 1758, cut: true, s: (f) => dolly([26, 2.9, 5], [18.2, 2.4, -3.9], pushK(f, 1758, 0.0005, 0.012, 10), { fov: 40 }) },
    { f: 1794, cut: true, s: (f) => dolly([24.5, 2.9, 1], [20.2, 2.6, -4], pushK(f, 1794, 0.0004, 0.01, 10), { fov: 36 }) },
    { f: 1824, cut: true, s: (f) => dolly([-2, 4, 30], [-36, 9, -20], pushK(f, 1824, 0.0005, 0.012, 12), { fov: 46 }) },
    { f: 1851, cut: true, s: (f) => dolly([-25, 2.6, 23], [-38.5, 1.8, 11.8], pushK(f, 1851, 0.0004, 0.01, 10), { fov: 46 }) },
    { f: 1869, cut: true, s: (f) => dolly([20, 30, 10], [-38, 48, -52], pushK(f, 1869, 0.0003, 0.008, 10), { fov: 46 }) },
  ],
  12: [
    { f: S(12).a, s: (f) => dolly([24.5, 2.4, 4.5], [18, 1.2, -3.2], pushK(f, S(12).a, 0.0006, 0.012, 12), { fov: 42 }) },
    { f: 1986, cut: true, s: (f) => dolly([21, 5.5, 2.5], [18.8, 1.6, -2.2], pushK(f, 1986, 0.0004, 0.01, 10), { fov: 40 }) },
  ],
  13: [
    { f: S(13).a, s: (f) => dolly([-10, 3, 20], [-31, 7, -2], pushK(f, S(13).a, 0.0005, 0.012, 12), { fov: 47 }) },
    { f: 2113, cut: true, s: (f) => dolly([-24, 14, 8], [-34.5, 17.5, -1], pushK(f, 2113, 0.0004, 0.01, 10), { fov: 38 }) },
    { f: 2158, cut: true, s: (f) => dolly([-12, 3.2, 18], [-27.5, 7, 2], pushK(f, 2158, 0.0005, 0.014, 10), { fov: 47 }) },
    { f: 2171, cut: true, s: (f) => dolly([-12, 2.8, 17], [-25.5, 1.7, 7], pushK(f, 2171, 0.0004, 0.01, 10), { fov: 38 }) },
  ],
  14: [
    { f: S(14).a, s: (f) => dolly([80, 8, -70], [55, 4.5, -36.5], pushK(f, S(14).a, 0.0006, 0.012, 12), { fov: 42 }) },
    { f: 2217, cut: true, s: (f) => dolly([52, 2.6, -54], [57.5, 2.2, -47], pushK(f, 2217, 0.0005, 0.012, 12), { fov: 42 }) },
    { f: 2262, cut: true, s: (f) => dolly([47, 3, -52], [57, 3.5, -40], pushK(f, 2262, 0.0004, 0.01, 10), { fov: 42 }) },
  ],
  15: [
    { f: S(15).a, s: (f) => dolly([44, 3.2, -56], [55, 3, -42], pushK(f, S(15).a, 0.0005, 0.012, 12), { fov: 46 }) },
    { f: 2338, cut: true, s: (f) => dolly([44, 2.6, -54], [54.5, 2.8, -43], pushK(f, 2338, 0.0004, 0.012, 12), { fov: 44 }) },
  ],
};

// impact kicks: landing thump, the rope snap, the block's stop, the small catch
const KICKS: [number, number][] = [[T_LAND, 0.9], [T_SNAP, 1.2], [T_STOP, 1.5], [T_SMALLCATCH, 0.6]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(f / FPS);
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 11 },
  { f: SHOTS[1].a, cInf: 0 },
  { f: SHOTS[2].a, cInf: 6 },
  { f: SHOTS[3].a, cInf: 11 },
  { f: SHOTS[4].a, cInf: 10 },
  { f: SHOTS[5].a, cInf: 0 },
  { f: SHOTS[6].a, cInf: 14 },
  { f: SHOTS[7].a, cInf: 11 },
  { f: SHOTS[8].a, cInf: 10 },
  { f: SHOTS[9].a, cInf: 12 },
  { f: SHOTS[10].a, cInf: 7 },
  { f: Math.round(BEAT_T[12] * FPS), cInf: 0 },
  { f: SHOTS[11].a, cInf: 12 },
  { f: SHOTS[12].a, cInf: 8 },
  { f: SHOTS[13].a, cInf: 0 },
  { f: SHOTS[14].a, cInf: 10 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [];
