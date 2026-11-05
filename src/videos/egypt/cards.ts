// Egypt cast on the owner's locked rig, drawn with the toon Pen on the same 600x1000 design canvas
// (soles at y=975): oversized round head ~40% of the height with a very thick black outline, a SHORT flat
// torso block, thick stick limbs with rounded ends and no hands/feet, flat solid colours only.
// Spider-Man ports Pip's approved code design (src/spiderman/Spidey.tsx of the what-if studio):
// red mask + black web lines + two large white almond eyes, RED-dominant torso with web lines and the
// black spider emblem, blue only on the side wedges and legs, red arms.
// Egyptians keep the white rig head with the glyph face (two solid black bean eyes over one wide smile arc);
// the costume does the Egyptian reading: nemes headdress, gold collars, kilts, spear + oval shield.
import { Pen, INK, mul } from "./toon";

export const SPIDEY_RED = "#D8342C";
export const SPIDEY_BLUE = "#2456C8";
const GOLD = "#E3A81C";
const GOLD_D = "#B97F0E";
const LINEN = "#F2E8D5";
const LINEN_D = "#D9C9A3";
const BRONZE = "#B07A3F";
const SKIN_SHADOW = "#E8E0CC";

type P2 = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
/** direction in screen plane: 0 = down, +90 = screen right, 180 = up */
const dir = (a: number): P2 => [Math.sin(rad(a)), Math.cos(rad(a))];
const add = (p: P2, d: P2, l: number): P2 => [p[0] + d[0] * l, p[1] + d[1] * l];

export type Joints = {
  lean?: number;      // whole-body tilt, degrees (+ = top toward screen right)
  headTilt?: number;  // degrees
  armL?: [number, number]; // [shoulder angle, elbow bend]
  armR?: [number, number];
  legL?: [number, number]; // [hip angle, knee bend]
  legR?: [number, number];
  crouch?: number;    // 0..1 hip drop
};
const DEF: Required<Joints> = {
  lean: 0, headTilt: 0, armL: [-14, -8], armR: [14, 8], legL: [-7, 2], legR: [7, -2], crouch: 0,
};

/** two-segment limb; returns the end point. w = core width; the ink rim is drawn under the colour core. */
const limb = (p: Pen, root: P2, a1: number, l1: number, bend: number, l2: number, w: number, col: string): P2 => {
  const mid = add(root, dir(a1), l1);
  const end = add(mid, dir(a1 + bend), l2);
  p.line([root, mid, end], col, w, true);
  return end;
};

export type FigOpts = {
  j?: Joints;
  light?: number;
  expr?: "glyph" | "glyphWow" | "glyphFlat";
  /** web poses only: draw BOTH arms after the head, so a gripping hand is never painted over by the head disc */
  armsFront?: boolean;
};

/** canvas position of a hand (limb end) for a pose, exactly as figure() draws it (lean applied about the hip).
 *  Web origins are derived from this, so a web always starts at the drawn hand. */
export const handCanvas = (j: Joints, side: "L" | "R"): P2 => {
  const jj: Required<Joints> = { ...DEF, ...j };
  const F = frame(jj);
  const root = side === "R" ? F.shR : F.shL;
  const a = side === "R" ? jj.armR : jj.armL;
  const mid = add(root, dir(a[0]), 128);
  const end = add(mid, dir(a[0] + a[1]), 118);
  const dx = end[0] - F.hip[0], dy = end[1] - F.hip[1], c = Math.cos(rad(jj.lean)), s = Math.sin(rad(jj.lean));
  return [F.hip[0] + dx * c - dy * s, F.hip[1] + dx * s + dy * c];
};

/** skeleton geometry shared by every figure: returns anchors after applying lean about the hip point */
const frame = (j: Required<Joints>) => {
  const hipY = 640 + j.crouch * 130;
  const shY = 415 + j.crouch * 55;
  return {
    hip: [300, hipY] as P2,
    hipL: [252, hipY] as P2, hipR: [348, hipY] as P2,
    shL: [192, shY] as P2, shR: [408, shY] as P2,
    neck: [300, shY - 12] as P2,
    headC: [300, 208 - j.crouch * 10] as P2,
    headR: 182,
    torsoTop: shY - 28, torsoBot: hipY + 26,
  };
};

/** glyph face on the white rig head: two solid black bean eyes, one wide smile arc (owner's locked face) */
const glyphFace = (p: Pen, c: P2, r: number, kind: FigOpts["expr"] = "glyph", tilt = 0) => {
  p.g.save();
  p.g.translate(c[0], c[1]); p.g.rotate(rad(tilt)); p.g.translate(-c[0], -c[1]);
  for (const s of [-1, 1]) p.ell(c[0] + s * 63, c[1] - 16, 25, 39, INK, 0);
  if (kind === "glyphWow") {
    p.ell(c[0], c[1] + 74, 26, 32, INK, 0); // small round "o" mouth
  } else {
    p.arc(c[0], c[1] + 16, 96, 62, 25, 155, 13);
    if (kind === "glyphFlat") p.stroke([[c[0] - 88, c[1] + 62], [c[0] + 88, c[1] + 60]], 11);
  }
  p.g.restore();
};

/** the head base: a big white disc with the very thick ink ring, drawn under any mask/headdress */
const headBase = (p: Pen, c: P2, r: number, fill: string) => {
  p.ell(c[0], c[1], r, r * 0.97, fill, 0);
  p.g.beginPath(); p.g.arc(c[0], c[1], r - 7, 0, Math.PI * 2);
  p.g.lineWidth = 15; p.g.strokeStyle = INK; p.g.stroke();
};

/** web pattern clipped inside a disc (mask) */
const webPattern = (p: Pen, c: P2, r: number) => {
  const pts: P2[] = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  p.clip(pts, () => {
    p.g.strokeStyle = INK; p.g.globalAlpha = 0.55;
    for (const rr of [42, 82, 122, 162]) { p.g.lineWidth = 4.5; p.g.beginPath(); p.g.arc(c[0], c[1] - 12, rr, 0, Math.PI * 2); p.g.stroke(); }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      p.g.lineWidth = 4.5; p.g.beginPath(); p.g.moveTo(c[0], c[1] - 12);
      p.g.lineTo(c[0] + Math.cos(a) * (r + 6), c[1] - 12 + Math.sin(a) * (r + 6)); p.g.stroke();
    }
    p.g.globalAlpha = 1;
  });
};

/** spider emblem at (x, y), s = scale */
const emblem = (p: Pen, x: number, y: number, s = 1) => {
  p.g.save(); p.g.translate(x, y); p.g.scale(s, s);
  p.g.strokeStyle = INK; p.g.lineWidth = 5; p.g.lineCap = "round";
  for (const m of [-1, 1]) for (const [x0, y0, x1, y1] of [[-6, -8, -34, -28], [-8, 2, -40, -8], [-8, 12, -36, 30], [-5, 20, -22, 44]] as const) {
    p.g.beginPath(); p.g.moveTo(m * x0, y0); p.g.quadraticCurveTo(m * ((x0 + x1) / 2 + 6), (y0 + y1) / 2, m * x1, y1); p.g.stroke();
  }
  p.ell(0, 6, 10, 19, INK, 0);
  p.ell(0, -17, 7, 7, INK, 0);
  p.g.restore();
};

export type Costume = "spidey" | "pharaoh" | "guard" | "worker" | "priest";

/** one figure on the rig. Draw order: far arm, legs, torso (+costume), near arm, head (+costume). */
export const figure = (p: Pen, costume: Costume, o: FigOpts = {}) => {
  const j: Required<Joints> = { ...DEF, ...(o.j ?? {}) };
  const F = frame(j);
  p.g.save();
  p.g.translate(F.hip[0], F.hip[1]); p.g.rotate(rad(j.lean)); p.g.translate(-F.hip[0], -F.hip[1]);
  const armCol = costume === "spidey" ? SPIDEY_RED : costume === "pharaoh" || costume === "priest" ? LINEN : "#C89B6A";
  const legCol = costume === "spidey" ? SPIDEY_BLUE : costume === "priest" ? LINEN : "#C89B6A";
  let handL: P2 = [0, 0], handR: P2 = [0, 0];
  const drawArmL = () => { handL = limb(p, F.shL, j.armL[0], 128, j.armL[1], 118, 27, armCol); };
  const drawArmR = () => { handR = limb(p, F.shR, j.armR[0], 128, j.armR[1], 118, 27, armCol); };
  // far arm + legs (pharaoh/worker/guard: bare legs under the kilt; priest: robe-white legs)
  if (!o.armsFront) drawArmL();
  limb(p, F.hipL, j.legL[0], 148, j.legL[1], 158, 30, legCol);
  limb(p, F.hipR, j.legR[0], 148, j.legR[1], 158, 30, legCol);
  // torso block
  const tw = costume === "pharaoh" ? 300 : 262;
  const torso: P2[] = [[300 - tw / 2, F.torsoBot], [300 - tw / 2 + 14, F.torsoTop], [300 + tw / 2 - 14, F.torsoTop], [300 + tw / 2, F.torsoBot]];
  if (costume === "spidey") {
    p.poly(torso, SPIDEY_RED, 6);
    p.clip(torso, () => {
      p.poly([[300 - tw / 2, F.torsoTop - 6], [300 - tw / 2 + 52, F.torsoTop - 6], [300 - tw / 2 + 40, F.torsoBot + 6], [300 - tw / 2, F.torsoBot + 6]], SPIDEY_BLUE, 0);
      p.poly([[300 + tw / 2, F.torsoTop - 6], [300 + tw / 2 - 52, F.torsoTop - 6], [300 + tw / 2 - 40, F.torsoBot + 6], [300 + tw / 2, F.torsoBot + 6]], SPIDEY_BLUE, 0);
      p.g.strokeStyle = INK; p.g.globalAlpha = 0.5; p.g.lineWidth = 4;
      for (const x of [-54, -18, 18, 54]) { p.g.beginPath(); p.g.moveTo(300 + x, F.torsoTop - 4); p.g.quadraticCurveTo(300 + x + 6, (F.torsoTop + F.torsoBot) / 2, 300 + x, F.torsoBot + 4); p.g.stroke(); }
      for (const yy of [0.28, 0.55, 0.82]) { const y = F.torsoTop + (F.torsoBot - F.torsoTop) * yy; p.g.beginPath(); p.g.moveTo(300 - tw / 2, y); p.g.quadraticCurveTo(300, y + 16, 300 + tw / 2, y); p.g.stroke(); }
      p.g.globalAlpha = 1;
    });
    p.poly(torso, null, 6);
    emblem(p, 300, (F.torsoTop + F.torsoBot) / 2 - 6, 1.05);
  } else if (costume === "pharaoh") {
    // white kilt + bare chest with the wide gold collar: torso top is the collar, below it linen
    p.poly(torso, LINEN, 6);
    p.poly([[300 - tw / 2 + 14, F.torsoTop], [300 + tw / 2 - 14, F.torsoTop], [300 + tw / 2 - 34, F.torsoTop + 92], [300 - tw / 2 + 34, F.torsoTop + 92]], GOLD, 5);
    p.poly([[300 - tw / 2 + 40, F.torsoTop + 26], [300 + tw / 2 - 40, F.torsoTop + 26], [300 + tw / 2 - 52, F.torsoTop + 66], [300 - tw / 2 + 52, F.torsoTop + 66]], SPIDEY_BLUE, 0);
    p.ell(300, F.torsoTop + 46, 17, 17, "#2E7FA8", 3); // turquoise inlay bead
    // gold belt + pleated kilt front panel
    p.poly([[300 - tw / 2, F.torsoBot - 58], [300 + tw / 2, F.torsoBot - 58], [300 + tw / 2, F.torsoBot - 26], [300 - tw / 2, F.torsoBot - 26]], GOLD_D, 4);
    p.poly([[300 - 34, F.torsoBot - 26], [300 + 34, F.torsoBot - 26], [300 + 22, F.torsoBot + 44], [300 - 22, F.torsoBot + 44]], LINEN_D, 4);
  } else if (costume === "priest") {
    p.poly(torso, LINEN, 6);
    p.band([[300 - tw / 2 + 20, F.torsoTop + 8], [300 + 30, F.torsoBot - 30]], GOLD, 26, 3); // sash
  } else if (costume === "guard") {
    p.poly(torso, "#C89B6A", 6); // bare chest
    p.band([[300 - 90, F.torsoTop + 30], [300 + 96, F.torsoBot - 66]], BRONZE, 22, 3); // baldric strap
    p.poly([[300 - tw / 2, F.torsoBot - 52], [300 + tw / 2, F.torsoBot - 52], [300 + tw / 2 - 12, F.torsoBot + 30], [300 - tw / 2 + 12, F.torsoBot + 30]], LINEN, 5); // kilt
  } else {
    // worker: bare chest, plain kilt, some with a shoulder cloth
    p.poly(torso, "#C89B6A", 6);
    p.poly([[300 - tw / 2, F.torsoBot - 46], [300 + tw / 2, F.torsoBot - 46], [300 + tw / 2 - 10, F.torsoBot + 26], [300 - tw / 2 + 10, F.torsoBot + 26]], LINEN_D, 5);
  }
  // near arm
  if (!o.armsFront) drawArmR();
  // head
  const hc = F.headC, hr = F.headR;
  if (costume === "spidey") {
    p.ell(hc[0], hc[1], hr, hr * 0.97, SPIDEY_RED, 0);
    webPattern(p, hc, hr);
    p.g.beginPath(); p.g.arc(hc[0], hc[1], hr - 7, 0, Math.PI * 2); p.g.lineWidth = 15; p.g.strokeStyle = INK; p.g.stroke();
    p.g.save(); p.g.translate(hc[0], hc[1]); p.g.rotate(rad(j.headTilt)); p.g.translate(-hc[0], -hc[1]);
    for (const s of [-1, 1]) {
      p.g.save(); p.g.translate(hc[0] + s * 72, hc[1] - 22); p.g.rotate(rad(s * -16));
      p.poly([[-88, 10], [0, -76], [88, 10], [0, 48]], "#FFFFFF", 13);
      p.g.restore();
    }
    p.g.restore();
  } else {
    if (costume === "pharaoh") {
      // nemes headdress BEHIND the head: striped fan down both sides of the face
      for (const s of [-1, 1]) {
        const fan: P2[] = [[hc[0] + s * 40, hc[1] - hr - 26], [hc[0] + s * (hr + 42), hc[1] - hr * 0.35], [hc[0] + s * (hr + 30), hc[1] + hr * 0.95], [hc[0] + s * 96, hc[1] + hr * 0.8], [hc[0] + s * 70, hc[1] - hr * 0.4]];
        p.poly(fan, s < 0 ? GOLD : GOLD_D, 6);
      }
    }
    headBase(p, hc, hr, "#FFFFFF");
    if (costume === "pharaoh") {
      // nemes crown band over the top of the head, framing the glyph face
      const band: P2[] = [];
      for (let i = 0; i <= 20; i++) { const a = Math.PI * (1.06 + (i / 20) * 0.88); band.push([hc[0] + Math.cos(a) * (hr + 3), hc[1] + Math.sin(a) * (hr * 0.97 + 3)]); }
      for (let i = 20; i >= 0; i--) { const a = Math.PI * (1.06 + (i / 20) * 0.88); band.push([hc[0] + Math.cos(a) * (hr - 58), hc[1] + Math.sin(a) * (hr * 0.97 - 52)]); }
      p.clip(band, () => {
        p.poly(band, GOLD, 0);
        p.g.fillStyle = SPIDEY_BLUE;
        for (let x = -3; x < 8; x++) if (x % 2 === 0) p.g.fillRect(hc[0] + x * 52 - 13, hc[1] - hr - 20, 26, 130);
      });
      p.poly(band, null, 6);
      p.ell(hc[0], hc[1] - hr * 0.72, 15, 19, GOLD_D, 4); // uraeus disc
    } else if (costume === "guard" || costume === "worker") {
      // simple white headcloth: a band + drape behind one side
      const band: P2[] = [];
      for (let i = 0; i <= 16; i++) { const a = Math.PI * (1.08 + (i / 16) * 0.84); band.push([hc[0] + Math.cos(a) * (hr + 2), hc[1] + Math.sin(a) * (hr * 0.97 + 2)]); }
      for (let i = 16; i >= 0; i--) { const a = Math.PI * (1.08 + (i / 16) * 0.84); band.push([hc[0] + Math.cos(a) * (hr - 40), hc[1] + Math.sin(a) * (hr * 0.97 - 38)]); }
      p.poly(band, costume === "guard" ? GOLD : LINEN, 5);
    }
    glyphFace(p, hc, hr, o.expr ?? "glyph", j.headTilt);
  }
  // web poses: arms over the head, so the gripping hands stay visible and meet their webs
  if (o.armsFront) { drawArmL(); drawArmR(); }
  p.g.restore();
  return { handR, handL, headC: hc };
};

// ---------------- named poses ----------------
export const POSES = {
  spideyStand: { armR: [152, 6], armL: [-18, -10], legL: [-8, 2], legR: [8, -2], headTilt: -3 } as Joints,
  spideyFall: { lean: 18, armR: [140, 30], armL: [-120, -40], legL: [-38, 30], legR: [30, -24], headTilt: 8 } as Joints,
  spideyCrouch: { crouch: 0.85, armR: [38, 10], armL: [-30, -60], legL: [-52, 74], legR: [44, 58], headTilt: -4 } as Joints,
  spideySwing: { lean: -13, armR: [138, -4], armL: [52, 30], legL: [38, -48], legR: [-30, -18], headTilt: 5 } as Joints,
  spideyDrag: { lean: -12, crouch: 0.25, armR: [134, -1], armL: [-172, 8], legL: [-34, 8], legR: [-18, 22], headTilt: -6 } as Joints,
  spideyWave: { armR: [150, 24], armL: [-24, -14], legL: [-10, 4], legR: [10, -4] } as Joints,
  spideyCatch: { crouch: 0.55, armR: [160, 10], armL: [-12, -8], legL: [-30, 40], legR: [26, 34], headTilt: -8 } as Joints,
  spideyFacepalm: { armR: [128, 118], armL: [-16, -10], legL: [-7, 2], legR: [7, -2], headTilt: 10 } as Joints,
  spideyTired: { lean: 5, armR: [24, 4], armL: [-24, -4], legL: [-6, 2], legR: [6, -2], headTilt: 15 } as Joints,
  spideyNod: { armR: [20, 10], armL: [-20, -10], legL: [-7, 2], legR: [7, -2], headTilt: 7 } as Joints,
  stand: { armR: [16, 8], armL: [-16, -8], legL: [-7, 2], legR: [7, -2] } as Joints,
  point: { armR: [88, 4], armL: [-16, -8], legL: [-7, 2], legR: [7, -2], headTilt: -3 } as Joints,
  cheer: { armR: [158, 14], armL: [-158, -14], legL: [-10, 3], legR: [10, -3] } as Joints,
  clap: { armR: [52, 66], armL: [-52, -66], legL: [-7, 2], legR: [7, -2] } as Joints,
  armsWide: { armR: [120, 10], armL: [-120, -10], legL: [-9, 2], legR: [9, -2], headTilt: -5 } as Joints,
  haul: { lean: 16, armR: [42, 6], armL: [36, -4], legL: [-16, 6], legR: [14, 10] } as Joints,
  kneel: { crouch: 0.7, armR: [30, 20], armL: [-24, -16], legL: [-64, 96], legR: [12, 6], headTilt: 12 } as Joints,
  bow: { lean: 26, armR: [8, 4], armL: [-8, -4], legL: [-6, 2], legR: [6, -2], headTilt: 16 } as Joints,
  carry: { armR: [164, 8], armL: [-164, -8], legL: [-9, 2], legR: [9, -2] } as Joints,
  hammerUp: { armR: [140, 20], armL: [-14, -8], legL: [-8, 2], legR: [8, -2] } as Joints,
  hammerDown: { armR: [70, 30], armL: [-14, -8], legL: [-8, 2], legR: [8, -2] } as Joints,
};

/** guard extras drawn over the figure: spear in the right hand line, big oval shield on the left */
export const guardGear = (p: Pen, j: Joints = POSES.stand) => {
  const F = frame({ ...DEF, ...j });
  // oval shield (left side)
  p.ell(120, 560, 88, 168, BRONZE, 9);
  p.ell(120, 560, 56, 122, mul(BRONZE, [1.12, 1.12, 1.12]), 0);
  p.ell(120, 560, 16, 16, GOLD_D, 4);
  // spear: long shaft + leaf blade, right side, planted
  p.line([[486, 210], [486, 962]], "#8A5A28", 13, true);
  p.poly([[486, 118], [508, 196], [486, 232], [464, 196]], "#C8CCD2", 6);
};
