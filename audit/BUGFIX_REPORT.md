# Stick Arena — Bugfix and ADD-ON 2 Report

**Build reviewed:** `stickman-arena-sim.html` (single-file HTML5 Canvas + vanilla JavaScript)  
**Review date:** 2026-11-06  
**Scope:** rig/IK, animation and models, real limb collision, lifecycle, tactical AI, ADD-ON 2, recording review.

## Executive status

The final measured run has **30/30 matches accepted**, **396/396 fixtures passing**, **deterministic replay passing**, **aspect invariance passing**, and **all scripted tactical scenarios passing**. The final command exited successfully. Balance is not uniform: the final mirror table is reported rather than presented as a 50/50 guarantee.

## Defect log and fixes

| Area | Defect found | Fix implemented | Verification |
|---|---|---|---|
| IK target coordinates | Strike targets mixed fighter-origin and joint-local coordinates, producing unreachable targets and missed high kicks. | Targets are expressed in the selected joint's local space and solved with analytic two-bone IK. | All 79 technique contact fixtures; high-kick and teep traces. |
| Limb selection | Name heuristics confused `upperArm`/`forearm` with legs and used a hand hitbox for some kicks. | Explicit animation-to-limb mapping with arm/leg metadata and correct lead/rear side selection. | Every technique in hit and non-overlap situations; browser strike review. |
| Zero-length endpoints | Hands and feet were endpoint points, so a “full limb” hitbox could collapse to a point. | Constant-length hand/foot segments are connected to forearm/shin. | Bone-length assertions and capsule alignment. |
| Joint bending | Some solver bend directions folded knees/elbows unnaturally. | Explicit bend selection and anatomical pose limits; targets clamp without stretching. | Rig fixtures and visual attack/reaction review. |
| Support-foot overwrite | Ground IK could replace the attacking leg with a planted-leg pose. | Support-leg IK skips the actual striking leg and runs in a separate pass. | Teep trace and fixed-step visual review. |
| Mirroring/depth | Camera/face assumptions and missing Z coordinates caused incorrect mirrored targets and phantom contacts. | Model-space geometry, locked action facing, 3D joint targets, and world-X/Y/Z capsule conversion. | Camera-independence, mirrored geometry, and 3D collision fixtures. |
| Collision tunneling | Fast limbs could skip contact between fixed frames. | Eight swept limb samples per fixed step with active-frame-only registration. | Swept-contact and once-per-swing tests. |
| Collision math | Segment-distance code needed explicit 3D and degenerate handling. | Symmetric closest-point calculation with zero-length and parallel-segment guards. | 2D/3D overlap, no-overlap, depth, and swept tests. |
| Counter contact | Counter retaliation could apply damage without a separate counter-limb overlap. | Counter limb is tested against the opponent's actual hurtboxes before damage. | Counter and full-suite checks; representative matches. |
| Feint timing | Feints cancelled before the opponent could react, or generic attacks stole the follow-up window. | Short read window, exclusive follow-up branch, committed-response selection, and approach-then-punish behavior. | Paired scripted feint experiment with real hits. |
| Retreat oscillation | Low-health bots repeatedly entered and left retreat. | One bounded reset/re-engagement cycle with stamina and edge awareness. | Scripted scenario at IQ 30 and IQ 90. |
| Recovery punishment | Whiff events did not reliably create a reachable follow-up. | Whiff memory wakes the bot, reserves a punish opportunity, and chooses a fast reachable attack. | 8/8 scripted recovery scenarios. |
| Passive matches | Defensive bots could stall without a meaningful finish. | Anti-stall pressure, final-exchange escalation, decision/draw resolution, and finite clocks. | Six defensive-match scenarios; timeout fixtures. |
| Get-up boundary | Floating-point down timer residue prevented a one-time get-up transition. | Clamp the down timer to exact zero at the boundary and decrement get-up once per tick. | Lifecycle fixture and direct timer trace. |
| Timeout result | Timeout used forced KO behavior and did not represent a true draw. | Separate decision and draw paths; HP is preserved. | True draw and correct decision-winner fixtures. |
| Death body | The losing body could disappear or be hidden during the ending. | Retain a stable losing rig during the ending and render it in the fight scene. | End-screen visual review. |
| Knockdown silhouette | Early knockdown data looked like an upright bow. | Grounded, connected lying pose and blended get-up. | Native browser visual review and grounded-pose assertion. |
| Debug projection | Hurtbox overlay used the wrong vertical sign and contact conversion. | Use world vertical coordinates directly for projected capsules and contact markers. | Portrait/landscape overlay screenshots. |
| Renderer dependence | Pose sampling could depend on render frequency. | Fixed-step cached simulation poses; renderer reads the cache and does not advance combat animation. | Determinism and aspect-invariance checks. |
| HTML closure | Duplicate closing document tags were present. | Removed the duplicate closure. | Standalone initialization check. |
| Test validity | Fixtures sometimes selected a counter instead of a block, or used ambiguous depth coordinates. | Correct skill selection, explicit 3D coordinates, and symmetric grounded-pose assertions. | Current fixture suite; no weakened collision assertions. |
| Balance | Counter-heavy and frequent-pressure styles produced extreme early win rates. | Reduced counter multiplier to 1.20 and Karate basic damage/cadence; counter contact now uses real geometry. | Final mirrored balance table below. |
| Hand animation | Straight punches could bend upward or be hidden behind the torso, with an unclear wrist/hand line. | Explicit shoulder-level forward targets, direct constant-length arm construction, active-arm draw order, and oriented wrist/hand rendering. | Active-frame punch and mirrored-punch browser review; constant-length fixtures. |
| Leg animation | Kicks could fold upward, target too high, or use the wrong distal direction. | Direct end-effector targets, forward knee branches, target-family heights, and target-directed foot geometry. | Front/roundhouse/low-kick visual review and all technique fixtures. |
| Knee animation | Knee strikes reused a kick path and drove the leg downward. | Dedicated raised-knee chain with folded shin and matching knee hitbox. | Muay Thai knee active-frame review and technique fixtures. |
| Low-kick animation | Low kicks rose above the intended lower-leg target. | Dedicated low-line path toward the shin, with a support foot and a separate low-line leg chain. | Low-kick and recipient leg-buckle review; hitbox overlay. |
| Foot/sole geometry | Support-foot segments could continue downward through the floor or drag the raised leg. | Horizontal sole from the ankle, explicit planted/swing state, and no support-foot override on a striking leg. | Support-foot inspection and rig fixtures. |
| Hit reactions | Every impact used a generic upper-body flinch. | Zone/impulse metadata produces low-leg buckle, torso recoil, and head reaction; down/get-up remains blended. | Low-kick reaction, reaction fixtures, and visual review. |
| Knockdown planting | Ground IK could pull a falling body back into an upright stance. | Disable ground planting during down/death and use a stable lying limb configuration. | Grounded-pose assertion and browser review. |
| Clavicle proportions | Moving the shoulder attachment changed upper-arm length. | Restore anatomical shoulder origin and add a separate visual clavicle connector. | Constant upper-arm-length fixtures. |

## Motion parameters changed

- Simulation: fixed **1/60 s** timestep; combat and presentation randomness remain separate.
- Pose damping: `alpha = 1 - exp(-18 * dt)`.
- Turn blend: **0.20 s**, with sinusoidal torso/root transition rather than instant flipping.
- Speed damping: `1 - exp(-10 * dt)`.
- Locomotion: equal-phase opposite legs (`sin(phase)` and `sin(phase + π)`), counter-phase arms, speed-dependent lean and root bob.
- Gait: persistent stance/swing anchors, stride phase `walk / 1.8`, deliberate swing lift `sin(tπ) * 0.10`, swing speed **4.0/s** (or **5.5/s** above speed 2).
- Movement acceleration: X damping `dt * 9`; Z damping `dt * 9`; technique-specific controlled drive during windup/active frames.
- Attack phases: authored windup → active → recovery with eased transitions and follow-through; active hitboxes exist only during active frames.
- Reactions: hit stun, knockdown, get-up, and death use distinct blended poses; stale pending counters are cleared.

## Tactical behavior implemented

- Utility-scored action selection using range, depth, damage, stamina, cooldown, edge position, opponent recovery, and repeated habits.
- Low-HP bounded retreat and re-engagement.
- Edge escape and anti-corner movement.
- Anti-passivity pressure and final-exchange escalation.
- Feint/cancel into fast follow-up, defense, or movement.
- Fake retreats and bait-and-punish selection.
- Rhythm variation rather than fixed attack cadence.
- Whiff/recovery memory and immediate punish reservation.
- Adaptive loadouts and persistent per-skill cooldowns.
- IQ profiles controlling reaction, perception, spacing, defense, punishment, memory, discipline, and mistakes.

## Scripted tactical measurements

The standalone test mode runs `tacticalScenarios()`. Results in the current build:

- **Low-HP retreat/re-engagement:** IQ 30: 1 retreat / 1 re-engagement; IQ 90: 1 retreat / 1 re-engagement.
- **Feint comparison:** 17 successful opening punishes versus 7 non-feinting baseline punishes across 10 paired seeds; all 10 induced commitments were punished at least once in the final measured run. A later rerun is reported verbatim if its seed-dependent total differs.
- **Recovery/whiff punishment:** 8/8 scenarios landed a punish.
- **Defensive completion:** six seeded defensive matches reached valid endings within the time limit, including an explicit draw when applicable.
- Free-match metrics are retained per fighter in `Match.stats` and `Fighter.tactics`: retreats, re-engagements, feints, baits, punishes, whiff punishes, and fake retreats.

## Verification commands

```text
node test-runner.cjs check
node test-runner.cjs bench
node test-runner.cjs tactics
node test-runner.cjs render
node test-runner.cjs test
```

On this host, use `C:\Program Files\nodejs\node.exe` for `node`.

`test` includes queue matches, all fixtures, tactical scenarios, renderer checks, deterministic replay, aspect invariance, IQ balance, and mirrored balance data. The command exits nonzero for failed acceptance gates.

## Visual and recording review

- Browser screenshots were reviewed for ordinary strikes, a high kick, a mirrored Karate/Capoeira pose, portrait/landscape hitboxes, a grounded knockdown/get-up, and the ending.
- `portrait-verified.png` is a native portrait-canvas capture.
- `fight-after.webm` is an actual browser WebM artifact, but its capture is only **301 ms / 9 frames**. It is not sufficient evidence of a full fight and is not described as such.
- Deterministic fixed-tick canvas frames were used for the slower visual review. This avoids confusing browser rAF throttling with simulation timing.
- Close-range depth overlap can still make two silhouettes touch visually; this is a 2.5D presentation overlap, not detached geometry.

## Final full-suite results

Final command: `test-runner.cjs test` — **exit code 0**.

- **30/30 queue matches accepted**; no failed match entries.
- **396/396 fixtures passed**, including all 79 technique contact fixtures, ultra/loadout/rig/lifecycle/collision/renderer checks, and the timeout-during-hitstop regression.
- **Deterministic replay:** pass.
- **Aspect invariance:** pass; changing 9:16/16:9 does not change the fight result.
- **Scripted tactical suite:** pass.
- **IQ series:** 67/96 high-IQ wins (**69.79%**).

Mirrored balance table (four repetitions, side-swapped; `played` excludes draws):

| Art | Wins | Played | Win rate |
|---|---:|---:|---:|
| Taekwondo | 10 | 55 | 18.18% |
| Boxing | 46 | 55 | 83.64% |
| Wrestling | 22 | 55 | 40.00% |
| Muay Thai | 24 | 54 | 44.44% |
| Judo | 25 | 55 | 45.45% |
| Karate | 48 | 56 | 85.71% |
| Capoeira | 16 | 56 | 28.57% |
| Kung Fu | 30 | 56 | 53.57% |

These are measured balance observations, not a claim of uniform fighter strength. The queue acceptance gate validates termination, valid winner/draw state, finite state, and actual hits; it does not require a particular art to win or require a loadout swap in every match.

## Remaining limitations

- The short browser WebM is not a complete fight recording. A longer capture can be made with the normal game loop and an external recorder if needed.
- Balance is measured by seeded simulations and side swaps, not by human playtesting. Individual matchups can remain unequal even when no invalid winner or stuck match is found.
- No external assets, libraries, network requests, or downloaded media are used by the game itself.
