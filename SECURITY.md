# Security

## Reporting a vulnerability

Please report security issues privately via GitHub's "Report a vulnerability" (Security Advisories)
on this repository. Do not open a public issue. We aim to reply within 5 working days.

## What JevFilter guarantees

- Providers can only choose among closed options that the library built from your schema. Any other
  answer makes the result `unavailable`, and your executor is never called.
- Numbers and dates are parsed by code. Entity ids come only from your resolver.
- `execute()` re-validates filters strictly, and runs `authorize` again, on every call.
- Jev keys are never logged, cached across requests, or included in results or errors.
- User text goes to the provider as `state`, separate from the instructions compiled from your schema.
- The core library sends no telemetry.

## What it cannot guarantee

- That the model understands every request. An allowed filter can still have the wrong meaning.
  Show the interpretation chips to users.
- That your executor, resolver, or `authorize` are correct. Your executor must apply tenant/user
  scope from the trusted session as an outer AND, and use least-privilege, read-only credentials.
- Data handling by the model provider. The search text (never your records or credentials) is sent
  to the configured Jev endpoint. Review TypeSafe's terms before sending sensitive text.
