# jev-search Agent Instructions

This repository uses Persist OS repository memory. Durable memory under `docs/` is the source of
truth over chat history; repository rules override model preference. If an instruction conflicts with
repository memory, stop and report it.

## Stop and ask

Stop and ask a human before continuing when:

- the task conflicts with an accepted ADR or engineering standards;
- a new runtime dependency, service, or data store is needed and no ADR covers it;
- auth, secrets, storage, or network behaviour changes;
- the requirements are too unclear to write a test;
- a fix would change an accepted non-goal.

Working unattended? Don't wait: the next section says what to do instead.

## Working unattended

When you were given a goal or a task list to work through on your own, nobody is there to answer,
so never stop and wait. Wherever these rules or a skill say "stop and ask" or "stop and report", do
this instead and keep going:

- Breaking an accepted ADR is still never allowed. Take the approach that keeps every accepted ADR
  intact. If a task can only be done by breaking one, skip that part, write the change it would need
  as a Proposed ADR (`persist adr create`), mark the task blocked, and move on to the next one.
- For a decision no ADR covers (a dependency, data model, or API shape), pick the simplest option
  that fits the accepted ADRs, record it as a Proposed ADR, follow it, and continue. Leave it
  Proposed: accepting it is the human's call.
- For unclear requirements, choose the simplest reasonable reading, write it down as an assumption in
  the feature plan or your report, and test that reading.
- When two sources conflict, follow the higher one in the source-of-truth order and note the
  conflict.
- Make auth, secrets, storage, or network changes the task asks for, run the security-review skill,
  and flag them for review. Never commit a secret.
- Never get unstuck by weakening a check: no `--no-verify`, no turning off the fence or doctor, no
  editing an accepted ADR, no deleting or skipping a failing test.
- Finish with a "Needs your review" list: Proposed ADRs, assumptions, blocked tasks, and
  security-sensitive changes, each with the file to open.

## Source of truth

Follow this order:

1. Accepted ADRs and repository decisions
2. Architecture docs
3. Engineering standards
4. Current PRD and accepted change requests
5. Security and testing docs
6. Module docs
7. Feature plans
8. Task files
9. MCP external context
10. Chat history

If two sources conflict, stop and report the conflict before changing files.

## Which skill for which job

- `implement-task` is the default for any code change.
- `write-tests` builds tests from acceptance criteria and risk.
- `create-adr` records a decision others can check.
- `drift-review` re-reviews a finished, non-trivial change with fresh context.
- `completion-report` hands back the evidence at the end of a task.
- `module-memory` plans or updates module memory where it is enabled.
- `plan-feature` plans a substantial feature, writing a one-page PRD first when none exists.
- `adr-compliance` checks the diff against each governing decision.
- `conventions-adherence` checks reuse of the named vocabulary.
- `security-review` reviews trust-boundary changes before they land.
- `chestertons-fence` reasons about unexplained logic before changing it.
- `context` finds and maintains area memory through cards.
- `capture-mcp-context` (from `persist mcp add`) records durable MCP context.

## Rules — follow on every change

- Every task, kept short:
  1. Start from what Persist hands you: the "Start here" block in the prompt, or run
     `persist context "<task>"` (`npx persist-os context "<task>"` when `persist` is not
     installed). Open those files and what the task itself needs; do not survey the repository.
  2. Each "Follow ADR-…" line is a rule for this change. Keep to it; if the task needs to break it,
     stop and ask. The pointers are where to start, not the limit of what applies: every accepted
     ADR and repository rule still binds, and when a card disagrees with an ADR, the ADR wins and
     the card gets fixed.
  3. Implement with focused tests.
  4. Before calling it done, check your changed lines against each governing decision
     (`persist doctor` names them), then run the tests and doctor.
  5. Add the task to the area card's Answers list, phrased the way it was asked.
- Read the Required reading below only when no card covers the area or the work is new ground: a new
  feature, module, data model, or security decision.
- Match ceremony to scope — both ways. A genuinely new feature, module, integration, data model, or
  security/architecture decision gets proper planning (PRD/plan/ADR as fit) — do not under-build it.
  A small addition or fix within an already-decided area (a component, helper, endpoint, bug fix)
  just gets implemented with focused tests — no planning docs. Judge by novelty and blast radius, not
  line count: a one-button change inside an existing feature is small; building that feature is not.
- Record substantial work with the persist CLI so the memory actually exists — a new feature →
  `persist feature create <name>` (then fill its plan); a real decision (a dependency,
  data model, auth/security choice, API shape) → `persist adr create <title>`. Run
  `persist adr accept <name>` yourself only when the human stated or confirmed the decision
  in this conversation (quote their words in the hand-back); otherwise leave it Proposed
  and say so. Reasoning left only in the chat is gone next session — if it is not in
  a file, it did not happen.
- Reuse what `docs/60-engineering/CONVENTIONS.md` names. Never reinvent a component, helper, client,
  type, or pattern it lists; when you make a new reusable one, add it there.
- When something breaks non-obviously, add a one-line lesson. Put it under the area it belongs to
  (create the area with an Applies To list if none fits). Put it under Always only if every task in
  this repository needs it. When a regression test or a CONVENTIONS rule now enforces a lesson, move
  it there or delete it, and name the test or rule in the commit. Delete a lesson that describes a
  temporary state once that state is fixed.
- Never contradict an accepted ADR in `docs/adrs/`. To change one, confirm with a human and run
  `persist adr supersede <old> <new-title>` — never overwrite an accepted decision.
- A Proposed ADR does not clear the fence; it is reported for review until a human accepts it.
  Never write an ADR just to quiet a fence warning.
- When doctor reports a fence warning and a human is in the conversation, ask before handing back:
  one question per file, quoting the warning's lines ("Was the behaviour in `splitEvenly`
  (lines 12-18) deliberate?"). Record their answer with the matching command — `persist fence add
  <path> --why "<reason>" --by <name>` for a real constraint, `persist fence add <path>
  --no-constraint --by <name>` when nothing is deliberate — and never pick the answer yourself.
- Working unattended, put each fence warning in the "Needs your review" list with the question and
  both ready-to-run commands, so the human answers with one command per file.
- When a human explains in conversation why code must stay a certain way ("the four writes have to
  stay separate because …"), record it with `persist fence add` right then, before any warning asks.
- A conflict with an accepted ADR means stop: fix the code, or ask a human and supersede the ADR.
  Never diverge quietly. Run the adr-compliance skill in full when the diff is large, touches several
  decisions, or touches money, auth, or the data model; otherwise step 4's quick check is enough.
- Work is done when `persist doctor` reports no errors, the tests pass, and every warning is fixed
  or listed under Needs your review with what the human has to decide. `PASSED` is the goal — but
  only a human can clear a warning that waits on them, so never claim "done" without that evidence.
- Run the `persist` CLI yourself; never ask the human to run it or web-search this project-local tool.
  If `persist` is not installed, run the same commands as `npx persist-os <command>`.

## Required reading

- `docs/00-product/PRODUCT.md`
- `docs/20-security/SECURITY_MODEL.md`
- `docs/50-quality/QUALITY_GATES.md`
- `docs/60-engineering/ENGINEERING_STANDARDS.md`
- `docs/60-engineering/CONVENTIONS.md`
- The Always lessons load every session; the lessons for your area arrive with the pointers. If
  they don't cover what you're doing, open the section of `docs/60-engineering/LESSONS.md` that
  does (the pointers list them).

## Persist commands

- `persist doctor` — validate repository memory; work is done when it reports no errors, the tests pass, and every warning is fixed or listed under Needs your review.
- `persist feature create <name>` — scaffold feature memory before non-trivial feature work.
- `persist adr create <title>` — propose a decision; `persist adr accept <name>` — accept it yourself only when the human stated or confirmed the decision in this conversation (quote them in the hand-back), otherwise leave it Proposed.
- `persist adr supersede <old> <new-title>` — record a changed decision (never overwrite an accepted ADR).
- `persist module create <name>` — scaffold module memory for a new responsibility boundary.
- `persist mcp add <server>` — capture an MCP tool's context into memory, offline.
