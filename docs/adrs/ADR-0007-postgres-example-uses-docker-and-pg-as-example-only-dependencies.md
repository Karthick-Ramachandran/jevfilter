# ADR-0007: Postgres Example Uses Docker And Pg As Example Only Dependencies

## Status

Accepted

## Context

Adopters ask how to put JevFilter on top of a real database with hundreds of records. The
maintainer asked for a local Docker database seeded with random, complex data, used in a real use
case, with a note explaining how to adopt it (2026-09-23). That needs a database driver and a
container runtime, which ADR-0004 keeps out of the package.

## Decision

- Add `examples/postgres/`: a self-contained example with its own `package.json`. Its
  dependencies (`pg`, and dev tooling if needed) never enter the published package.
- `docker-compose.yml` runs Postgres locally. A seed script generates multi-tenant, relational,
  random-but-seeded data.
- The executor maps validated filters to **parameterized SQL with an allowlist of columns and
  operators**. Tenant scope comes from the session as an outer `WHERE tenant_id = $1`, never from
  filters. The model never sees SQL, the schema, or rows. The database role used by the example is
  read-only (SELECT only).
- Credentials are local development defaults held in the compose file and `.env.example`. A real
  Jev key is read from the environment and never written to a file.

## Applies To

- examples/postgres/**

## Alternatives Considered

- An ORM (Prisma/Drizzle): hides the SQL mapping, which is the thing adopters need to see; adds
  heavier tooling.
- SQLite: needs no Docker, but the maintainer asked for Docker, and Postgres is the common production target.

## Consequences

- Adopters get a copyable, realistic pattern for "filters → safe SQL".
- The example requires Docker to run. The root package and CI are unaffected.

## Related Documents

- PRD: jevfilter_PRD.md (section 9, SEC-02 parameterized queries, least privilege)
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature:
