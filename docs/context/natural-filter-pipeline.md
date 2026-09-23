# Natural filter pipeline

## Purpose

Natural language to validated filters: schema, parsers, provider questions, prepare/execute, Jev BYOK

## Answers

- read the product and understand it, make a clean releasable simpler version of the OSS project, accept Jev API tokens from others
- add a new field type to natural filter
- why did prepare return unavailable / unsupported / needs_clarification
- let each customer use their own Jev API key (bring your own key)
- change how dates like "last week" or "last 7 days" are parsed
- add a new provider (OpenAI, custom) behind the provider interface
- add a nasty query to the eval suite
- publish eval cases that fail on purpose (knownFailure)
- answer a public review/roast of the project
- added TYPESAFE_API_KEY in .env, run the evals against live Jev
- why did Jev drop a date or a category from the filters
- rename the package to jevfilter and bundle it for the npm launch
- rewrite the README (sharp, humanized) for launch
- build a hosted demo and landing page (see docs/context/demo-site.md)

## Also Known As

- jevfilter, JevFilter, JevFilter, jev-search
- natural-language search, NL filters, filter plan, interpretation chips
- BYOK, per-tenant key, TYPESAFE_API_KEY, x-jev-api-key
- Jev, TypeSafe, systemOne, choice question

## Start Here

- docs/00-product/PRD.md — full proposed spec; v0.1 is a deliberate subset (see the feature plan)
- docs/40-features/F-001-naturalfilter-core/PLAN.md — v0.1 scope, assumptions, acceptance criteria
- src/core.ts — compile questions, prepare (union result), execute (re-validate + re-authorize)
- src/parse.ts — deterministic date/number parsing and entity phrase candidates
- src/validate.ts — strict filter validator (the gate for untrusted filters)
- src/jev.ts — Jev provider, apiKey string | (context) => key | env
- src/provider.ts — FilterProvider contract (closed choices only)
- examples/tickets/tickets.ts — reference schema, resolver, scoped executor; used by tests and evals
- evals/cases.ts — nasty query suite

## Rules

- ADR-0004 publish as `jevfilter`, zero-dependency core, `jevfilter/jev` optional peer
- ADR-0002 stateless validated filters, no plan store (Accepted)
- ADR-0003 bring-your-own Jev key (Accepted)
- CONVENTIONS: FilterProvider, validateFilters, question ids, erasable-syntax-only TypeScript

## Pitfalls

- A provider answer is valid only if it is a key of the options asked; never parse labels back into values — use the decode map.
- Candidate entity labels must never be sent to the model; only phrases from the user's own text.
- Keyword baseline was tuned on the eval cases; its score says nothing about Jev quality.
- LESSONS "Natural filter pipeline": the 403 firewall on SQL-like text, resource name vs enum value collisions, DROP_CONFIDENCE.

## Applies To

- src/**
- examples/**
- evals/**
- test/**
