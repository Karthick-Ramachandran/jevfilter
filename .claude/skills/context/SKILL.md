---
name: context
description: "Find and record area memory through context cards. Use when starting work in an area with history, when a task names code whose reasons live outside the source, or when finishing work the next task here should find. Skip for small fixes with no reusable reasoning, security reviews, and release planning."
---

# Goal

Start from recorded area memory instead of rediscovery, and leave the next task a better card.

## Workflow

1. Run `persist context "<task>"` before starting, phrasing the task the way it was asked.
2. Read only what the matches point at: the Start Here paths first, then the Rules and Pitfalls lines they name. The Always lessons load every session; the lessons for your area arrive with the pointers. If they don't cover what you're doing, open the section of `LESSONS.md` that does (the pointers list them).
3. When no card covers the task, read the closest decisions and fences the output names instead.
4. Do the work, then check the diff against the pointed-at rules before calling it done.
5. When done, create or refresh the area card: `persist context add <name> --purpose "<one line>"` for a new area, otherwise edit the existing card directly.
6. Put a new lesson under the area it belongs to (create the area with an Applies To list if none fits). Put it under Always only if every task in this repository needs it. When a regression test or a CONVENTIONS rule now enforces a lesson, move it there or delete it, and name the test or rule in the commit. Delete a lesson that describes a temporary state once that state is fixed.
7. Add the finished task to the card Answers list, phrased the way it was asked.
8. Run `persist context "<task>"` again to confirm the card is found before calling the work done.

## Decisions

- If the lookup names no card and no decision → say so; an empty result is a valid answer.
- If the area has no card yet → scaffold one with `persist context add`; never overwrite an existing card.
- If the card's pointers contradict the code → the code wins today; update the card and say so.

## Verification

- The lookup ran before any source file was read for the task.
- Only pointed-at files were read; no surrounding directory was explored.
- The card Answers list holds the finished task in its asked phrasing.
- A repeat lookup finds the card for that phrasing.

## Resources

- For area memory, when present → docs/context/
- For past mistakes → docs/60-engineering/LESSONS.md

## Output

- The card found and the pointed-at files read, or an explicit statement that none covers the task.
- The card created or updated, with the new Answers line quoted.

