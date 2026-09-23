---
name: implement-task
description: "Make a code change with the five-step loop: start from the pointers and governing decisions, keep it small, add focused checks, and update the area card. Use when implementing any code change inside decided ground. Skip for feature planning, ADR writing, drift reviews, security reviews, and module docs."
---

# Goal

Land the smallest safe change for the task, with proof it holds.

## Workflow

1. Start from the pointers: run `persist context "<task>"` (or the Start here block) and open those files plus what the task needs; do not survey the repository.
2. The Always lessons load every session; the lessons for your area arrive with the pointers. If they don't cover what you're doing, open the section of `LESSONS.md` that does (the pointers list them).
3. Read the Decision section of each governing ADR (`persist doctor` names them); every accepted ADR still binds, and when a card disagrees with an ADR, the ADR wins.
4. Make the smallest safe change that satisfies the task; match ceremony to scope and write no planning docs for a fix inside decided ground.
5. Add focused tests for the behavior touched (the write-tests skill holds the procedure).
6. Before calling it done, check each changed line against every governing decision, then run the tests and doctor; add the task to the area card's Answers list, phrased as asked.
7. When something breaks non-obviously, add a one-line lesson. Put it under the area it belongs to (create the area with an Applies To list if none fits). Put it under Always only if every task in this repository needs it. When a regression test or a CONVENTIONS rule now enforces a lesson, move it there or delete it, and name the test or rule in the commit. Delete a lesson that describes a temporary state once that state is fixed.
8. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If the task conflicts with an accepted ADR or engineering standards → stop and ask a human.
- If the change needs a new dependency, service, or data store no ADR covers → stop and ask; record it with `persist adr create`.
- If the request grows into a new feature, module, or data model → stop and plan it with the plan-feature skill instead.

## Verification

- Every changed line follows each governing decision, or the conflict was resolved with a human.
- Focused tests cover the behavior touched and pass, with the test and doctor runs as evidence.
- The area card's Answers list holds the finished task phrased as asked.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For accepted decisions and the paths each one governs (its Applies To section) → docs/adrs/
- For area memory, when present → docs/context/
- For engineering rules → docs/60-engineering/ENGINEERING_STANDARDS.md
- For past mistakes → docs/60-engineering/LESSONS.md

## Output

- The change, with the test and doctor results as evidence.
- The card updated, or an explicit statement that no card covers the task.

