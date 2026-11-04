// "What if Spider-Man ended up in Ancient Egypt?" — flat character cards in a painted three.js world.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts).
// POST CHAIN (manual): the postprocessing EffectComposer renders nothing under this machine's
// SwiftShader, so the chain is driven by hand in a priority useFrame:
//   scene -> HalfFloat RT (with depth texture) -> InkPass (ink.ts, world outlines) -> FinalPass
//   (finalpass.ts: Khronos neutral tone mapping + the grade.ts colour grade) -> screen.
// DOF/bloom from the template are dropped (fog carries the depth cueing; the sun sprites still glow
// by size). Place changes crossfade by stacking a second canvas for the fade frames; the hook ends
// on a 4-frame white flash.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree, useFrame } from "@react-three/fiber";
import { World, loadKit } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { FinalPass } from "./finalpass";
import { Kit } from "./build";
import { TOTAL, FLASH_AT, SHOTS, layersAt } from "./story";

export const BRIDGE_FRAMES = TOTAL;

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
type PostToggles = { ink: boolean; grade: boolean; bare: boolean };
const toggles = (): PostToggles => ({ ink: true, grade: true, bare: false, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("bridge kit"));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const Inner: React.FC<{ id: number; kit: Kit }> = ({ id, kit }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => new World(kit), [kit]);
  const on = useMemo(toggles, []);
  const cam = camera as THREE.PerspectiveCamera;
  const chain = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1080, 1920, { type: THREE.HalfFloatType });
    rt.depthTexture = new THREE.DepthTexture(1080, 1920);
    return { rt, ink: new InkPass(scene, cam), fin: new FinalPass(), w: 0, h: 0 };
  }, [scene, cam]);
  useEffect(() => () => { chain.ink.dispose(); chain.rt.dispose(); chain.fin.dispose(); }, [chain]);
  world.update(id, f, cam, scene);
  noInkFallback(world.root);
  useFrame(({ gl }) => {
    if (on.bare) { gl.setRenderTarget(null); gl.render(scene, cam); return; }
    const size = new THREE.Vector2();
    gl.getDrawingBufferSize(size);
    if (chain.w !== size.x || chain.h !== size.y) {
      chain.w = size.x; chain.h = size.y;
      chain.rt.setSize(size.x, size.y);
      chain.ink.setSize(size.x, size.y);
    }
    gl.setRenderTarget(chain.rt);
    gl.render(scene, cam);
    if (on.ink) {
      chain.ink.setDepthTexture(chain.rt.depthTexture as THREE.DepthTexture);
      chain.ink.render(gl, chain.rt);
    }
    chain.fin.setLight(SHOTS[id - 1].light);
    chain.fin.setGrade(on.grade);
    chain.fin.render(gl, chain.rt);
  }, 1);
  return <primitive object={world.root} dispose={null} />;
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; kit: Kit; alpha: number }> = ({ id, kit, alpha }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} kit={kit} />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const BridgeShort: React.FC = () => {
  const f = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const flash = f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} kit={kit} alpha={l.alpha} />)}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
    </AbsoluteFill>
  );
};
