// Final display pass, driven manually (the postprocessing EffectComposer renders nothing under this
// box's SwiftShader, so the chain is: scene -> RT -> InkPass -> this pass -> screen).
// Does exactly what the template's ToneMappingEffect(NEUTRAL) + GradeEffect did, in one shader:
// Khronos neutral tone mapping of the linear input, sRGB encode, the grade.ts curve/sat/tint/vignette
// math on the encoded values (identical formulas), output = graded sRGB values.
import * as THREE from "three";
import { GRADES, GRADE_STRENGTH, monoTangents, tintRGB } from "./grade";

const FRAG = /* glsl */ `
uniform sampler2D inputBuffer;
uniform float gradeKy[7];
uniform float gradeKm[7];
uniform vec3 gradeSat;
uniform vec3 gradeTintS;
uniform vec3 gradeTintM;
uniform vec3 gradeTintH;
uniform vec2 gradeVig;
uniform float gradeAmount;
varying vec2 vUv;

vec3 neutralTM(vec3 color) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 gradeEncode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float gradeHermite(float v, float x0, float x1, float y0, float y1, float m0, float m1) {
  float h = x1 - x0, t = (v - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2.0 * t3 - 3.0 * t2 + 1.0) * y0 + (t3 - 2.0 * t2 + t) * h * m0 + (-2.0 * t3 + 3.0 * t2) * y1 + (t3 - t2) * h * m1;
}
float gradeCurve(float v) {
  v = clamp(v, 0.0, 1.0);
  if (v < 0.1)  return gradeHermite(v, 0.0, 0.1, gradeKy[0], gradeKy[1], gradeKm[0], gradeKm[1]);
  if (v < 0.25) return gradeHermite(v, 0.1, 0.25, gradeKy[1], gradeKy[2], gradeKm[1], gradeKm[2]);
  if (v < 0.5)  return gradeHermite(v, 0.25, 0.5, gradeKy[2], gradeKy[3], gradeKm[2], gradeKm[3]);
  if (v < 0.75) return gradeHermite(v, 0.5, 0.75, gradeKy[3], gradeKy[4], gradeKm[3], gradeKm[4]);
  if (v < 0.9)  return gradeHermite(v, 0.75, 0.9, gradeKy[4], gradeKy[5], gradeKm[4], gradeKm[5]);
  return gradeHermite(v, 0.9, 1.0, gradeKy[5], gradeKy[6], gradeKm[5], gradeKm[6]);
}
void main() {
  vec3 lin = texture2D(inputBuffer, vUv).rgb;
  vec3 src = gradeEncode(neutralTM(lin));
  vec3 c = vec3(gradeCurve(src.r), gradeCurve(src.g), gradeCurve(src.b));
  const vec3 W = vec3(0.2126, 0.7152, 0.0722);
  float y = dot(c, W);
  float wS = 1.0 - smoothstep(0.0, 0.55, y);
  float wH = smoothstep(0.45, 1.0, y);
  float wM = 1.0 - wS - wH;
  float s = gradeSat.y + (gradeSat.x - gradeSat.y) * wS + (gradeSat.z - gradeSat.y) * wH;
  c = vec3(y) + s * (c - vec3(y));
  c += wS * gradeTintS + wM * gradeTintM + wH * gradeTintH;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p) * 0.70710678;
  c *= 1.0 - gradeVig.x * smoothstep(gradeVig.y, 1.0, r);
  c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(mix(src, c, gradeAmount), 1.0);
}`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FinalPass {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private light: string | null = null;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        inputBuffer: { value: null },
        gradeKy: { value: new Array(7).fill(0) }, gradeKm: { value: new Array(7).fill(0) },
        gradeSat: { value: new THREE.Vector3(1, 1, 1) },
        gradeTintS: { value: new THREE.Vector3() }, gradeTintM: { value: new THREE.Vector3() }, gradeTintH: { value: new THREE.Vector3() },
        gradeVig: { value: new THREE.Vector2(0, 0.45) }, gradeAmount: { value: 1 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
  setLight(light: "day" | "golden") {
    if (this.light === light) return;
    this.light = light;
    const p = GRADES[light], u = this.mat.uniforms;
    u.gradeKy.value = p.ky.slice();
    u.gradeKm.value = monoTangents(p.ky);
    (u.gradeSat.value as THREE.Vector3).set(...p.sat);
    u.gradeTintS.value = tintRGB(...p.tintS);
    u.gradeTintM.value = tintRGB(...p.tintM);
    u.gradeTintH.value = tintRGB(...p.tintH);
    (u.gradeVig.value as THREE.Vector2).set(...p.vig);
    u.gradeAmount.value = GRADE_STRENGTH[light];
  }
  setGrade(on: boolean) { this.mat.uniforms.gradeAmount.value = on ? (this.light ? GRADE_STRENGTH[this.light as "day" | "golden"] : 1) : 0; }
  render(renderer: THREE.WebGLRenderer, input: THREE.WebGLRenderTarget) {
    this.mat.uniforms.inputBuffer.value = input.texture;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }
  dispose() { this.mat.dispose(); }
}
