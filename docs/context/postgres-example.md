# Postgres example

## Purpose

Use JevFilter on top of an existing Postgres database: Docker, seeded multi-tenant orders, explicit parameterized SQL executor

## Answers

- say I have hundreds of records in my database, how do I use this tool on top of it
- use Docker locally, seed random complex data, and use it with a real use case, with a note
- how do validated filters become safe SQL
- how is tenant scope enforced in SQL
- what does { not: X } do with NULL columns

## Also Known As

- order desk, orders, Postgres, pg, docker compose, Colima, seed, read-only role
- parameterized SQL, allowlist, tenant_id, ILIKE resolver

## Start Here

- docs/adrs/ADR-0007-postgres-example-uses-docker-and-pg-as-example-only-dependencies.md — why pg and Docker are allowed here only
- examples/postgres/README.md — the adoption guide with the filter-to-SQL table and real outputs
- examples/postgres/orders.ts — schema, scoped resolver, explicit SQL executor (the file adopters copy)
- examples/postgres/db/init.sql — tables, indexes, read-only role
- examples/postgres/seed.ts — seeded random data (SEED env var)
- examples/postgres/cli.ts — the ask command (run it with npm run ask)
- examples/postgres/smoke.ts — live smoke run with cross-tenant assertions

## Rules

- ADR-0007 (example-only deps, parameterized SQL, tenant scope from session, read-only role)
- ADR-0003 (key from environment only)

## Pitfalls

- Root tsconfig excludes examples/postgres; typecheck it with its own `npm run typecheck`.
- Quote searches containing `$` in single quotes in the shell.
- LESSONS "Natural filter pipeline": the same value in two enum fields, and "shipped to X" read as a status.

## Applies To

- examples/postgres/**
