---
name: completion-report
description: "Write the completion report for a finished task: files changed, commands run with results, skipped checks, and remaining risks. Use when handing work back as done. Skip for feature planning, drift reviews, test writing, and module docs."
---

# Goal

Hand back the evidence that a task finished, honestly.

## Workflow

1. List the files changed.
2. List the commands run with their results.
3. Name the checks skipped and why each was skipped.
4. Name the remaining risks.
5. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If doctor or the tests did not run → say so plainly; never claim done without that evidence.
- If a warning stays → name it and say why it stays.

## Verification

- Every file the diff touches is listed.
- Every claim about tests or checks names the command and its result.
- Skipped checks and remaining risks are explicit, never omitted.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For completion evidence rules → docs/50-quality/QUALITY_GATES.md

## Output

- The report: files, commands with results, skips, and risks.
- The docs updated, if any.
- A "Needs your review" list when any exist: Proposed ADRs, assumptions, blocked tasks, and security-sensitive changes, each with the file to open.

