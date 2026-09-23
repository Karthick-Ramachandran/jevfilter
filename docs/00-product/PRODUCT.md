# Product: NaturalFilter (npm `naturalfilter`)

## Purpose

Add natural-language filters to an existing API. A developer declares the fields their list
endpoint already supports. NaturalFilter turns a user's sentence into typed, validated filters (or a
clarification, or a clear refusal), and the developer's own read-only executor runs them inside the
user's authorized scope. Powered by Jev. No generated SQL.

Philosophy: **Models interpret. Code executes.** The model only chooses among closed options built
from the schema. Code parses values, validates, authorizes, and executes.

Full proposed spec: `jevfilter_PRD.md`. v0.1 scope: `docs/40-features/F-001-naturalfilter-core/PLAN.md`.

## Users

- **Primary:** TypeScript backend developers with an existing filtered list endpoint and auth. Success
  means integrating in minutes without granting a model database access or duplicating business rules.
- **End users:** authenticated operators who type a request, see the understood filters as chips,
  correct them, and get the same records they could reach through normal filters.
- **Adopters bring their own Jev key.** That can be one key per app, or one key per customer via a
  context function.

## Non-Goals

- Text-to-SQL, ORM generation, database agents, or database connectors (v0.1).
- Writes, exports, aggregation/analytics, ranking preferences, multi-turn memory.
- OR across fields, or multiple values in one field (v0.1).
- Claims of "100% safe" or "hallucination-free". The promise is that the model never gets direct
  authority over the database.

## Current Status

v0.1.0 implemented, unreleased: core, Jev provider, mock/keyword providers, ticket example,
playground, eval suite. Not evaluated against live Jev yet.
