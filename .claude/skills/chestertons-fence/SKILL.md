---
name: chestertons-fence
description: "Reason about a fence crossing — a change to source logic with no recorded reason for its current shape. Use when a Chesterton fence warning fires on a staged change, when a diff touches logic that looks deliberate but unexplained, or when writing the human-confirmed reason to FENCES.md. Skip for planning work, security reviews, and convention checks."
---

# Goal

Decide whether the existing logic is deliberate and record the human-confirmed reason in FENCES.md.

## Inputs

- The staged change or diff the fence warning named.
- Access to the human who knows the constraint; name them in the record.

## Workflow

1. List which staged files the fence warning names and read the current logic in each.
2. For each file, state what the logic does today and what simpler shape tempts the change.
3. Ask the human why the logic is shaped this way; never infer the constraint from the code.
4. When the human confirms a real constraint, record it with `persist fence add <path> --why "<reason>" --by <name>`; never hand-write the entry, because the readers parse an exact shape.
5. When the human confirms the behaviour is accidental rather than deliberate, record that answer with `persist fence add <path> --no-constraint --by <name>`; never pick the answer yourself.
6. Append the crossing to the entry history with the date, the outcome, and who confirmed it.
7. Verify the entry against the Verification list and hand back the per-file outcome.

## Decisions

- If the change is a bug fix → answer one question only: was this behaviour intentional?
- If the human does not know or will not confirm → record nothing; a confident guess is worse than an empty file. A deferred crossing stays unrecorded.
- If the logic is accidental, not deliberate → record `--no-constraint` with the human's name; it is an answer, and it quiets the file.
- A Proposed ADR does not clear the fence; it is reported for review until a human accepts it. Never write an ADR just to quiet a fence warning.

## Verification

- Every file the warning named has an outcome: fenced with `--why`, answered with `--no-constraint`, or deferred with nothing recorded.
- Each fence entry names the human who confirmed the reason.
- No Why was inferred from code alone; every reason traces to a human answer.
- Each entry was written by `persist fence add`, so the shape the readers parse is guaranteed.

## Resources

- For recorded fences and their history → docs/60-engineering/FENCES.md

## Output

- Outcome per file: fence recorded, accidental (no record), or deferred to a human.
- The FENCES.md entry written, or an explicit statement that nothing was recorded.

