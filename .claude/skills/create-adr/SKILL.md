---
name: create-adr
description: "Record a decision others can check: falsifiable rules, an allowed and a forbidden example, and a filled Applies To list. Use when a change needs a decision recorded. Accept it yourself only when the human stated or confirmed the decision in this conversation; otherwise it stays Proposed. Skip for ADR checks, feature planning, drift reviews, and test writing."
---

# Goal

Write a decision record others can check line by line.

## Inputs

- The decision and why it is needed now.
- The paths it governs, for its Applies To list.

## Workflow

1. State the context: what decision is needed and why now.
2. Write the Decision as rules a line of code can pass or fail, with no adjectives that need interpretation.
3. Give an explicit allowed and a forbidden example for anything easy to misread.
4. Fill the Applies To list with the exact paths the decision governs.
5. Record the alternatives considered and the consequences, then `persist adr create` writes it Proposed; run `persist adr accept` yourself only when the human stated or confirmed the decision in this conversation (quote their words in the hand-back), otherwise leave it Proposed and say so.
6. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If a rule cannot be written checkably → say so and propose sharper wording; do not guess.
- If the decision changes an accepted ADR → stop and ask, then record it with `persist adr supersede`, never by editing.

## Verification

- Every Decision sentence passes or fails a line of code without interpretation.
- An allowed and a forbidden example exist for each easily misread rule.
- The Applies To list names real paths, and the ADR is Proposed unless the hand-back quotes the human's stated or confirmed decision for an acceptance.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For prior decisions → docs/adrs/

## Output

- The path of the ADR.
- Whether it is Proposed or accepted on a quoted human confirmation.

