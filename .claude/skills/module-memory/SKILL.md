---
name: module-memory
description: "Plan or update module memory: a module's ownership, boundaries, tests, and governing decisions. Use when scaffolding or revising module memory where it is enabled. Skip for feature planning, ADR writing, drift reviews, and handover notes."
---

# Goal

Give each important module a memory its future tasks can start from.

## Inputs

- The module's responsibility boundary.
- Its tests, risks, and governing decisions, when known.

## Workflow

1. Confirm module memory is enabled; when no modules directory exists, scaffold it with `persist module create <name>`.
2. Record what the module owns, its boundaries, and what it explicitly does not own.
3. Record how the module is tested and which decisions govern it.
4. Keep DECISIONS and TASKS current when responsibilities, tests, or risks change.
5. Never overwrite an existing module file: update it in place.
6. Apply the shared Stop and ask list before continuing past any trigger (see AGENTS.md); when working unattended, follow its Working unattended section instead of waiting.

## Decisions

- If the work is a single fix inside decided ground → skip this skill and update the area card instead.
- If a boundary moves → record the move and the decision behind it; never redraw silently.

## Verification

- The module's ownership, boundaries, tests, and governing decisions are written down.
- No existing module file was overwritten; updates are in place.
- A new task in the module can start from this memory without rediscovery.

## Resources

- For the shared Stop and ask list → AGENTS.md
- For module ownership, when module memory is enabled → docs/30-modules/
- For prior decisions → docs/adrs/

## Output

- The module files created or updated.
- The boundary or responsibility that changed, or an explicit no-change statement.

