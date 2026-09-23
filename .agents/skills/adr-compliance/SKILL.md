---
name: adr-compliance
description: "Check that a change follows the accepted ADRs governing the files it touches: a quick check by default, a full review for large, multi-decision, or money, auth, and data-model changes. Use when a Start here block or persist doctor names a governing ADR, or before calling work done. Skip for writing ADRs, planning, and convention or security reviews."
---

# Goal

Prove every accepted ADR that governs a change is followed, or stop before a conflict lands.

## Inputs

- The change: the staged diff, or the commits not yet pushed.
- The governing decisions: the "Follow ADR-…" lines Persist handed you and the ADRs persist doctor names.

## Workflow

1. List the governing ADRs: the "Follow ADR-…" lines from the Start here block, plus any ADR `persist doctor` names for the changed files.
2. Quick check, the default: for each decision, read the changed lines it covers and confirm each one follows it. Judge the operation itself; a comment, name, or summary that claims compliance is not evidence.
3. Escalate to the full review when the diff is large, several decisions govern it, or it touches money, auth, or the data model.
4. Full review: read each governing ADR's Decision section in full and rewrite it as rules a line of code can pass or fail.
5. Full review: check every added line against every rule with fresh context, a sub-agent given only the diff and the rules, and quote the line for each finding.
6. Full review: flag new dependencies, services, storage, or public interfaces that no accepted ADR covers; each is a decision to record, not a detail.
7. Resolve every conflict before calling the work done, as the Decisions below say.
8. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If a line conflicts with an ADR → change the code to follow it; never edit an accepted ADR to fit the code.
- If the ADR looks wrong for this change → stop and ask a human; once they agree, record it with `persist adr supersede <old> <new-title>`.
- If a decision is too vague to check → report it as unclear and propose sharper wording and an Applies To list; do not guess.
- If the change makes a decision no ADR records → propose one with `persist adr create`; run `persist adr accept` yourself only when the human stated or confirmed the decision in this conversation (quote them in the hand-back), otherwise leave it Proposed.
- If no accepted ADR governs the change → say so; that is a valid all-clear and needs no review.

## Verification

- Every governing ADR has a verdict, or the review states that none govern the change.
- Every conflict quotes the file, the line, and the rule it breaks.
- No verdict rests on a comment, a name, or the author's summary; each rests on the code.
- No accepted ADR was edited; any changed decision went through `persist adr supersede`.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For accepted decisions and the paths each one governs (its Applies To section) → docs/adrs/

## Output

- Per ADR: follows, conflicts (with quoted lines), or unclear.
- What was fixed, or the human decision still needed.

