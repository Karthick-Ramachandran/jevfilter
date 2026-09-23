---
name: security-review
description: "Review a change for security risks before it is accepted. Use when a change touches a trust boundary — file writes, paths, dependencies, stored secrets, network calls, telemetry, MCP, auth — and needs a decision before merging. Skip for feature planning, test writing, and convention checks."
---

# Goal

Find security risks in a change before it is accepted.

## Inputs

- The change as a diff or summary.
- Test results, when they exist.

## Workflow

1. Identify changed trust boundaries: file writes, paths, dependencies, auth, stored secrets, network calls, telemetry, MCP.
2. Run scripts/scan-secrets.sh over the staged diff and treat matches as blockers until cleared. If scripts/ is unavailable (deleted or cannot execute), perform the same scan by reading the diff directly.
3. Check validation wherever user-controlled input reaches a file path, query, shell command, or template.
4. Check new dependencies and configuration changes for risk.
5. Check that tests cover the security-sensitive behavior.
6. Classify findings as blockers, risks, or documented tradeoffs.
7. Hand back the verdict with the finding list.

## Decisions

- If a credential is present in the change → blocker; stop and ask for its removal.
- If user-controlled input reaches a path, query, or shell command unvalidated → blocker.
- If the change conflicts with accepted repository memory → stop and ask for a human decision.

## Verification

- Every trust boundary the change touches has a finding or an explicit all-clear.
- Blockers name the exact file and line.
- No finding is generic filler.

## Resources

- For the security model → docs/20-security/SECURITY_MODEL.md
- For threat context, when present → docs/20-security/THREAT_MODEL.md

## Output

- Verdict: accept, accept with risks, or block.
- Finding list with files, lines, and severity.

