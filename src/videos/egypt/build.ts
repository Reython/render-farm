// Static scenery: merged batches (one mesh per material), box-section strands rebuilt along a path every frame
// (chains, rails), and the town on both banks: gabled houses with painted facades, church, mill + chimneys, quay,
// hills and CC0 Kenney props (trees, lanterns, stalls, hedges).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { D0, SITE } from "./story";
import { brick, rng, ctex, rep, facadeHD, roofHD, stoneHD, beam } from "./paint";
import { twoTone } from "./shade";

export type Kit = Record<string, THREE.Object3D>;
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------- materials (shared, cached) ----------------
const mats = new Map<string, THREE.Material>();
/** materials whose Strands are built as real interlocking chain links (MAT pass) instead of a textured box tube */
const CHAIN_MATS = new WeakSet<THREE.Material>();
export const lam = (key: string, make: () => THREE.MeshLambertMaterialParameters) => {
  let m = mats.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    if (key === "chainHD") {
      // MAT pass: the chain material (world.ts) becomes slate blue-grey iron with a soft painted-metal highlight;
      // its Strands switch to link geometry, so links read in close-ups (bank f1780, overhead f1650)
      const c = twoTone(new THREE.MeshPhongMaterial({ color: "#7a8490", specular: "#6c727b", shininess: 30 }));
      CHAIN_MATS.add(c);
      m = c as unknown as THREE.MeshLambertMaterial;
    } else m = twoTone(new THREE.MeshLambertMaterial(make()));
    mats.set(key, m);
  }
  return m;
};
const lamOf = new Map<string, THREE.MeshLambertMaterial>();
// the nature kit ships a teal palette; our valley wants storybook greens and browns
const GREENS = ["#62ae4c", "#56a447", "#72b853"];
const RECOLOR: Record<string, string> = { grass: "#6aab4f", leafsDark: "#4a9142", woodBark: "#8a5a3c", woodInner: "#e8cfa4", wood: "#a8724a",
  woodDark: "#7a4f33", dirt: "#8a6a4a", stone: "#b7b4ad" };
/** Kenney GLB materials -> Lambert, so the whole world shares one lighting model */
const toLambert = (m: THREE.Material) => {
  let l = lamOf.get(m.uuid);
  if (!l) {
    const s = m as THREE.MeshStandardMaterial;
    const col = m.name === "leafsGreen" ? GREENS[lamOf.size % 3] : RECOLOR[m.name];
    l = twoTone(new THREE.MeshLambertMaterial({ color: col ? new THREE.Color(col) : s.color?.clone() ?? new THREE.Color("#ffffff"), map: s.map ?? null, side: s.side, alphaTest: s.alphaTest }));
    lamOf.set(m.uuid, l);
  }
  return l;
};

// ---------------- geometry pieces ----------------
const f32 = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
  return new THREE.Float32BufferAttribute(out, a.itemSize);
};
/** quad a,b,c,d counter-clockwise seen from its front; uv (u0,v0) at a, (u1,v1) at c */
export const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u1 = 1, v1 = 1, u0 = 0, v0 = 0) => {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 2, 3, 4, 5].flatMap(() => [n.x, n.y, n.z]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
  return g;
};
export const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 2].flatMap(() => [n.x, n.y, n.z]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  return g;
};
/** axis box from min to max, texture tiled every `tile` metres (0 = one image per face) */
export const boxGeo = (min: THREE.Vector3, max: THREE.Vector3, tile = 0, bottom = false) => {
  const [x0, y0, z0] = [min.x, min.y, min.z], [x1, y1, z1] = [max.x, max.y, max.z];
  const t = (a: number) => (tile ? a / tile : 1);
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const faces = [
    quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), t(w), t(h)),
    quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), t(w), t(h)),
    quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), t(d), t(h)),
    quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), t(d), t(h)),
    quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), t(w), t(d)),
  ];
  if (bottom) faces.push(quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), t(w), t(d)));
  return mergeGeometries(faces, false);
};

/** collects pieces by material and merges them into one static mesh per material */
export class Batch {
  private g = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const x = new THREE.BufferGeometry();
    x.setAttribute("position", f32(src.attributes.position));
    if (src.attributes.normal) x.setAttribute("normal", f32(src.attributes.normal)); else x.computeVertexNormals();
    x.setAttribute("uv", src.attributes.uv ? f32(src.attributes.uv) : new THREE.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    if (m) x.applyMatrix4(m);
    const l = this.g.get(mat);
    if (l) l.push(x); else this.g.set(mat, [x]);
  }
  addObject(o: THREE.Object3D, m: THREE.Matrix4) {
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.add(mesh.geometry, toLambert(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material), new THREE.Matrix4().multiplyMatrices(m, mesh.matrixWorld));
    });
  }
  build(parent: THREE.Object3D, cast = true) {
    for (const [mat, list] of this.g) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.g.clear();
  }
}

// ---------------- strands: box-section tube along a path, rebuilt in place ----------------
// chain-link template (MAT pass): a stadium-shaped ring tube in link space (x along the chain, y in the ring plane,
// z across), NS centre-line samples x NR tube sides, smooth normals (clean ink silhouettes, no facet creases)
const LNS = 16, LNR = 6;
type LinkT = { p: Float32Array; n: Float32Array; idx: number[]; pitch: number };
const linkTemplate = (h: number): LinkT => {
  const ow = h * 0.85, rb = ow * 0.14, ol = ow * 1.62, rc = ow / 2 - rb, hl = ol / 2 - rb - rc;
  const p = new Float32Array(LNS * LNR * 3), n = new Float32Array(LNS * LNR * 3), idx: number[] = [];
  for (let j = 0; j < LNS; j++) {
    const th = (2 * Math.PI * (j + 0.5)) / LNS, nx = Math.cos(th), ny = Math.sin(th);
    const cx = rc * nx + Math.sign(nx) * hl, cy = rc * ny;
    for (let k = 0; k < LNR; k++) {
      const ph = (2 * Math.PI * k) / LNR, cp = Math.cos(ph), sp = Math.sin(ph), o = (j * LNR + k) * 3;
      p[o] = cx + rb * cp * nx; p[o + 1] = cy + rb * cp * ny; p[o + 2] = rb * sp;
      n[o] = cp * nx; n[o + 1] = cp * ny; n[o + 2] = sp;
      const a = j * LNR + k, b = j * LNR + ((k + 1) % LNR), c = ((j + 1) % LNS) * LNR + ((k + 1) % LNR), d = ((j + 1) % LNS) * LNR + k;
      idx.push(a, d, c, a, c, b); // outward winding
    }
  }
  return { p, n, idx, pitch: ol - 4 * rb };
};

export class Strand {
  mesh: THREE.Mesh;
  private pos: Float32Array; private nor: Float32Array; private uv: Float32Array;
  private lt: LinkT | null = null; private maxLinks = 0;
  constructor(public n: number, public w: number, public h: number, mat: THREE.Material, public tile = 1, cast = true) {
    const g = new THREE.BufferGeometry();
    if (CHAIN_MATS.has(mat)) {
      // link mode: up to maxLinks interlocking links laid along the path every frame (draw range = links used)
      const lt = (this.lt = linkTemplate(h)), nv = LNS * LNR;
      this.maxLinks = 440;
      this.pos = new Float32Array(this.maxLinks * nv * 3); this.nor = new Float32Array(this.maxLinks * nv * 3); this.uv = new Float32Array(this.maxLinks * nv * 2);
      const idx = new Uint32Array(this.maxLinks * lt.idx.length);
      for (let l = 0; l < this.maxLinks; l++) for (let i = 0; i < lt.idx.length; i++) idx[l * lt.idx.length + i] = lt.idx[i] + l * nv;
      g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.setDrawRange(0, 0);
    } else {
      this.pos = new Float32Array(n * 12); this.nor = new Float32Array(n * 12); this.uv = new Float32Array(n * 8);
      g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
      const idx: number[] = [];
      for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) {
        const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = (i + 1) * 4 + ((k + 1) % 4), d = (i + 1) * 4 + k;
        idx.push(a, b, c, a, c, d);
      }
      g.setIndex(idx);
    }
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = cast; this.mesh.receiveShadow = true;
  }
  private T = new THREE.Vector3(); private S = new THREE.Vector3(); private N = new THREE.Vector3();
  /** link mode: links every `pitch` along the polyline, centred, alternating ring plane (vertical / horizontal) */
  private setLinks(pts: THREE.Vector3[], lt: LinkT) {
    const { T, S, N } = this, nv = LNS * LNR;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[cum.length - 1], count = Math.max(0, Math.min(this.maxLinks, Math.floor(total / lt.pitch)));
    const s0 = (total - (count - 1) * lt.pitch) / 2;
    let seg = 1;
    for (let l = 0; l < count; l++) {
      const s = s0 + l * lt.pitch;
      while (seg < pts.length - 1 && cum[seg] < s) seg++;
      const a = pts[seg - 1], b = pts[seg], u = (s - cum[seg - 1]) / Math.max(1e-6, cum[seg] - cum[seg - 1]);
      const px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u, pz = a.z + (b.z - a.z) * u;
      T.subVectors(b, a).normalize();
      S.set(-T.z, 0, T.x); // T x up
      if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
      S.normalize(); N.crossVectors(S, T).normalize();
      const odd = l % 2 === 1;
      // ring plane: (T, N) for even links, (T, S) for odd links; z (thickness) across it
      const yx = odd ? S.x : N.x, yy = odd ? S.y : N.y, yz = odd ? S.z : N.z;
      const zx = odd ? -N.x : S.x, zy = odd ? -N.y : S.y, zz = odd ? -N.z : S.z;
      const base = l * nv * 3;
      for (let v = 0; v < nv * 3; v += 3) {
        const x = lt.p[v], y = lt.p[v + 1], z = lt.p[v + 2], o = base + v;
        this.pos[o] = px + T.x * x + yx * y + zx * z;
        this.pos[o + 1] = py + T.y * x + yy * y + zy * z;
        this.pos[o + 2] = pz + T.z * x + yz * y + zz * z;
        const nx = lt.n[v], ny = lt.n[v + 1], nz = lt.n[v + 2];
        this.nor[o] = T.x * nx + yx * ny + zx * nz;
        this.nor[o + 1] = T.y * nx + yy * ny + zy * nz;
        this.nor[o + 2] = T.z * nx + yz * ny + zz * nz;
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, count * lt.idx.length);
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
  set(pts: THREE.Vector3[]) {
    if (this.lt) { this.setLinks(pts, this.lt); return; }
    const { T, S, N } = this;
    let len = 0;
    for (let i = 0; i < this.n; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      T.subVectors(b, a).normalize();
      S.crossVectors(T, V(0, 1, 0));
      if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
      S.normalize(); N.crossVectors(S, T).normalize();
      if (i) len += p.distanceTo(pts[Math.min(i - 1, pts.length - 1)]);
      for (let k = 0; k < 4; k++) {
        const sx = k === 0 || k === 3 ? -1 : 1, sy = k < 2 ? -1 : 1, j = (i * 4 + k) * 3;
        this.pos[j] = p.x + S.x * sx * this.w / 2 + N.x * sy * this.h / 2;
        this.pos[j + 1] = p.y + S.y * sx * this.w / 2 + N.y * sy * this.h / 2;
        this.pos[j + 2] = p.z + S.z * sx * this.w / 2 + N.z * sy * this.h / 2;
        const nx = S.x * sx + N.x * sy, ny = S.y * sx + N.y * sy, nz = S.z * sx + N.z * sy, nl = Math.hypot(nx, ny, nz);
        this.nor[j] = nx / nl; this.nor[j + 1] = ny / nl; this.nor[j + 2] = nz / nl;
        this.uv[(i * 4 + k) * 2] = k / 4; this.uv[(i * 4 + k) * 2 + 1] = len / this.tile;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.attributes.uv.needsUpdate = true;
  }
}

// ---------------- set dressing around the lens ----------------
/** a sight line of the film: from the lens toward the shot's subject, `len` along d (d has unit forward component) */
export type Ray = { o: THREE.Vector3; d: THREE.Vector3; len: number; core: boolean };

// ================= EGYPT SET (Spider-Man short) =================
// One place: a pyramid construction site on the Nile bank. Layout (metres, +z toward the river):
//   Great Pyramid (half built, stepped courses) centre (-38, -52), base 96, built height 52, sand ramp on its
//   river face; finished pyramid (-150, -120) and a far third (-235, -195) in the haze.
//   The Sphinx at (16, -34) facing +x (profile to the river cameras). Temple at (52, -18): pylons + column hall.
//   Twin obelisks at (30, 2) and (44, 2). Pharaoh's dais at (2, -14). Palms along the bank z ~ 48..56.
//   The Nile: z > 58, water at y = -0.4.

/** Egypt materials (two-tone Lambert via lam(), painted HD stone textures with sand palettes) */
export const egyptMats = () => ({
  limestone: lam("egLimestone", () => ({ map: stoneHD("egLimestone", ["#e3d3ac", "#d9c69c", "#eadbb6", "#cfb98d"], "#b3a077") })),
  sandstone: lam("egSandstone", () => ({ map: stoneHD("egSandstone", ["#dcbd8a", "#d0af77", "#e6ca9c", "#c4a26a"], "#a8895a") })),
  granite: lam("egGranite", () => ({ map: stoneHD("egGranite", ["#8d6a63", "#7d5c56", "#9a786f", "#6f504b"], "#59413d") })),
  sand: lam("egSand", () => ({ map: ctex("egSandTex", 1024, 1024, (g, r) => {
    g.fillStyle = "#e8cc96"; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) { g.fillStyle = ["#dfc088", "#f2dda6", "#d3b47c", "#ecd29e"][i % 4]; g.globalAlpha = 0.25 + r() * 0.4; g.fillRect(r() * 1024, r() * 1024, 2 + r() * 5, 2 + r() * 3); }
    g.globalAlpha = 1;
  }) })),
  mudbrick: lam("egMud", () => ({ map: stoneHD("egMud", ["#b98d5f", "#ac8156", "#c3986a", "#a0774e"], "#86603c") })),
  wood: lam("egWood", () => ({ map: beam() })),
  rope: lam("egRope", () => ({ color: "#a98a5a" })),
  gold: lam("egGold", () => ({ color: "#d9a83c" })),
  reed: lam("egReed", () => ({ color: "#7d9b4a" })),
});
export type EgyptMats = ReturnType<typeof egyptMats>;

const M4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(sx, sy, sz));

/** tapered box (pylon / obelisk shaft): quads between a base rect and a smaller top rect */
export const taperBox = (cx: number, cz: number, y0: number, y1: number, bw: number, bd: number, tw: number, td: number) => {
  const bx = bw / 2, bz = bd / 2, tx = tw / 2, tz = td / 2, u = bw / 5, v = (y1 - y0) / 5;
  return mergeGeometries([
    quad(V(cx - bx, y0, cz + bz), V(cx + bx, y0, cz + bz), V(cx + tx, y1, cz + tz), V(cx - tx, y1, cz + tz), u, v),
    quad(V(cx + bx, y0, cz - bz), V(cx - bx, y0, cz - bz), V(cx - tx, y1, cz - tz), V(cx + tx, y1, cz - tz), u, v),
    quad(V(cx - bx, y0, cz - bz), V(cx - bx, y0, cz + bz), V(cx - tx, y1, cz + tz), V(cx - tx, y1, cz - tz), u, v),
    quad(V(cx + bx, y0, cz + bz), V(cx + bx, y0, cz - bz), V(cx + tx, y1, cz - tz), V(cx + tx, y1, cz + tz), u, v),
    quad(V(cx - tx, y1, cz + tz), V(cx + tx, y1, cz + tz), V(cx + tx, y1, cz - tz), V(cx - tx, y1, cz - tz), u, u),
  ], false);
};

/** a smooth finished pyramid (distant silhouettes) */
const smoothPyramid = (cx: number, cz: number, base: number, h: number) => {
  const s = base / 2, apex = V(cx, h, cz);
  return mergeGeometries([
    tri(V(cx - s, 0, cz + s), V(cx + s, 0, cz + s), apex),
    tri(V(cx + s, 0, cz - s), V(cx - s, 0, cz - s), apex),
    tri(V(cx - s, 0, cz - s), V(cx - s, 0, cz + s), apex),
    tri(V(cx + s, 0, cz + s), V(cx + s, 0, cz - s), apex),
  ], false);
};

/** THE SPHINX — lion body in profile, human head with nemes, front paws stretched forward.
 *  Local space: faces +x, ground y=0, body length ~24 m, head top ~13 m. legs=8 builds the joke sphinx. */
export const makeSphinx = (mat: THREE.Material, legs = 4) => {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  // haunches: a big rounded rump at the back
  const haunch = new THREE.SphereGeometry(4.6, 20, 14); haunch.scale(1.25, 0.92, 0.78);
  add(haunch, -7.6, 3.6, 0);
  // long body + deep chest
  add(box(13.5, 5.4, 5.9), -1.2, 3.1, 0);
  add(box(4.6, 6.8, 6.1), 5.6, 3.6, 0);
  // front legs stretched forward along the ground + paws
  for (const s of [-1, 1]) {
    add(box(10.5, 1.9, 1.9), 9.6, 0.95, s * 1.7);
    add(box(2.6, 1.7, 2.2), 15.6, 0.85, s * 1.7);
    // toes: three grooves read as lines at the paw front (thin dark boxes)
    for (const t of [-0.5, 0.5]) add(box(0.18, 1.2, 0.3), 16.95, 0.8, s * 1.7 + t);
  }
  if (legs === 8) {
    // the joke build: three extra leg pairs lying along the flanks, unmistakably countable
    for (const s of [-1, 1]) for (const lx of [2.8, -1.4, -5.6]) {
      add(box(7.5, 1.7, 1.7), lx, 0.9, s * 3.6);
      add(box(2.2, 1.5, 1.9), lx + 4.6, 0.75, s * 3.6);
    }
  }
  // neck + human head with nemes headdress
  const neck = box(3.4, 5.2, 4.6); add(neck, 7.4, 7.6, 0);
  const head = new THREE.SphereGeometry(2.9, 20, 14); head.scale(1.02, 1.12, 0.86);
  add(head, 8.1, 11.6, 0);
  add(box(1.5, 1.1, 1.0), 10.6, 10.9, 0); // nose
  add(box(0.9, 2.2, 1.1), 9.9, 8.6, 0); // ceremonial beard
  const nemesTop = new THREE.CylinderGeometry(1.5, 3.6, 3.4, 4, 1); nemesTop.rotateY(Math.PI / 4);
  add(nemesTop, 7.9, 14.2, 0);
  for (const s of [-1, 1]) add(box(1.1, 5.4, 2.6), 6.9, 10.6, s * 2.6); // nemes side flaps
  // tail curled round the right haunch
  const tail = new THREE.TorusGeometry(3.4, 0.55, 8, 20, Math.PI * 0.9); tail.rotateX(Math.PI / 2); tail.rotateZ(0.4);
  add(tail, -9.5, 1.1, 2.6);
  return g;
};

/** a palm: trunk of stacked segments along a bendable curve; setBend(0..1) re-poses it (the hero gag) */
export const makePalm = (mat: THREE.Material, frondMat: THREE.Material, h = 9) => {
  const group = new THREE.Group();
  const segs: THREE.Mesh[] = [];
  const SEG = 6;
  for (let i = 0; i < SEG; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.30 - i * 0.02, 0.36 - i * 0.02, h / SEG + 0.15, 7), mat);
    m.castShadow = true; group.add(m); segs.push(m);
  }
  const crown = new THREE.Group(); group.add(crown);
  const frondGeo = new THREE.PlaneGeometry(4.6, 1.15, 6, 1);
  { // droop the frond tips
    const p = frondGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - Math.max(0, x) * Math.max(0, x) * 0.16); }
    frondGeo.computeVertexNormals();
  }
  for (let i = 0; i < 8; i++) {
    const f = new THREE.Mesh(frondGeo, frondMat);
    f.position.x = 2.1; f.rotation.z = -0.25;
    const holder = new THREE.Group(); holder.rotation.y = (i / 8) * Math.PI * 2 + 0.4; holder.rotation.x = 0;
    holder.add(f); f.castShadow = true;
    crown.add(holder);
  }
  for (const s of [-1, 1]) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mat);
    nut.position.set(0.3 * s, -0.4, 0.25 * s); crown.add(nut);
  }
  const setBend = (bend: number) => {
    // quadratic curve: base (0,0), control pulled sideways+down by bend, top follows
    const cx = -bend * h * 0.55, cy = h * (1 - bend * 0.28);
    let prev = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < SEG; i++) {
      const u = (i + 0.5) / SEG, w = 1 - u;
      const px = 2 * w * u * cx * 0.5 + u * u * cx, py = w * w * 0 + 2 * w * u * (h * 0.55) + u * u * cy;
      const pos = new THREE.Vector3(px, py, 0);
      const m = segs[i];
      m.position.copy(pos);
      const nxt = new THREE.Vector3(2 * (1 - (u + 0.5 / SEG)) * (u + 0.5 / SEG) * cx * 0.5 + (u + 0.5 / SEG) ** 2 * cx,
        (1 - (u + 0.5 / SEG)) ** 2 * 0 + 2 * (1 - (u + 0.5 / SEG)) * (u + 0.5 / SEG) * (h * 0.55) + (u + 0.5 / SEG) ** 2 * cy, 0);
      m.rotation.z = Math.atan2(nxt.x - prev.x, nxt.y - prev.y) * -1 || 0;
      m.rotation.z = -Math.atan2(nxt.x - pos.x, Math.max(0.01, nxt.y - pos.y));
      prev = pos;
      if (i === SEG - 1) { crown.position.copy(nxt); crown.rotation.z = m.rotation.z * 0.7; }
    }
  };
  setBend(0.06);
  return { group, setBend };
};

/** felucca: hull, mast, lateen sail (drifts on the Nile) */
export const makeFelucca = (wood: THREE.Material, linen: THREE.Material) => {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; g.add(m); return m;
  };
  add(new THREE.BoxGeometry(11, 1.1, 2.4), wood, 0, 0.55, 0);
  add(new THREE.BoxGeometry(2.6, 1.6, 2.0), wood, -5.6, 1.0, 0, 0.5);
  add(new THREE.BoxGeometry(2.6, 1.6, 2.0), wood, 5.6, 1.0, 0, -0.5);
  add(new THREE.CylinderGeometry(0.14, 0.18, 8.6, 7), wood, -0.5, 4.8, 0);
  const yard = add(new THREE.CylinderGeometry(0.09, 0.09, 12.5, 6), wood, 0.4, 6.4, 0, 0.62);
  yard.rotation.x = 0; 
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute("position", new THREE.Float32BufferAttribute([-4.6, 2.2, 0, 5.4, 9.6, 0, 4.9, 2.2, 0], 3));
  sailGeo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  sailGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 1, 1, 0], 2));
  sailGeo.setIndex([0, 1, 2]);
  const sail = new THREE.Mesh(sailGeo, linen); sail.castShadow = true; g.add(sail);
  return g;
};

/** the great block on its sledge (dynamic: world poses it along the ramp) */
export const makeBlock = (granite: THREE.Material, wood: THREE.Material, rope: THREE.Material) => {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(6.4, 0.5, 0.55), wood, 0, 0.25, s * 1.35);
  for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.55, 0.34, 3.6), wood, i * 1.45, 0.62, 0);
  add(new THREE.BoxGeometry(4.6, 3.1, 3.3), granite, 0, 2.35, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(4.75, 0.3, 3.45), rope, 0, 1.5 + s * 0.9, 0);
  return g;
};

/** all static set dressing merged into batches on the parent */
export const buildEgypt = (parent: THREE.Object3D, M: EgyptMats) => {
  const b = new Batch();
  const P = SITE.pyramid;
  // the Great Pyramid, half built: stepped courses, flat working top
  const ch = P.h / P.courses;
  for (let k = 0; k < P.courses; k++) {
    const s = P.base * (1 - (k / P.courses) * 0.62), y0 = k * ch;
    b.add(boxGeo(V(P.x - s / 2, y0, P.z - s / 2), V(P.x + s / 2, y0 + ch, P.z + s / 2), 7), k % 3 === 2 ? M.sandstone : M.limestone);
  }
  // loose blocks + a timber crane hint on the top platform
  b.add(boxGeo(V(P.x - 8, P.h, P.z - 4), V(P.x - 4.4, P.h + 2.2, P.z - 0.6), 3), M.limestone);
  b.add(boxGeo(V(P.x + 3, P.h, P.z + 2), V(P.x + 6.8, P.h + 1.8, P.z + 5.4), 3), M.granite);
  // finished + far pyramids
  b.add(smoothPyramid(-150, -120, 72, 45), M.sandstone);
  b.add(smoothPyramid(-238, -198, 54, 33), M.sandstone);
  // the construction ramp: a long sand wedge against the pyramid's river face
  const R = SITE.ramp;
  const ramp = mergeGeometries([
    quad(V(R.x - R.w / 2, R.botY, R.botZ), V(R.x + R.w / 2, R.botY, R.botZ), V(R.x + R.w / 2, R.topY, R.topZ), V(R.x - R.w / 2, R.topY, R.topZ), 4, 4),
    tri(V(R.x - R.w / 2, R.botY, R.botZ), V(R.x - R.w / 2, R.topY, R.topZ), V(R.x - R.w / 2, R.botY, R.topZ)),
    tri(V(R.x + R.w / 2, R.botY, R.botZ), V(R.x + R.w / 2, R.botY, R.topZ), V(R.x + R.w / 2, R.topY, R.topZ)),
  ], false);
  b.add(ramp, M.sand);
  // side retaining cheeks of the ramp
  b.add(boxGeo(V(R.x - R.w / 2 - 1.2, 0, R.topZ - 2), V(R.x - R.w / 2, 9, R.botZ), 5), M.mudbrick);
  b.add(boxGeo(V(R.x + R.w / 2, 0, R.topZ - 2), V(R.x + R.w / 2 + 1.2, 9, R.botZ), 5), M.mudbrick);
  // timber anchor frame at the ramp head: the restraint rope ties to its crossbeam
  // (crossbeam centre = the rope anchor point (R.x, 32.4, -14.5) used in world.ts)
  b.add(boxGeo(V(R.x - 3.4, 26.5, -14.9), V(R.x - 2.9, 32.6, -14.4), 2), M.wood);
  b.add(boxGeo(V(R.x + 2.9, 26.5, -14.9), V(R.x + 3.4, 32.6, -14.4), 2), M.wood);
  b.add(boxGeo(V(R.x - 3.6, 32.15, -15), V(R.x + 3.6, 32.65, -14), 2), M.wood);
  // temple: platform, twin pylons with a gate gap, column hall behind
  const T = SITE.temple;
  b.add(boxGeo(V(T.x - 17, 0, T.z - 13), V(T.x + 17, 1.6, T.z + 13), 6), M.sandstone);
  b.add(taperBox(T.x - 8.5, T.z + 10, 1.6, 15.5, 9, 6, 6.5, 4.4), M.sandstone);
  b.add(taperBox(T.x + 8.5, T.z + 10, 1.6, 15.5, 9, 6, 6.5, 4.4), M.sandstone);
  b.add(boxGeo(V(T.x - 4.2, 1.6, T.z + 8.6), V(T.x + 4.2, 5.4, T.z + 11.4), 4), M.sandstone);
  for (const dx of [-11, -5.5, 0, 5.5, 11]) for (const dz of [-2, -8]) {
    const shaft = new THREE.CylinderGeometry(1.05, 1.3, 10.5, 10); shaft.translate(T.x + dx, 1.6 + 5.25, T.z + dz);
    b.add(shaft, M.sandstone);
    const cap = new THREE.CylinderGeometry(2.0, 1.05, 1.7, 10); cap.translate(T.x + dx, 1.6 + 10.5 + 0.85, T.z + dz);
    b.add(cap, M.sandstone);
  }
  b.add(boxGeo(V(T.x - 15, 13.4, T.z - 10.5), V(T.x + 15, 14.6, T.z + 0.5), 6), M.sandstone); // architrave
  b.add(boxGeo(V(T.x - 10, 1.6, T.z - 12.5), V(T.x + 10, 9.5, T.z - 10.5), 5), M.sandstone); // sanctuary
  // twin obelisks with gold pyramidions
  for (const O of SITE.obelisks) {
    b.add(boxGeo(V(O.x - 2.3, 0, O.z - 2.3), V(O.x + 2.3, 1.8, O.z + 2.3), 4), M.granite);
    b.add(taperBox(O.x, O.z, 1.8, 19.5, 2.5, 2.5, 1.35, 1.35), M.granite);
    const tip = new THREE.ConeGeometry(1.02, 1.6, 4); tip.rotateY(Math.PI / 4);
    b.add(tip, M.gold, M4(O.x, 20.3, O.z));
  }
  // pharaoh's dais + canopy poles
  const D = SITE.dais;
  b.add(boxGeo(V(D.x - 6.5, 0, D.z - 4.5), V(D.x + 6.5, 1.1, D.z + 4.5), 4), M.sandstone);
  b.add(boxGeo(V(D.x - 6.5, 1.1, D.z - 4.5), V(D.x + 6.5, 1.7, D.z - 1), 4), M.sandstone);
  for (const [px, pz] of [[-5.6, -3.6], [5.6, -3.6], [-5.6, 3.6], [5.6, 3.6]] as const) {
    const pole = new THREE.CylinderGeometry(0.14, 0.14, 4.6, 7); pole.translate(D.x + px, 1.1 + 2.3, D.z + pz);
    b.add(pole, M.wood);
  }
  b.add(boxGeo(V(D.x - 6.4, 5.7, D.z - 4.4), V(D.x + 6.4, 6.05, D.z + 4.4), 3), M.reed);
  // hieroglyph banner behind the throne (raised above the throne back): an instant Egypt marker in every dais shot
  {
    const C = { x: 14.8, z: -8.6 }, Y = 4.65, RY = Math.PI / 4;
    const ux = Math.cos(RY), uz = -Math.sin(RY); // band axis (NE)
    const nx = Math.sin(RY), nz = Math.cos(RY); // band normal (SE, toward the dais cameras)
    const bandM = lam("egBand", () => ({ color: "#6e452a" }));
    const goldM = lam("egGlyphGold", () => ({ color: "#d9a83c" }));
    const lapisM = lam("egGlyphLapis", () => ({ color: "#2c4a8a" }));
    const turqM = lam("egGlyphTurq", () => ({ color: "#3f8f7a" }));
    const boneM = lam("egGlyphBone", () => ({ color: "#e8e0cc" }));
    const blkM = lam("egGlyphBlk", () => ({ color: "#26221e" }));
    for (const s of [-3.5, 3.5]) {
      const px = C.x + ux * s, pz = C.z + uz * s;
      const pole = new THREE.CylinderGeometry(0.09, 0.11, 5.4, 7); pole.translate(px, 2.7, pz);
      b.add(pole, M.wood);
      const fin = new THREE.SphereGeometry(0.16, 10, 8); fin.translate(px, 5.5, pz);
      b.add(fin, goldM);
    }
    const band = new THREE.BoxGeometry(7.6, 1.2, 0.12); band.rotateY(RY); band.translate(C.x, Y, C.z);
    b.add(band, bandM);
    const put = (geo: THREE.BufferGeometry, mat: any, lx: number, dy = 0) => {
      geo.rotateY(RY); geo.translate(C.x + ux * lx + nx * 0.1, Y + dy, C.z + uz * lx + nz * 0.1);
      b.add(geo, mat);
    };
    const disc = (r: number) => { const d = new THREE.CylinderGeometry(r, r, 0.07, 18); d.rotateX(Math.PI / 2); return d; };
    const bar = (w: number, h: number, rz = 0) => { const g2 = new THREE.BoxGeometry(w, h, 0.07); if (rz) g2.rotateZ(rz); return g2; };
    put(disc(0.27), goldM, -2.85); // sun disc
    for (let rI = 0; rI < 3; rI++) for (let sI = 0; sI < 3; sI++) { // water zigzags
      const seg = bar(0.24, 0.07, (sI % 2 ? -1 : 1) * 0.5); seg.translate(-0.24 + sI * 0.24, -0.16 + rI * 0.16, 0);
      put(seg, turqM, -1.9);
    }
    { const eye = disc(0.28); eye.scale(1.45, 1, 1); put(eye, boneM, -0.95); put(disc(0.13), blkM, -0.95); // eye
      const brow = bar(0.62, 0.08, -0.12); brow.translate(0, 0.3, 0.01); put(brow, blkM, -0.95); }
    { const stem = bar(0.09, 0.55); stem.translate(0, -0.08, 0); put(stem, turqM, 0); // reed
      const leaf = new THREE.ConeGeometry(0.14, 0.34, 8); leaf.translate(0, 0.36, 0); put(leaf, turqM, 0); }
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) put(bar(0.58, 0.09, a), goldM, 0.95); // star
    { const body = new THREE.SphereGeometry(0.27, 12, 10); body.scale(1, 0.78, 0.4); put(body, lapisM, 1.9); // scarab
      const hd = disc(0.11); hd.translate(0, 0.3, 0); put(hd, lapisM, 1.9); }
    { put(bar(0.15, 0.6), goldM, 2.85); const rib = bar(0.04, 0.6); rib.translate(0, 0, 0.045); put(rib, blkM, 2.85); } // feather
  }
  // workers' huts, far east
  for (const [hx, hz, hw] of [[92, -58, 9], [104, -50, 7], [96, -70, 8], [110, -64, 6]] as const) {
    b.add(boxGeo(V(hx - hw / 2, 0, hz - hw / 2), V(hx + hw / 2, 3.1, hz + hw / 2), 4), M.mudbrick);
    b.add(boxGeo(V(hx - hw / 2 - 0.4, 3.1, hz - hw / 2 - 0.4), V(hx + hw / 2 + 0.4, 3.6, hz + hw / 2 + 0.4), 4), M.mudbrick);
    b.add(boxGeo(V(hx - 0.8, 0, hz + hw / 2 - 0.1), V(hx + 0.8, 1.9, hz + hw / 2 + 0.1)), lam("egDark", () => ({ color: "#2e2118" })));
  }
  // scattered blocks, sledges and rope coils near the ramp foot
  for (const [bx, bz, s] of [[-18, 10, 1], [-58, 6, 1.3], [-8, -2, 0.8], [14, 16, 1.1], [-64, -14, 0.9]] as const)
    b.add(boxGeo(V(bx, 0, bz), V(bx + 3.4 * s, 2.0 * s, bz + 2.8 * s), 3), M.limestone);
  b.build(parent);
};
