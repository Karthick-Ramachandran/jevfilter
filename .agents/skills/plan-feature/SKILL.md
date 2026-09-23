---
name: plan-feature
description: "Turn approved requirements into an implementation plan with tasks and a test plan, writing a one-page PRD first when no requirements exist. Use when planning a substantial feature from approved requirements before any implementation begins. Skip for small local changes (implement directly with focused tests), security reviews, and convention checks."
---

# Goal

Turn approved requirements into an ordered implementation plan without writing implementation code.

## Inputs

- Approved requirements or feature PRD.
- Acceptance criteria.
- Known constraints or release target.

## Workflow

1. When no requirements exist, write a one-page PRD first and get it approved; never plan from chat alone.
2. Restate the objective and acceptance criteria in one paragraph.
3. Identify the affected modules, docs, templates, and tests.
4. Record architecture impact and whether a new ADR is needed (propose it with `persist adr create`; accept it yourself only when the human stated or confirmed the decision in this conversation, quoted in the hand-back).
5. Break the work into ordered tasks, each with explicit completion evidence.
6. Derive the test plan from acceptance criteria, risks, and likely regressions.
7. Hand back the PLAN, TASKS, and TEST_PLAN paths before implementing; when working unattended through a goal or task list, continue straight into the first task with the implement-task skill.
8. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If requirements are missing → write the one-page PRD first (this absorbs the retired create-prd skill); if they are contradictory → stop and ask for them.
- If a task would change accepted non-goals → stop and ask for approval.
- If the request is a small local fix → skip this skill and implement directly with focused tests.

## Verification

- PLAN states the objective, scope, and architecture impact.
- Every task maps to an acceptance criterion or a stated risk.
- No implementation code was written.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For completion evidence rules → docs/50-quality/QUALITY_GATES.md
- For engineering rules → docs/60-engineering/ENGINEERING_STANDARDS.md
- For sensitive scope → docs/20-security/SECURITY_MODEL.md
- For prior decisions → docs/adrs/
- For module ownership, when module memory is enabled → docs/30-modules/

## Output

- Paths of the PLAN, TASKS, and TEST_PLAN files written.
- One-paragraph summary of scope and the recommended first task.

