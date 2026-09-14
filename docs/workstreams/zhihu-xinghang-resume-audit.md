# Xing Hang Resume Snapshot Audit

Audited on 2026-09-06. Read-only audit of the private saved draft, not an editorial approval or published-game result. No model, image, server, or job was started. No production or `.local` file was changed.

**Latest inspected snapshot, 2026-09-06 13:38 UTC:** run 4 draft hash `dce976e4d98dd6e448e9968587e4a6f585af9232dc10c316ff56569d2c622ebd` compiles, covers all 13 endings in its outline, and resolves the previously truncated premises plus the two targeted wording issues. See the separate run 4 section below. This is local evidence only, not the independent final model review or a publication decision.

## Snapshot Identity

- Project: `import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f`, revision `1`.
- Snapshot: `.local/story-workshop/projects/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f/r1/editorial/run-3-09abf23a989b/workshop-editorial-extend-v2-8d703b89210a58e6cc083591/round-1.draft.json`.
- Snapshot SHA-256 and `editorialHash`: `68c16f9980fdb964f9669c5f34bff336498b916a6447d636b278e2b88f9548d1`.
- Previous `round-0.draft.json` editorial hash: `1926e8c57f4241143d0bfb37ff38cf9fa37b9664ebc77022ffffcdc59b41f7d5`.
- Source object editorial hash: `2cfa9ee2b114b5b80a8e569b94c85d3867dd266b9392ca968c06a293bb221c92`.
- Source text SHA-256: `c80037bf08e01ce3f879c0414a170dc315dfe3cdfcb18c611bc6c266465a2c05`; 735 JavaScript string code units.
- Source matches the complete saved `input.json` source object. All seven outline fact quotes occur verbatim in `source.text`. Original scope remains `zhihu-excerpt`, origin content scope `search-excerpt`.
- Prior review: `review-r0-bb3b71c01346f588bd64008b-a1.accepted.json`; input hash `bb3b71c01346f588bd64008bd7a44f21fc73b7822ae6757bd0ea2c1c184fefea`; output hash `133b4d604a6eec8150d21b38a2bb2701aa9710de267b0d422fdc6e9b0dd8599e`.

## Initial Findings Before Predicate Support

### 1. The Actual Compiler Rejects the Snapshot

Invoked `buildGeneratedWorld(projectId, 1, source, draft)` directly through `node --import tsx --input-type=module -`, using unmodified saved JSON and the actual current compiler. It throws at `server/workshop-compiler.ts:64`:

```text
return_home_descent：线索没有取得途径 !服务段已分离
```

The four new maintained-supply actions encode unsupported condition expressions in `needs`. The runtime treats every `needs` item as a literal positive clue, and none of the following strings has a gaining action:

| Choice in `return_home_descent` | Unobtainable `needs` literals |
| --- | --- |
| `return_home_descent_keep_tail` | `!服务段已分离` |
| `return_home_descent_keep_leak` | `!乘员舱密封` |
| `return_home_descent_keep_reserve` | `oxygen<3` |
| `return_home_descent_keep_reserve_radar` | `!落区天气`, `oxygen>=3`, `oxygen<4` |

The build stops before complete state enumeration and Ink compilation. Accordingly, the three forced-action profiles from `scripts/record-zhihu-xinghang-review.ts` were inspected but **not replayed against a playable new world**. This audit does not claim those paths are fixed, nor does it substitute a simplified engine or relax compiler rules.

### 2. All Four New Endings Are Missing From Outline Endings

| Route | Decision scenes | Ending scenes | Outline endings |
| --- | ---: | ---: | ---: |
| `save_habitat` | 12 | 3 | 3 |
| `return_home` | 12 | 6 | 3 |
| `save_sample` | 12 | 4 | 3 |

New actual ending scenes are `return_home_heat_bad`, `return_home_pressure_bad`, `return_home_reserve_bad`, and `save_sample_crew_rescued`. None has a corresponding ending object in its outline route; this is not merely the preexisting outline/runtime ID naming convention, because their titles also have no outline ending match. There are 49 route scenes and 13 actual ending scenes, excluding the opening node. The expanded ending schema alone has not repaired this saved outline.

### 3. The Outline Truncation Remains and Now Affects All Three Routes

All three saved route `premise` strings are exactly 1,000 code units and end mid-sentence:

- `save_habitat`: `画面从分离观察窗转向生活舱的`
- `return_home`: `有天气而不足3，或没有`
- `save_sample`: `两项costs均`

These exact truncated routes and resource descriptions already occur in `outline-repair-r0-1c7979f28a6760f2a7dc001b-a1.accepted.json`; they were not introduced by this audit or a later snapshot merge. Prior review `assessment_04` is therefore not resolved by this snapshot.

## Concrete Improvements Present in Saved Content

- All 45 old scene IDs and all old choice IDs remain. For every old choice, `needs`, `costs`, and `next` are unchanged.
- `save_sample_probe_leave_sample` and `save_sample_seal_leave_sample` are new zero-cost actions. Both require only the existing fuel-cut and dangerous-backflow-cut clues, not stable cooling or temperature analysis. They keep the sample outside, connect both crew members to closed-loop supply, close the compartment, and point to `save_sample_crew_rescued`. The old free failure actions also remain.
- The new sample stop-loss ending explicitly resolves crew treatment, sample contamination and loss of repeat-measurement value, station retirement, the spent landing battery, and investigation using actually handed-over files and separately obtained ground records. This is a distinct ending, not a redirect into sample-preserved `save_sample_c_good`.
- Return-route text now distinguishes maintained breathing supply from active shutoff. The three new bad endings describe attached-service-module damage, unresolved pressure loss, and breathing inventory running out before delayed sea rescue respectively. Their prose exists, but their new incoming actions are blocked by finding 1.
- Oxygen remains one resource with initial `18`, minimum `0`, and maximum `20`; old choice costs are unchanged. The new description explicitly defines equal available-oxygen units rather than shared minutes.
- Equipment differences are established through on-scene operations: `return_home_departure/text/1-2` tests a burnt return-flow fan and explains continuous exhaust; `return_home_uplink/text/3-4` checks measured flow and even full-capacity endurance against six hours. `save_habitat_antenna`, `save_habitat_airflow`, and `save_habitat_refuge` inspect, connect, test and seal independent emergency circulation. `save_sample_battery/text/2-3` tests the compartment circuit separately from the consumed cooling battery. These explanations do not add oxygen resources or inventory bonuses.
- The three old successful-landing choice feedbacks now stop at setup and descent, rather than repeating the later sea-rescue supply handoff. Original success choice mechanics remain unchanged. The prior ambiguous gripping action in `save_sample_c_good` has been rewritten with explicit positioning.

## Saved Route Stage Output Hashes

- `save_habitat`: `route-repair-r0-c0c3eac7b9a74385c1c50309-a1.accepted.json`, output hash `1b997df0055dea447787db4b562c771ca364401dd64ee684410d24cdb7bff339`.
- `return_home`: `route-repair-r0-f194de6d851bb25924337737-a1.accepted.json`, output hash `33846192a10c1e092a37cc50753d5bb14e1ce4a527a31bcf6e6fe07ce27675a3`.
- `save_sample`: `route-repair-r0-af2ab309625f97dda2e0e360-a1.accepted.json`, output hash `ffffdbfeb119fe0704924735c273f6504860d9d75be81be37dbbc9e74167b20b`.

This is a local compiler and targeted content audit, not the missing full-draft `review-r1` model result. A later recovery snapshot must be audited under its own hash before these results are applied to it.

## Follow-Up With Typed Predicate Support

Re-audited at 2026-09-06 13:10 UTC using the same snapshot hash `68c16f9980fdb964f9669c5f34bff336498b916a6447d636b278e2b88f9548d1` and source hash `2cfa9ee2b114b5b80a8e569b94c85d3867dd266b9392ca968c06a293bb221c92`. The root agent changed the compiler, not this generated draft: `!clue` now projects to `noneClues`, and known-resource integer comparisons project to typed bounds.

The actual `buildGeneratedWorld` now succeeds, including graph/state validation and Ink compilation:

```json
{"scenes":50,"decisions":37,"endings":13,"badEnds":8,"routes":3,"states":8247}
```

All three original profiles were replayed with actual `startSession` and `choose`. Separate fresh sessions were used for each alternative, respecting the engine's stale-choice protection.

| Original problem node | Oxygen on arrival | Actual available choices | Verified new outcome |
| --- | ---: | --- | --- |
| `return_home_descent` | 17 | `return_home_descent_cabin_air`, `return_home_descent_keep_tail` | `return_home_heat_bad`, oxygen 17; existing mechanical damage, maintained supply |
| `save_sample_probe` | 18 | `save_sample_probe_shell`, `save_sample_probe_leave_sample` | `save_sample_crew_rescued`, oxygen 18 |
| `save_sample_seal` | 16 | `save_sample_seal_stay`, `save_sample_seal_leave_sample` | `save_sample_crew_rescued`, oxygen 16 |

The original choice-ID paths are unchanged from `scripts/record-zhihu-xinghang-review.ts`. None is now forced to select the original harmful action. All original failure actions were also executed and still reach their original ending IDs.

### State And Boundary Verification

- Independently enumerated the same 8,247 reachable typed states. The targeted nodes contain 1,575 descent states, 112 sample-probe states, and 67 sample-seal states.
- All these targeted reachable states have at least two available actions. The sample stop-loss action is available at every reachable state of each sample target.
- For a sealed and separated descent state, the low-reserve fallback is available exactly when neither normal landing action is available. No checked state offers both low-reserve failure and an affordable normal landing.
- Replayed 97 distinct `(node, oxygen, available-choice-set)` signatures through actual Ink sessions. Node identity, oxygen, and the full available-choice set matched the typed rule checker in every replay.
- Replayed 52 new-action/resource-value witnesses, covering every reachable oxygen value for each new action. No mismatch occurred.
- Replayed a minimum-oxygen witness for each of all 13 ending IDs; all were reachable through actual game choices.

| New action | Reachable oxygen values represented | Verified ending |
| --- | --- | --- |
| `return_home_descent_keep_tail` | 12 distinct values; min 6, max 17 | `return_home_heat_bad` |
| `return_home_descent_keep_leak` | 12 distinct values; min 5, max 16 | `return_home_pressure_bad` |
| `return_home_descent_keep_reserve` | 1 and 2 | `return_home_reserve_bad` |
| `return_home_descent_keep_reserve_radar` | exactly 3, without weather | `return_home_reserve_bad` |
| `save_sample_probe_leave_sample` | 13 distinct values; min 5, max 18 | `save_sample_crew_rescued` |
| `save_sample_seal_leave_sample` | 12 distinct values; min 6, max 17 | `save_sample_crew_rescued` |

Minimum oxygen at successful ending entry remains 3 for `save_habitat_rescued_small`, 4 for `save_habitat_rescued_ward`, 2 for `save_sample_c_good`, and 5 for the new `save_sample_crew_rescued`. The return-route success at exactly zero remains reachable through:

```text
enter_return_home
return_home_departure_wait
return_home_plume_snapshot
return_home_seal_isolate
return_home_navigation_solo
return_home_oxygen_skip
return_home_burn_horizon
return_home_separation_backup
return_home_cabin_check_repair
return_home_descent_radar
```

This reaches `return_home_good` with oxygen `0`, preserving the existing completed-external-supply-handoff success rule.

### Remaining Findings

No remaining structural or forced-action blocker was found in this targeted current-compiler audit. The existing source comparison and concrete equipment explanations still hold because the source and draft hashes did not change.

The content delivery is still incomplete in two concrete ways: all four new ending objects are absent from the outline ending arrays, and all three outline premises still stop mid-sentence at exactly 1,000 code units. Current compiler success does not validate those editorial completeness conditions. A completed full-draft model review remains separate from these local checks.

### Verification Code Identity

- `shared/workshop-conditions.ts` SHA-256: `5843769a7cc98b4816947249b1f88e0af1c67e37267791cdd67c162621a9b6ee`.
- `server/workshop-compiler.ts` SHA-256: `521719583e274ad6b748d64559f442b5c939fb6b0d4d1889ff6660b59ecc0e28`.
- `shared/choice-rules.ts` SHA-256: `c02caa4754f1a7c7e479aaa12d596c85f4e047d5d075b75f1a23a8b09eea000c`.
- `src/game.ts` SHA-256: `a97a74c11ab0961819f9681d8c18df65730e3e3badbed8025191ad0972f7c283`.

## Run 4 Snapshot Verification

Read-only verification at 2026-09-06 13:38 UTC. This section describes a **new saved snapshot**, not the earlier `68c16f...` draft. No story, code, model process, art process, server, or job was modified or started; the independently running final-review worker was not interacted with.

- Exact snapshot: `.local/story-workshop/projects/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f/r1/editorial/run-4-dfa072111956/workshop-editorial-extend-v2-92d1426da9a360b4e15ebb76/round-1.draft.json`.
- Snapshot file SHA-256 and editorial hash: `dce976e4d98dd6e448e9968587e4a6f585af9232dc10c316ff56569d2c622ebd`.
- Compared directly with run 3 snapshot hash `68c16f9980fdb964f9669c5f34bff336498b916a6447d636b278e2b88f9548d1`.
- Source object hash remains `2cfa9ee2b114b5b80a8e569b94c85d3867dd266b9392ca968c06a293bb221c92`, exactly matching the new run's saved `input.json` source. Every outline fact quote still occurs verbatim in the source.

### Compiler And Mechanical Comparison

The actual current `buildGeneratedWorld` succeeds on the unmodified new snapshot, including Ink compilation:

```json
{"scenes":50,"decisions":37,"endings":13,"badEnds":8,"routes":3,"states":8247}
```

All route IDs, scene IDs, and choice IDs are unchanged from the run 3 snapshot, with no additions or omissions. Every choice's `needs`, `costs`, `next`, and `gains` is identical. The outline resource definitions are also identical. Within actual route scene fields, the only difference from the earlier snapshot is `save_sample_crew_rescued/text/4`; the other route content is preserved.

### Outline Completion

| Route | Actual endings | Outline endings | Complete premise length |
| --- | ---: | ---: | ---: |
| `save_habitat` | 3 | 3 | 680 |
| `return_home` | 6 | 6 | 731 |
| `save_sample` | 4 | 4 | 785 |

All 13 actual ending titles and kinds have corresponding outline ending objects; no ending is unmatched. The new return-route entries are `return_home_heat_bad`, `return_home_pressure_bad`, and `return_home_reserve_bad`; the sample entry is `save_sample_crew_rescued`. Every premise ends with a complete sentence, remains below the 1,000-code-unit limit, and retains the route's irreversible cost and oxygen-equipment distinction.

The final return-route beat now names the actual separate ending targets and both low-reserve conditions: below 3 regardless of weather, or exactly 3 without weather. Its `b_entry_bad` cause now describes active supply shutoff only; natural exhaustion remains in `return_home_reserve_bad`. The new outline entries independently describe the mechanical cause, crew outcome, investigation, and existing losses.

### Wording Verified In Actual Gameplay

The opening's only paragraph change is index 10: `预热以前那段输入` becomes `预热时那段输入`. A real `startSession(world)` displays the corrected question, aligning it with the omitted preheat-stage input without adding knowledge of the later fault mechanism.

The sample stop-loss ending's only changed paragraph is index 4: `自己亲手关阀、断线和封门的时刻` becomes `总阀关闭、危险回流切断和封门的时刻`. This retains recorded event times without claiming that Jiang Hang personally performed a valve closure carried out by Shen Yan or that pulling contacts was a wire-cutting action.

Replayed this exact actual-game path to exercise both alternate performers and procedures:

```text
enter_save_sample
save_sample_battery_purge
save_sample_breath_check
save_sample_cooling_team
save_sample_bottle_fire
save_sample_account_compare
save_sample_contacts_pull
save_sample_archive_carry
save_sample_seal_leave_sample
```

The co-operation feedback explicitly has Shen Yan close the outside valve while the player purges coolant; the later feedback physically separates contacts. The session reaches `save_sample_crew_rescued` with oxygen `7`, and its displayed handover paragraph uses the corrected event-based wording. Thus it no longer replaces that actual route history with a claim that Jiang Hang personally closed the valve and cut the wire.

No remaining mismatch was found in the requested snapshot-to-snapshot checks. This does not substitute for the independently running final full-draft model review, browser checks, or the parent workflow's delivery decision.
