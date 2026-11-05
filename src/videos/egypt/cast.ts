// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import { Pen, fxBurst, fxShadow, fxContact } from "./toon";
import {
  FPS, SHOTS, V3, smooth, clamp01, egyptState, blockPos, dragPos, swingPalm, swingObelisk, palmCrown, descentHand,
  blockWebEnds, smallWebEnd, OBELISK_A, SPIDEY_HOME,
  T_LAND, T_PALM_FIRE, T_PALM_DUMP, T_SWING0, T_SWING1, T_SNAP, T_CATCH, T_STOP, T_WOBBLE, T_SMALLCATCH, SITE, rampY,
} from "./story";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
  /** world.ts hooks: "hero" = the web-slinger (web origins come from his drawn hands), "crewHand" = the guide-rope holder */
  tag?: string; joints?: Joints;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

// ---------------- Egypt staging ----------------
import { figure, guardGear, handCanvas, POSES, Costume, Joints } from "./cards";

export type Stage = { places: Place[]; fx: FxPlace[] };

const CONTACT2: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL2: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb2 = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf2 = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb2(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h;
    const tc = hexOf2(TAIL2, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf2(CONTACT2[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

type CardOpts = { scale?: number; mirror?: boolean; yaw?: number; roll?: number; expr?: "glyph" | "glyphWow" | "glyphFlat"; gear?: boolean; blob?: boolean; tag?: string; armsFront?: boolean };
const card = (cam: CamInfo, out: Stage, costume: Costume, poseKey: string, pose: Joints, x: number, y: number, z: number, o: CardOpts = {}) => {
  const sc = o.scale ?? 1;
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / sc;
  const [w, h, k] = tier(d);
  out.places.push({
    key: `${costume}|${poseKey}|${o.expr ?? "g"}|${w}${o.armsFront ? "|af" : ""}`, x, y, z, scale: sc, mirror: o.mirror, yaw: o.yaw, roll: o.roll, size: [w, h, k],
    tag: o.tag, joints: pose,
    draw: (p) => { figure(p, costume, { j: pose, expr: o.expr, armsFront: o.armsFront }); if (o.gear) guardGear(p, pose); },
  });
  if (o.blob !== false) blob(out, x, y, z, sc);
};
const lerpN = (a: number, b: number, k: number) => a + (b - a) * k;
/** card origin that puts the pose's drawn RIGHT hand exactly on the world point `handPt`
 *  (the card yaw follows the camera, as world.ts will set it; world.ts also re-derives the exact
 *  hand position from the final transform, so the web endpoint lands on the hand regardless) */
const placeByHand = (cam: CamInfo, handPt: V3, pose: Joints, roll: number): V3 => {
  const hc = handCanvas(pose, "R");
  const lx = (hc[0] - 300) * SU, ly = (975 - hc[1]) * SU;
  const yaw = Math.atan2(cam.pos.x - handPt[0], cam.pos.z - handPt[2]);
  const cr = Math.cos(roll), sr = Math.sin(roll), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const vx = lx * cr - ly * sr, vy = lx * sr + ly * cr;
  return [handPt[0] - vx * cy, handPt[1] - vy, handPt[2] + vx * sy];
};
const dust = (out: Stage, x: number, y: number, z: number, u: number, s = 1) => {
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `burst${q(u, 24)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 24)), x, y, z, w: 1.6 * s, h: 1.6 * s });
};
/** hauling crew on the ramp foot: two rope lines, bobbing in phase (quantized so cards share canvases) */
const haulCrew = (cam: CamInfo, out: Stage, t: number, scatter = 0) => {
  for (let i = 0; i < 6; i++) {
    const line = i < 3 ? -1 : 1, k = i % 3;
    const x = -38 + line * (2.2 + k * 0.4) + scatter * (line * (1.5 + k * 0.8)), z = 10.5 + k * 1.7 + scatter * 1.2;
    const ph = q(Math.sin(t * 2.1 + k * 0.7 + line), 6);
    const pose: Joints = scatter > 0.5 ? POSES.stand : { ...POSES.haul, lean: 16 + ph * 3 };
    card(cam, out, "worker", scatter > 0.5 ? "stand" : `haul${ph}`, pose, x, 0, z, { expr: scatter > 0.5 ? "glyphWow" : "glyph", scale: 0.97, tag: i === 0 ? "crewHand" : undefined });
  }
};
/** the pharaoh's platform group: pharaoh + guard + two fan bearers on the dais (top y=1.7) */
const dais = (cam: CamInfo, out: Stage, t: number, pharaohPose: string, pose: Joints, o: { cheer?: boolean } = {}) => {
  card(cam, out, "pharaoh", pharaohPose, pose, 19, 1.7, -4, { scale: 1.07 });
  card(cam, out, "guard", "stand", POSES.stand, 21.6, 1.7, -3.2, { gear: true });
  const fan: Joints = { armR: [118, 26], armL: [-26, -10], legL: [-7, 2], legR: [7, -2] };
  card(cam, out, "worker", `fan${q(Math.sin(t * 2.4), 6)}`, { ...fan, armR: [118 + q(Math.sin(t * 2.4), 6) * 8, 26] }, 16.4, 1.7, -5.5, { scale: 0.95 });
  card(cam, out, "worker", "stand", POSES.stand, 22.9, 1.1, -1.5, { scale: 0.95 });
  if (o.cheer) card(cam, out, "worker", "cheer", POSES.cheer, 14.8, 1.1, -1, {});
};

export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  const st = egyptState(t);
  const lt = t - s.a / FPS; // shot-local seconds

  if (id === 1) {
    // the fall: tumble down the pyramid's river face, bounce, land in a crouch at SPIDEY_HOME
    if (t < T_LAND) {
      const u = clamp01((t - 0.25) / (T_LAND - 0.25));
      const x = -38 + 18 * u, y = Math.max(0, 46 * (1 - u) - 3) + Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 7, z = -30 + 32 * u;
      card(cam, out, "spidey", "fall", POSES.spideyFall, x, y, z, { roll: -u * 4.6, blob: false });
    } else if (t < T_LAND + 0.85) {
      card(cam, out, "spidey", "crouch", POSES.spideyCrouch, SPIDEY_HOME[0], 0, SPIDEY_HOME[2], {});
      dust(out, SPIDEY_HOME[0], 0.5, SPIDEY_HOME[2] + 0.4, (t - T_LAND) / 0.5, 1.6);
    } else {
      card(cam, out, "spidey", "stand", POSES.spideyStand, SPIDEY_HOME[0], 0, SPIDEY_HOME[2], {});
    }
    // v2: pointing arms drop at f 169 (the stare settles) so the 1C reaction hold still changes
    for (let i = 0; i < 5; i++) {
      const pointing = i % 2 === 1 && t < 169 / FPS;
      card(cam, out, "worker", pointing ? "point" : "stand", pointing ? POSES.point : POSES.stand, -26 + i * 3.4, 0, 7 + (i % 3) * 2.2, { expr: t >= T_LAND ? "glyphWow" : "glyph", scale: 0.96 });
    }
    haulCrew(cam, out, t);
  }
  if (id === 2) {
    haulCrew(cam, out, t);
    dais(cam, out, t, "stand", POSES.stand);
    card(cam, out, "spidey", "stand", POSES.spideyStand, SPIDEY_HOME[0], 0, SPIDEY_HOME[2], {});
    for (let i = 0; i < 3; i++) card(cam, out, "worker", "stand", POSES.stand, 44 + i * 4, 1.6, -8 - i * 3, { scale: 0.95 });
    for (let i = 0; i < 2; i++) card(cam, out, "worker", "hammer", i ? POSES.hammerDown : POSES.hammerUp, 20 + i * 3, 0, -24, { scale: 0.94 });
  }
  if (id === 3) {
    haulCrew(cam, out, t);
    card(cam, out, "spidey", "nod", POSES.spideyNod, SPIDEY_HOME[0], 0, SPIDEY_HOME[2], {});
    dais(cam, out, t, lt > 3.33 ? "armsWide" : "stand", lt > 3.33 ? POSES.armsWide : POSES.stand); // v2 80 s: arms wide at the last phrase of beat 3
  }
  if (id === 4) {
    const scan = q(Math.sin(t * 1.25), 4); // v2: coarser steps — the head search reads as discrete snaps, not a drift
    const pose: Joints = lt < 4.26 ? { ...POSES.stand, headTilt: scan * 9 } : POSES.spideyStand; // v2 80 s: scan until "and swings"
    card(cam, out, "spidey", lt < 3.1 ? `scan${scan}` : "stand", pose, SPIDEY_HOME[0], 0, SPIDEY_HOME[2], {});
    haulCrew(cam, out, t);
    for (let i = 0; i < 3; i++)
      card(cam, out, "worker", lt > 4.0 ? "point" : "stand", lt > 4.0 ? POSES.point : POSES.stand, -14 + i * 3.2, 0, 9 + i * 1.4, { scale: 0.96 });
  }
  if (id === 5) {
    // v3: he does NOT hang before the web exists — he stands under the palm reaching up, fires at
    // T_PALM_FIRE (impact star on the crown, line grows out of his hand), leaps into the hang, and
    // the bending crown lowers him onto the dump spot the pendulum actually reaches.
    const STAND5: V3 = [-11.3, 0, 5.6];
    const swDump = swingPalm(T_PALM_DUMP), dOrg = placeByHand(cam, swDump.hand, POSES.spideySwing, -swDump.th * 0.85);
    const DUMP5: V3 = [dOrg[0], 0, dOrg[2]];
    if (t < T_PALM_FIRE) {
      card(cam, out, "spidey", "reach", { ...POSES.spideyStand, armR: [157, -3] }, STAND5[0], 0, STAND5[2], { tag: "hero" });
    } else if (t < T_PALM_DUMP) {
      const { hand, th } = swingPalm(t);
      const o = placeByHand(cam, hand, POSES.spideySwing, -th * 0.85);
      let x = o[0], y = o[1], z = o[2];
      const leap = clamp01((t - T_PALM_FIRE) / 0.27);
      if (leap < 1) { const e = smooth(leap); x = lerpN(STAND5[0], o[0], e); z = lerpN(STAND5[2], o[2], e); y = lerpN(0, o[1], e) + Math.sin(leap * Math.PI) * 0.7; }
      card(cam, out, "spidey", "swing", POSES.spideySwing, x, y, z, { roll: -th * 0.85, blob: false, tag: "hero", armsFront: true });
      if (leap >= 1 && y < 0.22) dust(out, x, 0.3, z + 0.3, ((t * 7) % 1) * 0.9, 0.8); // feet brush the sand at the arc bottom
      if (t < T_PALM_FIRE + 0.3) { const c = palmCrown(t); dust(out, c[0], c[1], c[2], (t - T_PALM_FIRE) / 0.3, 1.3); } // impact star on the crown
    } else if (t < T_PALM_DUMP + 0.7) {
      card(cam, out, "spidey", "crouch", POSES.spideyCrouch, DUMP5[0], 0, DUMP5[2], { tag: "hero" });
      dust(out, DUMP5[0], 0.4, DUMP5[2] + 0.4, (t - T_PALM_DUMP) / 0.45, 1.1);
    } else {
      card(cam, out, "spidey", "flat", { ...POSES.stand, headTilt: 9 }, DUMP5[0], 0, DUMP5[2], { tag: "hero" });
    }
    for (let i = 0; i < 3; i++)
      card(cam, out, "worker", i === 1 ? "point" : "stand", i === 1 ? POSES.point : POSES.stand, -16 + i * 4.5, 0, 11 + i, { expr: t >= T_PALM_DUMP ? "glyphWow" : "glyph", scale: 0.96 });
  }
  if (id === 6) {
    // v3: he waits BY the obelisk, leaps as he fires (star on the pyramidion tip), swings, then pays
    // out line and drops to a landing beside the obelisk — no pop-in, no swing out of the frame.
    const BASE6: V3 = [26.5, 0, 5.5], LAND6: V3 = [23.8, 0, 2.6];
    const T_LEAP = T_SWING0 - 0.55, T_LAND = T_SWING1 + 0.4;
    if (t < T_LEAP) {
      card(cam, out, "spidey", "stand", POSES.spideyStand, BASE6[0], 0, BASE6[2], { tag: "hero" });
    } else if (t < T_SWING0) {
      const so = swingObelisk(T_SWING0), o = placeByHand(cam, so.hand, POSES.spideySwing, -so.th * 0.9);
      const k = smooth(clamp01((t - T_LEAP) / (T_SWING0 - T_LEAP)));
      card(cam, out, "spidey", "swing", POSES.spideySwing, lerpN(BASE6[0], o[0], k), lerpN(0, o[1], k) + Math.sin(k * Math.PI) * 0.8, lerpN(BASE6[2], o[2], k),
        { roll: -so.th * 0.9, blob: false, tag: "hero", armsFront: true });
    } else if (t <= T_SWING1) {
      const { hand, th } = swingObelisk(t);
      const o = placeByHand(cam, hand, POSES.spideySwing, -th * 0.9);
      card(cam, out, "spidey", "swing", POSES.spideySwing, o[0], o[1], o[2], { roll: -th * 0.9, blob: false, tag: "hero", armsFront: true });
    } else if (t < T_LAND) {
      const hd = descentHand(t), roll = -swingObelisk(T_SWING1).th * 0.9 * (1 - clamp01((t - T_SWING1) / 0.4));
      const o = placeByHand(cam, hd, POSES.spideySwing, roll);
      card(cam, out, "spidey", "swing", POSES.spideySwing, o[0], o[1], o[2], { roll, blob: false, tag: "hero", armsFront: true });
    } else if (t < T_LAND + 0.55) {
      card(cam, out, "spidey", "crouch", POSES.spideyCrouch, LAND6[0], 0, LAND6[2], { tag: "hero" });
      dust(out, LAND6[0], 0.4, LAND6[2] + 0.4, (t - T_LAND) / 0.45, 1.1);
    } else {
      card(cam, out, "spidey", "stand", POSES.spideyStand, LAND6[0], 0, LAND6[2], { tag: "hero" });
    }
    if (t >= T_SWING0 - 0.12 && t < T_SWING0 + 0.18) dust(out, OBELISK_A[0], OBELISK_A[1], OBELISK_A[2], (t - (T_SWING0 - 0.12)) / 0.3, 1.3); // impact star on the tip
    for (let i = 0; i < 7; i++)
      card(cam, out, "worker", "point", POSES.point, 18 + i * 3.6, 0, 13 + (i % 3) * 2.4, { expr: t >= T_SWING0 ? "glyphWow" : "glyph", scale: 0.95 });
    dais(cam, out, t, "stand", POSES.stand);
  }
  if (id === 7) {
    // v2 face snap: calm glyphs until "…in a spider mask" (f 1276), then wow + kneelers drop together
    const awed = t >= 1079 / FPS; // v2 80 s: awe swap inside beat 7 (frame 1079)
    for (let i = 0; i < 5; i++) {
      const kneel = awed && (i === 1 || i === 3);
      card(cam, out, "worker", kneel ? "kneel" : "stand", kneel ? POSES.kneel : POSES.stand, -19 + i * 2.6, 0, -1 + (i % 2) * 1.6,
        { expr: awed ? "glyphWow" : "glyph", scale: 0.97 });
    }
    card(cam, out, "spidey", "stand", { ...POSES.stand, headTilt: 5 }, SPIDEY_HOME[0], 0, SPIDEY_HOME[2], {});
    dais(cam, out, t, lt > 2.9 ? "armsWide" : "stand", lt > 2.9 ? POSES.armsWide : POSES.stand); // v2 80 s: rise just after the awe swap
  }
  if (id === 8) {
    const scatter = t > T_SNAP + 0.8 ? 1 : 0;
    haulCrew(cam, out, t, scatter);
    if (t < T_CATCH - 0.35) {
      card(cam, out, "spidey", "stand", POSES.spideyStand, -26.5, 0, 7.5, { tag: "hero" });
    } else {
      const d = dragPos(t);
      card(cam, out, "spidey", "drag", POSES.spideyDrag, d[0], 0, d[2], { tag: "hero", armsFront: true });
      if (t > T_CATCH && t < T_STOP) {
        dust(out, d[0] - 0.4, 0.35, d[2] + 0.9, ((t * 7) % 1) * 0.9, 0.9);
        dust(out, -38, rampY(blockPos(st.blockU)[2]) + 0.6, blockPos(st.blockU)[2] + 2.6, ((t * 5 + 0.4) % 1) * 0.9, 1.3);
      }
      if (t >= T_STOP) dust(out, -38, rampY(blockPos(0.96)[2]) + 0.5, blockPos(0.96)[2] + 2.8, (t - T_STOP) / 0.6, 1.8);
    }
    for (let i = 0; i < 3; i++)
      card(cam, out, "worker", scatter ? "kneel" : "stand", scatter ? POSES.kneel : POSES.stand, -44 + i * 2.4, 0, 13.5 + i, { expr: t >= T_SNAP ? "glyphWow" : "glyph", scale: 0.95 });
    if (t >= T_CATCH - 0.05 && t < T_CATCH + 0.25) { // impact stars where the catch webs bite the block face
      const [e1, e2] = blockWebEnds(t), u = (t - (T_CATCH - 0.05)) / 0.3;
      dust(out, e1[0], e1[1], e1[2], u, 1.2); dust(out, e2[0], e2[1], e2[2], u, 1.2);
    }
  }
  if (id === 9) {
    dais(cam, out, t, "clap", POSES.clap, { cheer: true });
    const bobY = Math.abs(Math.sin(t * 5.2)) * 0.14;
    for (let i = 0; i < 4; i++)
      card(cam, out, "worker", "carry", POSES.carry, 15.6 + i * 2.3, bobY, 1.5 + (i % 2) * 1.6, { scale: 0.97 });
    card(cam, out, "spidey", "wave", POSES.spideyWave, 18.8, 1.62 + bobY, 2.2, {});
  }
  if (id === 10) {
    // v2: tired slump swap at "gods do not get to go home"; priest row shifted off the old camera axis (B7)
    const tired = lt > 2.74; // v2 80 s: slump at "gods do not get to go home" (shot-10 local)
    card(cam, out, "spidey", tired ? "tired" : "god", tired ? POSES.spideyTired : { ...POSES.stand, headTilt: -4 }, 17.5, 1.7, -1.5, {});
    out.fx.push({ key: "amulet", cw: 128, ch: 128, draw: (p) => { p.ell(64, 64, 40, 40, "#E3A81C", 7); p.ell(64, 64, 13, 20, "#14100C", 0); }, x: 17.5, y: 3.05, z: -1.2, w: 0.34, h: 0.34 });
    for (let i = 0; i < 5; i++)
      card(cam, out, "priest", "bow", POSES.bow, 10.5 + i * 3.1, 0, 1.2 - Math.abs(i - 2) * 0.5, { scale: 0.98 });
    dais(cam, out, t, "armsWide", POSES.armsWide);
  }
  if (id === 11) {
    if (lt < 3.4) { // v2 80 s: platform group only while the platform cameras run
      card(cam, out, "pharaoh", "point", { ...POSES.point, armR: [64, 12] }, 20.4, 1.7, -4, { scale: 1.07 });
      card(cam, out, "spidey", "nod", POSES.spideyNod, 17.2, 1.7, -3.4, {});
      card(cam, out, "guard", "stand", POSES.stand, 22.8, 1.7, -2.6, { gear: true });
    }
    for (let i = 0; i < 3; i++)
      card(cam, out, "worker", "stand", POSES.stand, -44 + i * 4.5, 52.2, -47 + i * 2, { scale: 0.92, blob: false });
    // v2: during the fact beat (lt >= 4.94) the base cuts need crews at the pyramid foot for scale
    if (lt >= 3.4) { // v2 80 s: base crews from the first pyramid cut
      haulCrew(cam, out, t);
      for (let i = 0; i < 2; i++) card(cam, out, "worker", "stand", POSES.stand, -18 + i * 5, 0, 4 + i * 2, { scale: 0.95 });
    }
  }
  if (id === 12) {
    card(cam, out, "pharaoh", "sketch", { ...POSES.point, armR: [52, 18], headTilt: 10 }, 19.6, 1.7, -3.6, { scale: 1.07 });
    card(cam, out, "spidey", "nod", POSES.spideyNod, 16.4, 1.7, -2.8, {});
    // v2 (B10): the sand sketch itself — a little pyramid glyph scratched on the dais floor in front of the pharaoh
    out.fx.push({ key: "sandsketch", cw: 320, ch: 240, draw: (p) => {
      p.g.strokeStyle = "#7d5f30"; p.g.lineWidth = 11; p.g.lineCap = "round"; p.g.lineJoin = "round";
      p.g.beginPath(); p.g.moveTo(52, 196); p.g.lineTo(160, 58); p.g.lineTo(268, 196); p.g.closePath(); p.g.stroke();
      p.g.beginPath(); p.g.moveTo(160, 58); p.g.lineTo(160, 196); p.g.stroke();
      p.g.beginPath(); p.g.moveTo(30, 208); p.g.lineTo(290, 208); p.g.stroke();
      p.g.fillStyle = "#7d5f30"; p.g.beginPath(); p.g.arc(160, 30, 13, 0, Math.PI * 2); p.g.fill();
    }, x: 19.6, y: 1.73, z: -1.4, w: 2.6, h: 1.95, flat: true, rot: 0.35 });
    // v2: workers look blank (glyphFlat) until mid-beat (blank -> listening), then nod at "fifty-eight hundred"
    const nod = lt >= 3.4; // v2 80 s: nod at "fifty-eight hundred"
    const listening = nod || lt >= 2.2; // v2 80 s: blank -> listening mid-beat
    card(cam, out, "worker", nod ? "kneelNod" : "kneel", nod ? { ...POSES.kneel, headTilt: 22 } : POSES.kneel, 13.6, 0, 0.5, { expr: listening ? "glyph" : "glyphFlat", scale: 0.96 });
    card(cam, out, "worker", nod ? "standNod" : "stand", { ...POSES.stand, headTilt: nod ? 18 : 8 }, 22.6, 0, 0.2, { expr: listening ? "glyph" : "glyphFlat", scale: 0.96 });
  }
  if (id === 13) {
    const caught = t >= T_SMALLCATCH;
    card(cam, out, "spidey", caught ? "catch" : "sit", caught ? POSES.spideyCatch : { ...POSES.spideyCatch, armR: [26, 12] }, -24, 0.55, 8, { tag: "hero", armsFront: true });
    if (t >= T_SMALLCATCH - 0.05 && t < T_SMALLCATCH + 0.25) { const e = smallWebEnd(); dust(out, e[0], e[1], e[2], (t - (T_SMALLCATCH - 0.05)) / 0.3, 1.2); } // impact star on the block top
    haulCrew(cam, out, t);
    for (let i = 0; i < 2; i++)
      card(cam, out, "worker", "stand", POSES.stand, -17 + i * 3.4, 0, 12.5, { scale: 0.95 });
  }
  if (id === 14) {
    const ph = Math.floor(t * 1.6) % 2;
    card(cam, out, "worker", ph ? "hammerDown" : "hammerUp", ph ? POSES.hammerDown : POSES.hammerUp, 56, 0, -47.5, { scale: 0.97 });
    card(cam, out, "worker", ph ? "hammerUp" : "hammerDown", ph ? POSES.hammerUp : POSES.hammerDown, 64, 0, -49, { scale: 0.97 });
    card(cam, out, "worker", "kneel", POSES.kneel, 60, 0, -46, { scale: 0.95 });
    card(cam, out, "worker", "stand", POSES.stand, 68, 0, -50, { scale: 0.96 });
    card(cam, out, "pharaoh", "stand", POSES.stand, 52, 0, -44, { scale: 1.05 });
    card(cam, out, "guard", "stand", POSES.stand, 50, 0, -43, { gear: true, scale: 0.98 });
  }
  if (id === 15) {
    card(cam, out, "pharaoh", lt > 1.6 ? "clap" : "armsWide", lt > 1.6 ? POSES.clap : POSES.armsWide, 48.5, 0, -47, { scale: 1.05 }); // v2 80 s: clap just after the legs line lands
    card(cam, out, "spidey", "facepalm", POSES.spideyFacepalm, 52.5, 0, -46, {});
    card(cam, out, "worker", "cheer", POSES.cheer, 62, 0, -45, { scale: 0.96 });
  }
  return out;
};
export { FPS };
