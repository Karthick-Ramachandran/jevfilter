---
name: write-tests
description: "Write tests from acceptance criteria and risk, running each new test red first. Use when a bug fix needs a test that fails without the fix, or a change needs proof it holds. Skip for feature planning, drift reviews, security reviews, and convention checks. Covers behavior only, never Persist internals."
---

# Goal

Prove the fix and the behavior with tests derived from acceptance criteria and risk.

## Inputs

- Acceptance criteria or the bug report.
- The change or diff under test.

## Workflow

1. Restate the acceptance criteria and the risks the tests must cover.
2. For a bug fix, write one test that fails without the fix; run it red before changing code.
3. Add focused tests for the new behavior and the likely regressions, keeping each test to one behavior.
4. Run the relevant suite in full, not just the new tests.
5. If the requirements are too unclear to write a test, stop and ask instead of guessing.
6. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If a test needs Persist internals (symlinks, templates, golden files) → rewrite it against behavior; tests never cover Persist-specific content.
- If the fix would change an accepted non-goal → stop and ask for approval.

## Verification

- Every acceptance criterion maps to at least one test.
- The bug-fix test was seen failing without the fix.
- The relevant suite passes with the fix in place.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For quality evidence rules → docs/50-quality/QUALITY_GATES.md

## Output

- The tests added and what each one proves.
- The red run and the green run, with commands and results.

