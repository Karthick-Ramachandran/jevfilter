---
name: drift-review
description: "Give a finished, non-trivial change a fresh-context review against accepted ADRs, module boundaries, new dependencies, tests, and docs. Use when a substantial change is done and needs a second pass before it lands. Skip for ADR writing, feature planning, test writing, and handover notes."
---

# Goal

Catch what a finished, non-trivial change got wrong before it lands.

## Inputs

- The finished diff.
- Test and doctor results, when they exist.

## Workflow

1. Review with fresh context: a separate pass from the one that wrote the change.
2. Run the adr-compliance skill for the ADR part instead of repeating it.
3. Check module boundaries: nothing crosses ownership the module memory does not allow.
4. Flag new dependencies, services, storage, or public interfaces that no accepted ADR covers.
5. Check that tests and docs were updated for the behavior changed.
6. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If a line conflicts with an accepted ADR → change the code; never edit an ADR to fit the code.
- If the change is small and single-decision → say so and hand back to the quick check instead.

## Verification

- Every accepted ADR governing the diff has a verdict through adr-compliance.
- Every boundary crossing, new dependency, and missing test or doc update is named or explicitly absent.
- No finding rests on a summary; each quotes the file and line.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For accepted decisions → docs/adrs/
- For module ownership, when module memory is enabled → docs/30-modules/

## Output

- Verdict: land, land with fixes, or stop for a human decision.
- Finding list with files, lines, and the rule each breaks.

