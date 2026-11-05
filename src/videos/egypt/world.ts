// The Egypt set as one three.js scene: sky, the Nile, sand, the half-built Great Pyramid with its ramp,
// the Sphinx (a real one: lion body, human head, profile), temple, obelisks, palms, the pharaoh's dais —
// posed per frame from story.ts (block slide, palm bend, webs, ropes). update(id, f, camera) is a pure
// function of shot id + frame, same contract as the bridge world.
import * as THREE from "three";
import { Batch, Strand, boxGeo, V, lam, buildEgypt, egyptMats, makeSphinx, makePalm, makeFelucca, makeBlock, Kit } from "./build";
import { ctex, waterNear, waterFar, cloudHD } from "./paint";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, camAt, egyptState, blockPos, webSegs, SMALL_BLOCK, SITE, V3, ShotDef } from "./story";

export const loadKit = (): Promise<Kit> => Promise.resolve({});

/** shot-specific sun overrides (az/el degrees) */
const SUN_SHOT: Record<number, { az?: number; el?: number }> = { 1: { az: -52, el: 15 }, 2: { az: 118 }, 11: { az: -48, el: 10 }, 12: { az: -40, el: 12 }, 14: { az: 150, el: 40 }, 15: { az: 150, el: 40 } };

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
const frondTex = () => ctex("frond", 512, 128, (g) => {
  g.clearRect(0, 0, 512, 128);
  g.strokeStyle = "#4a7d33"; g.lineWidth = 7; g.lineCap = "round";
  g.beginPath(); g.moveTo(4, 64); g.lineTo(508, 64); g.stroke();
  g.lineWidth = 5;
  for (let i = 0; i < 26; i++) {
    const x = 26 + i * 18, droop = 26 + (i / 26) * 30;
    g.strokeStyle = i % 2 ? "#558a3a" : "#497a30";
    g.beginPath(); g.moveTo(x, 64); g.quadraticCurveTo(x + 12, 64 - 34, x + 30, 64 - droop + 26); g.stroke();
    g.beginPath(); g.moveTo(x, 64); g.quadraticCurveTo(x + 12, 64 + 34, x + 30, 64 + droop - 26); g.stroke();
  }
});

function quadUp(x0: number, x1: number, z0: number, z1: number, u: number, v: number, y = 0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>;
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private block: THREE.Group;
  private smallBlock: THREE.Group;
  private sphinx2: THREE.Group;
  private scaffold: THREE.Group;
  private heroPalm: { group: THREE.Group; setBend: (b: number) => void };
  private felucca: THREE.Group;
  private ropes: Strand[] = [];
  private webs: THREE.Mesh[] = [];
  private webHalos: THREE.Mesh[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root;
    const M = egyptMats();
    // ---- sky + light rig (from the bridge world, unchanged machinery) ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    sky.renderOrder = -1; sky.frustumCulled = false; sky.layers.set(NOINK);
    R.add(sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }

    // ---- ground: sand plain, a green bank strip, the temple plaza, the sledge road ----
    const b = new Batch();
    b.add(quadUp(-700, 700, -700, 58, 175, 95), M.sand);
    b.add(quadUp(-700, 700, 52, 59.5, 175, 2), M.reed);
    b.add(quadUp(-700, 700, 56, 60, 175, 1, -0.35), M.sand); // bank slope into the water
    b.add(quadUp(28, 76, -34, 2, 8, 6, 0.02), M.sandstone); // temple plaza slabs
    b.add(quadUp(12, 26, -12, 2, 3, 4, 0.02), M.sandstone); // dais apron
    b.add(quadUp(-700, 700, 58, 400, 175, 85, -2.2), lam("nileBed", () => ({ color: "#14505e" }))); // river bed
    // the pharaoh's golden throne on the dais
    b.add(boxGeo(V(18.2, 1.7, -6.6), V(20.4, 2.5, -5.2), 1), M.gold);
    b.add(boxGeo(V(18.2, 1.7, -6.9), V(20.4, 4.6, -6.55), 1), M.gold);
    b.build(R);
    buildEgypt(R, M);

    // ---- the Sphinx, and the second sphinx (8 legs) by the temple ----
    const sphinxMat = lam("egSphinx", () => ({ color: "#dbbf8d" })); // flat statue stone: the silhouette must read, not ashlar
    const sphinx = makeSphinx(sphinxMat, 4);
    sphinx.position.set(SITE.sphinx.x, 0, SITE.sphinx.z);
    sphinx.rotation.y = -Math.PI / 2; // faces the river (+z): head and paws toward the site cameras
    sphinx.scale.setScalar(0.62); // ~18 m long: fits a portrait frame (the full-size build overflowed every shot)
    R.add(sphinx);
    this.sphinx2 = makeSphinx(sphinxMat, 8);
    this.sphinx2.position.set(56, 0, -37);
    this.sphinx2.rotation.y = 0.5;
    this.sphinx2.scale.setScalar(0.62);
    R.add(this.sphinx2);
    // scaffolding for the unfinished one (shot 14 only)
    this.scaffold = new THREE.Group();
    for (const [px, pz] of [[46, -30], [46, -42], [66, -30], [66, -42]] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 9.5, 7), M.wood);
      pole.position.set(px, 4.75, pz); pole.castShadow = true; this.scaffold.add(pole);
    }
    for (const pz of [-30, -42]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(21, 0.28, 1.6), M.wood);
      plank.position.set(56, 7.6, pz); plank.castShadow = true; this.scaffold.add(plank);
    }
    R.add(this.scaffold);

    // ---- palms ----
    const frondMat = lam("frond", () => ({ map: frondTex(), alphaTest: 0.45, side: THREE.DoubleSide }));
    this.heroPalm = makePalm(M.wood, frondMat, 9);
    this.heroPalm.group.position.set(SITE.heroPalm.x, 0, SITE.heroPalm.z);
    R.add(this.heroPalm.group);
    for (const [px, pz, ph] of [[-24, 51, 8], [4, 53, 10], [24, 50, 8.5], [58, 52, 9.5], [88, 49, 8], [-56, 50, 9], [40, -30, 8], [66, -27, 9], [-64, 20, 8.5], [18, 30, 7.5]] as const) {
      const p = makePalm(M.wood, frondMat, ph);
      p.setBend(0.05 + (px % 5) * 0.015);
      p.group.position.set(px, 0, pz);
      p.group.rotation.y = px * 1.7;
      R.add(p.group);
    }

    // ---- the Nile (the bridge river shader, recoloured by LOOK) ----
    const wNear = waterNear(), wFar = waterFar();
    for (const t of [wNear, wFar]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wTime: { value: 0 },
    };
    const waterM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", WATER_DECL)
        .replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    waterM.customProgramCacheKey = () => "nile1";
    const wm = new THREE.Mesh(quadUp(-700, 700, 58, 400, 1, 1, -0.4), waterM);
    wm.receiveShadow = true;
    R.add(wm);
    this.felucca = makeFelucca(M.wood, lam("sail", () => ({ color: "#f2e8d5", side: THREE.DoubleSide })));
    this.felucca.position.set(-30, -0.35, 82);
    R.add(this.felucca);

    // ---- dynamic props: the great block, the small block, ropes, webs ----
    this.block = makeBlock(M.granite, M.wood, M.rope);
    R.add(this.block);
    this.smallBlock = new THREE.Group();
    const sb = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 1.7), M.granite);
    sb.castShadow = true; sb.receiveShadow = true;
    this.smallBlock.add(sb);
    this.smallBlock.position.set(...SMALL_BLOCK);
    R.add(this.smallBlock);
    const ropeMat = lam("ropeStrand", () => ({ color: "#8a6f42" }));
    for (let i = 0; i < 4; i++) { const s = new Strand(20, 0.14, 0.14, ropeMat, 2); this.ropes.push(s); R.add(s.mesh); }
    // v2 (BUGS_V2 B6): webs must read BRIGHT on any background. In v1 they were layer-0 world
    // geometry, so the ink pass painted the thin cylinders solid near-black (its "thin ropes
    // become solid lines" rule) and they vanished against shadowed masonry. Now: NOINK layer
    // (never inked), a thicker white core, plus a soft additive halo for rim/readability.
    const webMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const webHaloMat = new THREE.MeshBasicMaterial({ color: "#dfe9ff", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), webMat);
      m.frustumCulled = false; m.visible = false; m.layers.set(NOINK);
      this.webs.push(m); R.add(m);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 8), webHaloMat);
      h.frustumCulled = false; h.visible = false; h.layers.set(NOINK);
      this.webHalos.push(h); R.add(h);
    }
  }

  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const ss = SUN_SHOT[id] ?? {};
    const az = THREE.MathUtils.degToRad(ss.az ?? L.az), el = THREE.MathUtils.degToRad(ss.el ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  private setBeam(m: THREE.Mesh, a: V3, b: V3) {
    const va = V(...a), vb = V(...b), mid = va.clone().add(vb).multiplyScalar(0.5);
    const d = vb.sub(va), len = d.length();
    m.position.copy(mid);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    m.visible = len > 0.05;
  }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], st = egyptState(t);
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1600; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    this.fill.intensity = 0;
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...LOOK[s.light].bounce); TONE.uSat.value = LOOK[s.light].sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.skyMat && ((this.root.children[0] as THREE.Mesh).position.copy(cam.position));
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = id === 2 ? 520 : L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    const W = this.WU, wc = K.water;
    untone(wc.near, W.wNearC.value); untone(wc.mid, W.wMidC.value); untone(wc.far, W.wFarC.value);
    untone(wc.crest, W.wCrest.value); untone(wc.trough, W.wTrough.value); untone(wc.glint, W.wGlint.value);
    W.wShade.value.set(...wc.shade); W.wTime.value = t;

    // ---- dynamics ----
    this.felucca.position.x = -60 + ((t * 1.1) % 150);
    this.felucca.position.y = -0.35 + Math.sin(t * 0.9) * 0.08;
    this.felucca.rotation.z = Math.sin(t * 0.7) * 0.02;
    this.heroPalm.setBend(0.05 + st.palmBend * 0.95);
    const bp = blockPos(st.blockU);
    this.block.position.set(bp[0] + (st.blockShake ? Math.sin(t * 47) * 0.05 * st.blockShake : 0), bp[1], bp[2]);
    this.block.rotation.z = st.blockShake ? Math.sin(t * 39) * 0.006 * st.blockShake : 0;
    this.smallBlock.rotation.z = THREE.MathUtils.degToRad(st.smallWob);
    this.sphinx2.visible = id >= 14;
    this.scaffold.visible = id === 14;
    // ropes: [0] restraint (before snap) / [1..2] the parted ends (after) / [3] guide rope to the crew
    const top = V(bp[0], bp[1] + 3.9, bp[2] - 1.4), anchor = V(SITE.ramp.x, 32.4, -13.5);
    const sag = (a: THREE.Vector3, b: THREE.Vector3, dip: number, n = 21) =>
      Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return a.clone().lerp(b, u).add(V(0, -dip * 4 * u * (1 - u), 0)); });
    if (!st.snapped) {
      this.ropes[0].set(sag(anchor, top, 0.35)); this.ropes[0].mesh.visible = true;
      this.ropes[1].mesh.visible = this.ropes[2].mesh.visible = false;
    } else {
      this.ropes[0].mesh.visible = false;
      const mid = anchor.clone().lerp(top, 0.45); mid.y -= 2.6;
      this.ropes[1].set(sag(anchor, mid, 0.5)); this.ropes[1].mesh.visible = true;
      this.ropes[2].set(sag(top, mid.clone().add(V(0.4, -0.7, 0.3)), 0.4)); this.ropes[2].mesh.visible = true;
    }
    const crewHand = V(SITE.ramp.x - 2.4, 1.15, bp[2] + 9.2);
    this.ropes[3].set(sag(V(bp[0] - 1.4, bp[1] + 0.8, bp[2] + 1.8), crewHand, 0.5));
    this.ropes[3].mesh.visible = id === 2 || id === 3 || id === 8 || id === 13;
    // webs (+ their halos follow the same beams)
    const segs = webSegs(id, t);
    this.webs.forEach((m, i) => { if (i < segs.length) this.setBeam(m, segs[i].a, segs[i].b); else m.visible = false; });
    this.webHalos.forEach((m, i) => { if (i < segs.length) this.setBeam(m, segs[i].a, segs[i].b); else m.visible = false; });

    // ---- cast ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
       const stg = stage(id, t, { pos: cam.position, right, sun: sunDir });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const tint = s.light === "golden" ? "#ffcf9e" : "#ffffff";
    let ai = 0;
    const used: Actor[] = [];
    for (const p of stg.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      if (a.mat.emissiveMap) a.mat.emissive.set(tint);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of stg.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e = this.fx(fi++);
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      fused.push(e);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e of fused) e.bind();
    return focus;
  }
}

const WATER_DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex;
uniform float wTime;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(0.35 * wTime, 0.0);
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  diffuseColor.rgb = wc;`;
