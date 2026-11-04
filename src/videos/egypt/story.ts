// Timeline of "What if Spider-Man ended up in Ancient Egypt?": 17 narration beats -> 15 shots.
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
export const BEAT_DUR = [7.5, 7.0, 7.0, 5.0, 4.5, 6.0, 6.5, 7.0, 5.5, 3.5, 7.5, 4.0, 6.5, 7.0, 6.5, 5.5, 4.5];
export const BEAT_T: number[] = [];
{ let s = 0; for (const d of BEAT_DUR) { BEAT_T.push(s); s += d; } }
export const TOTAL_S = BEAT_T[16] + BEAT_DUR[16] + 1.2; // + tail hold
export const TOTAL = Math.round(TOTAL_S * FPS);

// event times (seconds), anchored to beats
export const T_LAND = 2.1;
export const T_PALM_FIRE = BEAT_T[4] + 0.6;         // web hits the palm (beat 5)
export const T_PALM_DUMP = BEAT_T[4] + 3.4;         // palm has bent him to the ground
export const T_SWING0 = BEAT_T[5] + 0.8;            // obelisk swing window
export const T_SWING1 = BEAT_T[5] + 4.6;
export const T_SNAP = BEAT_T[7] + 5.1;              // the rope parts (late in beat 8)
export const T_CATCH = BEAT_T[8] + 0.7;             // webs hit the block (beat 9)
export const T_STOP = T_CATCH + 2.6;                // block fully stopped
export const T_WOBBLE = BEAT_T[14] + 3.4;           // the small stone wobbles (beat 15)
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
  shot(9, 9, 9, "day"),           // luckily: the pharaoh claps
  shot(10, 10, 10, "day"),        // unluckily: a god's welcome
  shot(11, 11, 12, "golden"),     // sunset platform -> crane up the pyramid (fact)
  shot(12, 13, 13, "golden"),     // the sand sketch (analogy)
  shot(13, 14, 14, "day"),        // official catcher of falling stones
  shot(14, 15, 15, "day"),        // a second sphinx
  { id: 15, a: Math.round(BEAT_T[16] * FPS), b: TOTAL, light: "day", crowd: "none" }, // eight legs
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
export const palmTop = (): V3 => [SITE.heroPalm.x, 8.8, SITE.heroPalm.z];
export const swingPalm = (t: number) => {
  // pendulum from the palm top: he swings in, the palm bends, and he is lowered to the ground
  const st = egyptState(t);
  const L = 6.4, a0 = palmTop();
  const th = -0.95 + 1.15 * smooth((t - T_PALM_FIRE) / 1.5); // swing angle from vertical
  const hand: V3 = [a0[0] + Math.sin(th) * L, a0[1] - Math.cos(th) * L * (1 - st.palmBend * 0.35), a0[2]];
  return { hand, th, bend: st.palmBend };
};
export const OBELISK_A: V3 = [SITE.obelisks[0].x, 20.4, SITE.obelisks[0].z];
export const swingObelisk = (t: number) => {
  const u = clamp01((t - T_SWING0) / (T_SWING1 - T_SWING0));
  const th = -0.62 * Math.cos(u * Math.PI * 1.9) * (1 - u * 0.25); // one big arc, decaying
  const L = 12.5, a0 = OBELISK_A;
  const hand: V3 = [a0[0] + Math.sin(th) * L, a0[1] - Math.cos(th) * L, a0[2]];
  return { hand, th };
};
/** during the catch: spidey is dragged from his firing spot toward the ramp as the block decelerates */
export const dragPos = (t: number): V3 => {
  if (t < T_CATCH) return [-26.5, 0, 7.5];
  const k = smooth((t - T_CATCH) / (T_STOP - T_CATCH));
  return [lerp(-26.5, -29.6, k), 0, lerp(7.5, 5.2, k)];
};
/** web segments to draw this frame: [from, to] pairs in world space */
export const webSegs = (id: number, t: number): { a: V3; b: V3 }[] => {
  const out: { a: V3; b: V3 }[] = [];
  const st = egyptState(t);
  if (id === 5 && t > T_PALM_FIRE - 0.12 && t < T_PALM_DUMP + 1.2) {
    const { hand } = swingPalm(t);
    out.push({ a: palmTop(), b: hand });
  }
  if (id === 6 && t > T_SWING0 - 0.1 && t < T_SWING1 + 0.4) {
    const { hand } = swingObelisk(t);
    out.push({ a: OBELISK_A, b: hand });
  }
  if (id === 8 && t >= T_CATCH - 0.05 && t < T_STOP + 2.5) {
    const bp = blockPos(st.blockU), d = dragPos(t);
    out.push({ a: [d[0] + 0.35, 2.45, d[2] - 0.3], b: [bp[0] - 1.2, bp[1] + 3.6, bp[2] + 1.2] });
    out.push({ a: [d[0] - 0.1, 2.3, d[2] + 0.25], b: [bp[0] + 1.3, bp[1] + 3.3, bp[2] + 1.0] });
  }
  if (id === 13 && t >= T_SMALLCATCH - 0.05) {
    out.push({ a: [-23.4, 1.9, 8.6], b: [SMALL_BLOCK[0] + 0.6, SMALL_BLOCK[1] + 1.6, SMALL_BLOCK[2]] });
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

const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: (f) => dolly([10, 8.5, 33], [-24, 11, -14], pushK(f, 0, 0.0016), { fov: 46 }) },
    { f: 96, dur: 34, s: (f) => dolly([-11, 3.2, 15], [-20, 2.4, 2], pushK(f, 96, 0.0022), { fov: 42 }) },
  ],
  2: [
    { f: S(2).a, s: (f) => drift({ pos: [124, 64, 96], look: [-8, 0, -22], fov: 46 }, { pos: [100, 52, 110], look: [4, 0, -14], fov: 44 }, f, S(2).a, S(2).b) },
  ],
  3: [
    { f: S(3).a, s: (f) => dolly([-6, 3.4, 19], [-38, 10, -8], pushK(f, S(3).a, 0.0018), { fov: 43 }) },
    { f: S(3).a + 118, dur: 30, s: (f) => dolly([28, 2.7, 9], [19, 2.3, -4], pushK(f, S(3).a + 118, 0.002), { fov: 40 }) },
  ],
  4: [
    { f: S(4).a, s: (f) => dolly([-12.5, 2.5, 10.5], [-20, 2.7, 2], pushK(f, S(4).a, 0.0022), { fov: 38 }) },
    { f: S(4).a + 84, dur: 26, s: (f) => dolly([-0.5, 3.0, 13], [-9, 5.5, 5], pushK(f, S(4).a + 84, 0.0016), { fov: 38 }) },
  ],
  5: [
    { f: S(5).a, s: (f) => dolly([4.5, 2.4, 15], [-8.5, 3.6, 5], pushK(f, S(5).a, 0.0018), { fov: 41 }) },
  ],
  6: [
    { f: S(6).a, s: (f) => dolly([35, 3.2, 34], [36.5, 10, 0], pushK(f, S(6).a, 0.0012), { fov: 47 }) },
  ],
  7: [
    { f: S(7).a, s: (f) => dolly([-1, 2.1, 7], [-15, 1.9, -3], pushK(f, S(7).a, 0.0024), { fov: 36 }) },
    { f: S(7).a + 96, dur: 28, s: (f) => dolly([26.5, 2.6, 7], [19, 2.4, -4], pushK(f, S(7).a + 96, 0.002), { fov: 38 }) },
  ],
  8: [
    { f: S(8).a, s: (f) => dolly([-23, 12.5, 3], [-38, 15, -6], pushK(f, S(8).a, 0.0016), { fov: 37 }) },
    { f: Math.round(T_SNAP * FPS), cut: true, s: (f) => dolly([-6, 5.5, 25], [-34, 8, -2], pushK(f, Math.round(T_SNAP * FPS), 0.0018), { fov: 46 }) },
  ],
  9: [
    { f: S(9).a, s: (f) => dolly([28, 3, 8.5], [17.8, 2.6, -1], pushK(f, S(9).a, 0.002), { fov: 40 }) },
  ],
  10: [
    { f: S(10).a, s: (f) => dolly([26.5, 3.4, 12], [18.2, 1.6, -2.8], pushK(f, S(10).a, 0.0016), { fov: 40 }) },
  ],
  11: [
    { f: S(11).a, s: (f) => dolly([28.5, 3.1, 6], [18.5, 2.7, -4], pushK(f, S(11).a, 0.0015), { fov: 42 }) },
    { f: Math.round(BEAT_T[12] * FPS) - 20, dur: 60, s: (f) => drift({ pos: [-14, 26, 10], look: [-38, 34, -38], fov: 43 }, { pos: [-22, 45, -2], look: [-38, 49, -45], fov: 41 }, f, Math.round(BEAT_T[12] * FPS) - 20, S(11).b) },
  ],
  12: [
    { f: S(12).a, s: (f) => dolly([24.5, 2.4, 4.5], [18, 1.5, -3.2], pushK(f, S(12).a, 0.0022), { fov: 42 }) },
  ],
  13: [
    { f: S(13).a, s: (f) => dolly([-14, 3.2, 13], [-30, 4.5, -3], pushK(f, S(13).a, 0.0018), { fov: 42 }) },
  ],
  14: [
    { f: S(14).a, s: (f) => dolly([74, 7.5, -64], [55, 5, -36.5], pushK(f, S(14).a, 0.0016), { fov: 42 }) },
  ],
  15: [
    { f: S(15).a, s: (f) => dolly([70, 6, -60], [57, 4.5, -37.5], pushK(f, S(15).a, 0.0016, 0.0025, 30), { fov: 40 }) },
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
