# STICK ARENA — 2.5D Martial Arts Simulation

**Full self-contained game:** [`stickman-arena-sim.html`](stickman-arena-sim.html). HTML5 Canvas + vanilla JS only. No assets, fonts, libraries, or network dependency. Open the file directly or serve this folder.

The previous 2.5D ring, X/Z hit geometry, stamina, ultra states, Drama Director, Web Audio, seeded auto-loop, recording HUD, aspect switch, and camera effects remain. The old five-skill/two-slot system and glowing-stickman renderer have been replaced by adaptive tagged loadouts and a hierarchical, flat-outfit bone rig.

## Recording and URL controls

| Key | Function |
|---|---|
| **H** | Clean recording: hide cursor, instructions, and HUD |
| **M** | Mute/unmute synthesized audio |
| **A** | Toggle 9:16 / 16:9 |
| **Space** | Pause |
| **B** | Skeleton overlay: bones, joints, and joint names |
| **X** | Cyan per-limb hurt capsules, red active strike capsules, yellow contact marker |
| **F3** | AI state, IQ, memory, FPS and camera diagnostics |

Click once before recording to unlock browser audio.

```text
?a=Taekwondo&b=Boxing&loadoutA=1,4,7&loadoutB=0,2&seed=123&w=16:9&t=55&wm=@YourHandle
```

- `a`, `b`: martial art ID.
- `loadoutA`, `loadoutB`: zero-based pool indices. A fighter may have two or three slots; extra supplied indices are ignored.
- `slotsA`, `slotsB`: backward-compatible aliases.
- `seed`: deterministic matchup and AI decisions.
- `w=16:9`: landscape; default is portrait.
- `t=25`–`60`: match limit; default 55 seconds.
- `wm`: watermark.
- `test=30`: run the full in-browser test suite and print results to console.

## Adaptive skill loadouts

Each art has **9–10 real techniques**. Every technique has a stable ID, tags, animation ID, damage, stamina cost, wind-up/active/recovery, X/Z coverage, cooldown, shape, and hit effects.

The AI initially builds a synergistic kit from roles such as **rush, anti-rush, ranged, counter, combo-starter, finisher, defense**. It does not simply select random moves. Opponent aggression and the current tactical role influence kit choice.

A used skill goes on cooldown by **skill ID**, not by slot. Unequipped cooldowns continue ticking. When ready, or after failed approaches or an unsuitable matchup, the AI may replace a slot. A swap is an explicit **0.8-second stance change**, costs **8 stamina**, has a visible tell and HUD label, and has a **3.5-second dwell time**. It cannot change an attack already in progress or reset cooldowns. Orthodox/southpaw lead stances switch separately from world facing.

## Technique pools — tags and animation IDs

Notation: `index Technique [tags] {animation}`.

### Taekwondo — loadout size 2
0 Ap Chagi [rush, combo-starter] {frontKick} · 1 Dollyeo Chagi [finisher, anti-rush] {roundhouse} · 2 Yeop Chagi [ranged, anti-rush] {sideKick} · 3 Jireugi [combo-starter] {cross} · 4 Olgul Makgi [defense] {highBlock} · 5 Neryo Chagi [finisher, combo-starter] {highKick} · 6 Bandae Dollyeo Chagi [counter, anti-rush] {roundhouse} · 7 Momtong Makgi [defense] {blockMid} · 8 Dwi Chagi [finisher, rush] {spinKick}

### Boxing — loadout size 2
0 Cross [rush, combo-starter] {cross} · 1 Lead Hook [finisher, anti-rush] {hook} · 2 Uppercut [ranged, anti-rush] {uppercut} · 3 Overhand Right [combo-starter] {overhand} · 4 Shoulder Roll [counter, anti-rush] {shoulderRoll} · 5 Liver Shot [combo-starter, anti-rush] {bodyPunch} · 6 Check Hook [counter, anti-rush] {hook} · 7 Peekaboo Guard [defense] {guard} · 8 Dempsey Roll [rush, finisher] {dashPunch} · 9 Step Back Counter [defense, counter] {dodge}

### Wrestling — loadout size 2
0 Double-Leg Shot [rush, combo-starter] {shoot} · 1 Suplex [finisher, anti-rush] {suplex} · 2 Fireman's Carry [ranged, anti-rush] {carry} · 3 Clinch Slam [combo-starter] {clinch} · 4 Sprawl [counter, anti-rush] {sprawl} · 5 Single-Leg Takedown [rush, combo-starter] {shoot} · 6 Arm Drag [combo-starter, anti-rush] {armDrag} · 7 Ankle Pick [anti-rush, finisher] {anklePick} · 8 Belly-to-Belly Throw [finisher] {suplex} · 9 Headlock Counter [counter, defense] {headlock}

### Muay Thai — loadout size 2
0 Teep [rush, combo-starter] {teep} · 1 Clinch Knee [finisher, anti-rush] {knee} · 2 Horizontal Elbow [ranged, anti-rush] {elbow} · 3 Low Kick [combo-starter] {lowKick} · 4 Long Guard [defense] {longGuard} · 5 Switch Kick [ranged, combo-starter] {roundhouse} · 6 Superman Punch [rush, finisher] {dashPunch} · 7 Upward Elbow [anti-rush, combo-starter] {uppercut} · 8 Spear Knee [finisher, anti-rush] {knee} · 9 Catch and Sweep [counter, defense] {sweepKick}

### Judo — loadout size 2
0 O-Soto-Gari [rush, combo-starter] {trip} · 1 Uchi-Mata [finisher, anti-rush] {hipThrow} · 2 Tomoe-Nage [ranged, anti-rush] {sacrifice} · 3 Tai-Otoshi [combo-starter] {bodyDrop} · 4 Grip Break [counter, anti-rush] {gripBreak} · 5 Ko-Uchi-Gari [combo-starter, anti-rush] {trip} · 6 Harai-Goshi [finisher] {hipThrow} · 7 Sasae-Tsurikomi-Ashi [ranged, anti-rush] {footSweep} · 8 Seoi-Nage [finisher, combo-starter] {shoulderThrow} · 9 Kuzushi Feint [counter, defense] {feint}

### Karate — loadout size 2
0 Mae Geri [rush, combo-starter] {frontKick} · 1 Gyaku-Zuki [finisher, anti-rush] {cross} · 2 Shuto-Uchi [ranged, anti-rush] {knifeHand} · 3 Mawashi Geri [combo-starter] {roundhouse} · 4 Gedan Barai [counter, anti-rush] {lowBlock} · 5 Yoko Geri [ranged, anti-rush] {sideKick} · 6 Ushiro Geri [finisher] {spinKick} · 7 Uraken Uchi [combo-starter] {backfist} · 8 Jodan Age Uke [defense] {highBlock} · 9 Kizami Tsuki Feint [counter, defense] {feint}

### Capoeira — loadout size 3
0 Martelo [rush, combo-starter] {roundhouse} · 1 Meia Lua de Compasso [finisher, anti-rush] {spinKick} · 2 Aú [ranged, anti-rush] {cartwheel} · 3 Rolê [defense] {role} · 4 Esquiva [counter, anti-rush] {esquiva} · 5 Queixada [combo-starter, ranged] {gingaKick} · 6 Armada [finisher] {spinKick} · 7 Rasteira [anti-rush, combo-starter] {sweepKick} · 8 Ginga Evasive [defense] {ginga} · 9 Voo do Morcego [rush, finisher] {dashKick}

### Kung Fu — loadout size 3
0 Dragon Tail Sweep [rush, combo-starter] {sweepKick} · 1 Tiger Claw [finisher, anti-rush] {claw} · 2 Crane Beak [ranged, anti-rush] {crane} · 3 Monkey Roll [defense] {role} · 4 Snake Strike [counter, anti-rush] {snake} · 5 Leopard Punch [combo-starter, rush] {leopard} · 6 Butterfly Kick [finisher, ranged] {spinKick} · 7 Iron Bridge [counter, defense] {ironBridge} · 8 Drunken Step [defense, counter] {drunken} · 9 Palm Heel Rush [rush, finisher] {dashPunch}

All numerical combat values are in the top-level `FIGHTERS` and `EXTRA_SKILLS` lists in the HTML.

## Bone rig and animation

Hierarchy:

```text
pelvis → spine → chest → neck → head
chest → shoulderL/R → upperArmL/R → forearmL/R → handL/R
pelvis → hipL/R → thighL/R → shinL/R → footL/R
```

`BONES` defines length and thickness for each bone. `fkBone` accumulates parent transforms for forward kinematics. `solveTwoBone` performs analytic two-bone IK for striking hands/feet and floor targets. `plantTargets` stores world-space foot anchors: a planted foot does not slide when the pelvis moves; stepping updates the anchor only during the stride. Strike reach is model-space/world-space, independent of camera zoom and aspect. Hands, forearms, shins, and feet have constant-length connected geometry. Active strikes use the visible limb's capsule against per-limb hurt capsules, with swept samples and one hit per target per action. `X` visualizes those same capsules.

The simulation samples poses at fixed 1/60-second steps and caches them for rendering. It does not use camera pixels or rendering frequency to determine combat outcomes. A knockdown is a grounded connected pose, followed by a blended get-up; death retains a stable losing body.

Hand strikes use a direct constant-length shoulder/elbow/wrist chain with a shoulder-level target and a visible active-arm draw order. Front and roundhouse kicks use a forward knee branch and target-directed foot. Knee strikes have a dedicated raised-knee chain, and low kicks target the lower leg with a separate low-line path. Support soles are horizontal from the ankle; a planted foot is never used to overwrite a striking leg. Low hits buckle the leg, while head/body hits recoil the torso. Ground planting is disabled during down/death so it cannot pull a falling body upright.

Poses use local radians. The main arm angles are measured away from the downward rest direction; positive leg angles swing the thigh forward. `spine` and `head` are lean angles. `rootX` and `rootY` are local pixel offsets. Pose blending interpolates joint angles and root offsets between anticipation, active, and recovery.

### Pose-angle table

These are representative active poses. Each listed entry also has wind-up and recovery data in `POSES`.

| Animation | spine | upperArmR | forearmR | thighR | shinR | rootY | Face |
|---|---:|---:|---:|---:|---:|---:|---|
| idle | 0.04 | 0.42 | -0.64 | 0.13 | -0.10 | -2 | blank |
| orthodox | 0.04 | 0.42 | -0.68 | 0.13 | -0.10 | 0 | blank |
| southpaw | 0.04 | 0.35 | -0.70 | 0.13 | -0.10 | 0 | blank |
| run | 0.28 | 0.42 | -0.64 | -0.65 | -0.10 | 0 | blank |
| guard | 0.04 | 0.80 | -1.10 | 0.13 | -0.10 | 0 | blank |
| high block | 0.04 | 0.60 | -1.70 | 0.13 | -0.10 | 0 | blank |
| dodge / sidestep | -0.45 | 0.42 | -0.64 | 0.13 | -0.10 | 10 | blank |
| jump | 0.04 | 0.42 | -0.64 | 0.70 | -1.30 | -12 | blank |
| jab | 0.13 | 0.42 | -0.64 | 0.13 | -0.10 | 0 | narrow |
| cross / straight | 0.20 | 1.50 | 0.00 | 0.13 | -0.10 | 0 | determined |
| hook | 0.30 | 0.42 | -0.64 | 0.13 | -0.10 | 0 | focused |
| uppercut | 0.04 | 2.25 | -0.10 | 0.13 | -0.10 | -4 | determined |
| front kick | -0.15 | 0.42 | -0.64 | 1.45 | 0.00 | 0 | determined |
| roundhouse | -0.42 | 0.42 | -0.64 | 1.10 | -0.55 | 0 | focused |
| side kick | -0.40 | 0.42 | -0.64 | 1.60 | 0.00 | 0 | determined |
| high kick | -0.50 | 0.42 | -0.64 | 2.12 | 0.00 | 0 | focused |
| spin kick | 0.35 | 0.42 | -0.64 | 1.40 | 0.00 | 0 | focused |
| knee | -0.18 | 0.42 | -0.64 | 1.00 | -1.65 | 0 | focused |
| elbow | 0.28 | 1.30 | -1.10 | 0.13 | -0.10 | 0 | focused |
| grab / throw | 0.75 | 1.35 | -0.10 | 0.13 | -0.10 | 12 | focused |
| light hit | -0.25 | 0.42 | -0.64 | 0.13 | -0.10 | 0 | pain |
| heavy hit | -0.50 | 0.42 | -0.64 | 0.13 | -0.10 | 0 | pain |
| dizzy | 0.18 | 0.42 | -0.64 | 0.13 | -0.10 | 12 | dizzy |
| knockdown | 1.45 | 0.42 | -0.64 | 0.13 | -0.10 | 65 | dizzy |
| get-up | 0.50 | 0.42 | -0.64 | 0.13 | -0.10 | 12 | determined |
| ultra tornado | 0.30 | 1.40 | -0.64 | 1.50 | -0.10 | 0 | focused |

`face:'focused'` renders the focused-angry expression; `narrow` is narrow-eyed; `determined` is determined; `blank` is idle/guard; `pain` and `dizzy` cover hit/stun states. Only ultra states, impact flashes, and effects use glow. Base characters use black outlines and flat fills.

Outfits are defined in `OUTFITS`: white/light-grey gi with V collar, wide pants, belt knot/tails for gi arts; boxer shorts and gloves; wrestler singlet; Muay Thai shorts/wraps; judo/karate belts; capoeira pants; kung-fu jacket and sash. Each fighter has one accent color.

## Battle IQ

IQ is a normalized 0–100 profile, separate from personality. It controls reaction delay, perception, spacing, defense, punish selection, memory depth, adaptation, feint probability, discipline, and mistakes. The personality adjusts weights for aggression, circling, blocking, dodging, and retreat stamina.

The AI reads distance on X/Z, enemy startup/recovery/stamina and ring edges, remembers up to eight opponent actions, adapts after two blocked/dodged approaches, selects kits against rusher styles, preserves finishers for openings, manages stamina, and can feint. Feints cancel at 62% of startup and cannot deal damage. All decisions use the match RNG.

### Measured IQ balance

**96 mirrored matches**, each art against itself, **IQ 96 versus IQ 22**, with high IQ assigned to both sides equally. Same-art tests remove style-matchup bias; outcomes are not scripted.

| Profile | Reaction range (derived) | Perception / spacing | Defense | Punish | Memory | Mistake rate |
|---|---|---|---|---|---|---|
| IQ 96 | 0.239–0.309s | 0.796 | 0.777 | 0.717 | 8 actions | 5.2% |
| IQ 22 | 0.287–0.357s | 0.722 | 0.718 | 0.658 | 3 actions | 10.9% |

**Result: high IQ won 67 / 96 = 69.79%, within the requested 65–75% band.**

### Art-vs-art diagnostic

The expanded loadout catalog changes style balance; the older 35–65% target was not part of this upgrade. The current 224-match mirrored diagnostic is reported, not presented as passing:

| Art | Win rate |
|---|---:|
| Taekwondo | 44.64% |
| Boxing | 26.79% |
| Wrestling | 51.79% |
| Muay Thai | 82.14% |
| Judo | 62.50% |
| Karate | 53.57% |
| Capoeira | 33.93% |
| Kung Fu | 44.64% |

These numbers indicate future balance work, especially Muay Thai and Boxing; they are not hidden or presented as balanced.

## How to add a fighter, skill, animation, or outfit

### Fighter
Add a `FIGHTERS` entry with `id`, `name`, `art`, `color`, `stats`, `basic`, `skills`, `loadoutSize`, `personality`, `iq`, `outfit`, and `ultra`. Use 8–12 skills and add an entry to `QUEUE` for automatic looping. `FIGHTER_MAP` and roster-aware tests are generated from the list.

### Skill
Use the `skill()` helper:

```js
skill('Neryo Chagi','strike',31,24,.36,.13,.38,1.60,.66,6.7,
 'highKick',{down:.45,kb:1.0},'line',['finisher','combo-starter'])
```

Parameters: name, type, damage, stamina, startup, active, recovery, X range, Z tolerance, cooldown, animation, effects, shape, tags. Use a stable unique technique name; its ID is generated automatically. The same definition drives the AI, cooldowns, telegraphs, damage, and test fixtures.

### Animation
Add `windup`, `active`, and `recovery` pose data to `POSES`:

```js
highKick:anim(
 {thighR:.25,shinR:-1.4},
 {thighR:2.12,shinR:0,spine:-.5,face:'focused'},
 {thighR:.13,shinR:-.10,spine:.04}
)
```

Use `POSE_ALIAS` when an existing skill animation name maps to a shared pose. A new `anim` ID automatically resolves when a matching `POSES` entry exists. `samplePose` blends phases and `poseRig` computes FK/IK. The rig test suite validates every binding and finite joints, stationary feet, strike reach, and continuity.

### Outfit
Add an `OUTFITS` entry and set the fighter's `outfit` to that key. Choose `gi`, `shorts`, `singlet`, `gloves`, `wraps`, and/or `belt`. Extend `drawFighter` for a new silhouette detail. Use flat colors; the accent is drawn from the fighter, not hardcoded per outfit.

## Tactical AI and deception

The AI uses a utility score for range, depth, damage, stamina, cooldowns, opponent recovery, ring-edge pressure, repeated habits, and resource safety. It can perform a bounded low-HP retreat and re-engage, escape the ropes, vary rhythm, fake a retreat, cancel a feint into a real follow-up, and punish a remembered whiff during recovery. Feints do not grant free damage: the follow-up must make real capsule contact.

The standalone `tacticalScenarios()` test covers:

1. Low-HP retreat and re-engagement at IQ 30 and IQ 90.
2. Paired feint versus non-feinting opening exchanges, counting successful punishes.
3. Eight recovery/whiff-punish scenarios.
4. Six defensive matches with valid KO, decision, or draw endings within the clock.

## Verification

```cmd
"C:\Program Files\nodejs\node.exe" test-runner.cjs check
"C:\Program Files\nodejs\node.exe" test-runner.cjs bench
"C:\Program Files\nodejs\node.exe" test-runner.cjs tactics
"C:\Program Files\nodejs\node.exe" test-runner.cjs render
"C:\Program Files\nodejs\node.exe" test-runner.cjs test
```

The game itself does not require Node. The harness extracts and evaluates the inline game script in a small canvas-free sandbox. `test` includes queue matches, all technique/ultra/loadout/rig/lifecycle/collision/renderer fixtures, tactical scenarios, deterministic replay, aspect invariance, IQ balance, and mirrored balance. It exits nonzero for failed acceptance gates.

**Current measured core results:** all 79 technique contact fixtures, ultra/loadout/rig/lifecycle/collision fixtures, and renderer smoke tests pass; the final full-suite fixture count is **395/395**. Scripted tactical scenarios pass, including 16 feint follow-up punishes versus 7 baseline in the saved paired run, 8/8 whiff punishes, and retreat/re-engagement at both tested IQ levels.

See [`BUGFIX_REPORT.md`](BUGFIX_REPORT.md) for the complete defect log, exact motion parameters, final queue/balance results, visual evidence, and recording limitations. Balance is measured with seeds and side swaps; no 50/50 win-rate guarantee is implied.

The render cost and browser frame rate are measured separately from headless simulation; the embedded browser is not evidence of a mobile-device guarantee. `test-runner.cjs` and `_serve.ps1` are development-only utilities.
