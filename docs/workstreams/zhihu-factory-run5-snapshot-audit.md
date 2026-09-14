# Factory Run 5 Snapshot Audit

Read-only targeted verification at **2026-09-06 14:08 UTC**. This is a local snapshot, compiler, and narrative-continuity audit, not an editorial approval, publication decision, or independent final-review result. No draft, production status, ownership record, code, model process, job, art process, or server was changed or started.

## Exact Inputs

- Project: `import-0b3ce5e1-1f96-474d-871d-5e2a2a541713`, revision `1`.
- Snapshot: `.local/story-workshop/projects/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713/r1/editorial/run-5-465beb63478d/workshop-editorial-extend-v2-392388627bc91151c70bbb70/round-1.draft.json`.
- Snapshot file SHA-256 and editorial hash: `384f54df0d9aa209f85e1e5d20d27e615ae9797e1d9cf01fde50f0baee91b0a0`.
- Prior `round-0.draft.json` editorial hash: `4dd08fba1783f47e12a579c1a59dda91bbcb0ed4a85a3d5248f46d2088796532`.
- Source object editorial hash: `f921fd39f753eb5ee4111c011ba03a3b40fe72ffb62b9e1af49a2f504eaa8e19`.
- Source text SHA-256: `95a1cf68683692f1033008101351791d05c68dc28ab13f5debdd92f1877c4be2`; 932 JavaScript string code units.
- Source object exactly matches the source retained in this run's `input.json`; all current outline fact quotes occur verbatim in the source. Scope remains `zhihu-excerpt`, origin content scope `search-excerpt`.
- Reviewed findings: `review-r0-0ea87f3a6ca92c68159b4762-a1.accepted.json`, input hash `0ea87f3a6ca92c68159b4762239b4becc00be655cde595bb45be6f6193ab7db5`, output hash `8d6cef2deb16e84d197cc681e217ff23cc5b70e45a009f18cc0edfb1ca08b71c`.

## Compiler And Identity Comparison

Directly invoked the actual current `buildGeneratedWorld(projectId, 1, source, draft)` on the unmodified saved snapshot. Full graph/state validation and Ink compilation succeed:

```json
{"scenes":50,"decisions":40,"endings":10,"badEnds":5,"routes":3,"states":2688}
```

All old route, scene, and choice IDs are retained. Every old choice's `needs`, `costs`, and `gains` is unchanged. Resource definitions are unchanged. There is exactly one old-choice mechanical change:

```text
return_with_luoli_07_recording / return_with_luoli_07_share_excerpt
next before: return_with_luoli_09_blank
next now:    return_with_luoli_17_recall_appointment
```

The new decision scene has two new unconditional zero-cost choices:

- `return_with_luoli_17_keep_date_review` -> `return_with_luoli_08_dates`.
- `return_with_luoli_17_reschedule_date_review` -> `return_with_luoli_09_blank`.

The first gains `return_with_luoli_recall_handled_by_lawyer`; the second gains `return_with_luoli_share_trace_record` and `return_with_luoli_date_review_rescheduled`. There is no silent change to old costs or evidence prerequisites.

## Five Blocking Findings Checked

### Finding 01: December 17 Is Handled Separately

The three non-conviction endings, `name_the_dead_compiled_bad`, `name_the_dead_incomplete_bad`, and `name_the_dead_reading_unresolved_bad`, now each contain a separate sequence for Luo Li's December 17 injury complaint, both in actual ending prose and corresponding outline ending objects:

1. Her complaint is separately received in 2026; her own identification is recorded independently of Li Xiumei's account of December 27.
2. Investigators examine the original medical files, operation records, images, transport witnesses, and injury assessment. The prose retains the serious injury and lasting impairment.
3. The fictional decision separately discusses injury method, the lower awning, the assessed harm, the considered classification, the limitation calculation, prior complaint and case records, evasion/interruption exceptions, and possible recalculation involving the later December 27 event.
4. A reasoned written decision is delivered in 2026, followed by lawyer-assisted review and oversight requests and written replies. This is earlier than Du's death and is not explained by Li Xiumei's separate testimony problems.
5. The December 27 death investigation continues separately and later receives its own written termination after Du's death is verified.

All three actual ending nodes were reached with `startSession` and `choose`; their displayed paragraphs contain the separate December 17 handling. Their distinct December 27 testimony histories remain intact: adopted rewritten account, demonstrated action causing persistent confusion, and reading without adopting the rewritten action.

This check verifies that the fictional disposition has an explicit independent chain and does not borrow the other incident's proof gap. It is not an external legal-accuracy review of the new statutory and procedural assertions.

### Finding 02: Sharing No Longer Silently Deletes Date Verification

At `return_with_luoli_07_recording`, the January 7, 09:00 date-verification appointment is now stated before the sharing decision. Sharing retains its existing trust cost and privacy consequence, preserves the complete police-held recording, and schedules a January 6 meeting with the lawyer.

The new `return_with_luoli_17_recall_appointment`, dated January 6 afternoon, explains that the two group administrators can jointly attend only at 09:00 on January 7. The lawyer checks the competing records appointment, and the player makes the scheduling choice:

- Keeping date verification sends the player to January 7's records scene while the lawyer continues withdrawal contacts and later message checking.
- Handling the forwarding records causes the lawyer to explicitly cancel the player's January 7 attendance, preserve Xu Qin's separate document handover, register later written verification, and arrange the player's January 12 personal-account meeting.

Both choices are free, retain the privacy harm, preserve the independently held records, and leave later written supplementation available. The new scene is not merely explanatory text: both exits were actually replayed. At trust `6`, they respectively reached `return_with_luoli_08_dates` on January 7 and `return_with_luoli_09_blank` on January 12, with trust unchanged.

### Finding 03: Concrete Date Transitions Now Agree

Replayed this exact path through the current game:

```text
enter_return_with_luoli
return_with_luoli_01_listen
return_with_luoli_02_front_only
return_with_luoli_04_wait_reply
return_with_luoli_05_explain
return_with_luoli_16_correct_transport
return_with_luoli_07_share_excerpt
```

The actual sequence is:

| Transition | Explicit narrative bridge |
| --- | --- |
| December 29 signature -> December 30 supplementary statement | Appointment is for the next day; the next scene refers to yesterday's signed statement. |
| December 30 statement -> January 5 recording | The player leaves the lawyer's office and confirms the January 5 meeting; the next scene opens `六天后`. |
| January 5 recording -> January 6 withdrawal meeting | Sharing feedback explicitly books January 6 afternoon. |
| January 6 meeting -> January 7 date verification | The chosen feedback states attendance on January 7 morning. |
| January 6 meeting -> January 12 personal account | The alternative explicitly narrates January 7 forwarding-record work and arranges January 12 afternoon. |

The other incoming edge to January 5 comes from `return_with_luoli_06_awning`, also dated December 30, so the new six-day bridge fits both actual predecessors. No new backwards date transition was found among these changed paths.

### Finding 04: The Missing Investigation Beat And Ending Are Present

`name_the_dead` now has 13 outline beats and four ending objects. Beat 13 corresponds to `name_the_dead_later_recheck`, including its four existing exits. The newly listed outline ending `name_the_dead_reading_unresolved_bad` matches the actual title and kind, and all four investigation endings have an outline match.

The beat and ending causes distinguish independent observation confirmed on recheck, demonstrated-action confusion, adoption of a rewritten account, and reading without adopting it. The existing free return-and-recheck choice and all later-recheck choice mechanics are unchanged. An actual path through the free recheck reached the reading-without-adoption ending.

### Finding 05: The Unsupported Public Joint-Signature Gate Is Gone

The `speak_in_public` premise and beat 8 now say that the player's public corrections are individually signed. They no longer promise a trust-8 joint-signature unlock. Trust still affects private contact and willingness to share material, while official correction remains tied to facts, sources, and disclosure scope.

The actual public-route choices still contain no request-for-joint-signature action, matching the revised outline. No new trust prerequisite was added to those choices.

## Result And Limits

The requested five finding-to-snapshot comparisons have concrete corresponding repairs. No remaining compiler or targeted structural blocker was found. The immutable source matches the saved input, old identities are retained, and the single intentional old `next` change is accounted for by a real, reachable two-exit scene.

The audit uses the saved run 5 draft only. It does not report the independently running final review as complete, does not alter project readiness, and does not replace that review or the parent workflow's browser and delivery checks.
