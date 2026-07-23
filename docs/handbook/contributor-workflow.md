# Contributor Workflow

Status: Living handbook  
Last verified: 2026-07-23

## Before changing code

1. Read [the documentation map](../README.md).
2. Read the accepted ADR and behavioral contract that own the area.
3. Inspect `git status --short` and preserve unrelated work.
4. Establish the relevant clean test baseline.
5. Keep the change inside one named capability or platform responsibility where
   practical.

An implementation plan cannot override an accepted ADR or behavioral contract.
If the requested behavior conflicts with one, resolve the decision first.

## Tooling

Run repository commands from the root.

Requirements:

- Node.js 22.17.0 or newer;
- pnpm 11.9.0;
- Docker Compose v2 for PostgreSQL/Redis and stateful tests.

Use `pnpm.cmd` on Windows when PowerShell blocks the `pnpm.ps1` shim. Do not
weaken the machine execution policy for this repository.

Install exactly from the committed lockfile:

```bash
pnpm install --frozen-lockfile
```

The platform monorepo has one root `pnpm-lock.yaml`. Do not create npm, Yarn, or
application-level lockfiles.

## Required verification

The normal root gates are:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test -- --runInBand
docker compose config --quiet
pnpm test:e2e -- --runInBand
```

Use uncached non-daemon Turbo commands when proving a structural migration:

```bash
pnpm exec turbo run build --force --no-daemon
pnpm exec turbo run typecheck --force --no-daemon
pnpm exec turbo run lint --force --no-daemon
pnpm exec turbo run test --force --no-daemon -- --runInBand
```

Run direct package commands when diagnosing whether a root orchestration failure
comes from Turbo or the API package:

```bash
pnpm --filter @better-commerce/api build
pnpm --filter @better-commerce/api typecheck
pnpm --filter @better-commerce/api lint
pnpm --filter @better-commerce/api test --runInBand
```

Regular `lint` is non-mutating. `lint:fix` and `format` modify files.

Stateful tests use the dedicated `better_commerce_test` database and isolated
Redis prefixes. They must not reset development data.

## Backend boundaries

- Organize business code by capability.
- A module alone mutates its persistent state.
- Import another business module only through its public `index.ts`.
- Do not export entities, repositories, query builders, or TypeORM from a
  Module Public Contract.
- Platform facilities do not import business modules.
- Do not traverse or cascade cross-module ORM relations.
- Keep the documented Authorization-to-Identity foreign-key metadata exception
  persistence-only.
- Use direct application-service calls for commands and required queries.
- Events are facts, not commands disguised as events.
- Domain code must not depend on NestJS, TypeORM, Redis, Express, or concrete
  infrastructure.
- Do not create `core`, `shared`, `common`, `helpers`, `utils`, or a kernel as a
  dumping ground.

The automated module-boundary suite is part of the API unit test run. Do not
weaken it to accommodate a shortcut.

## Database development policy

The current pre-launch development database is disposable:

- TypeORM synchronization is enabled in development and test;
- synchronization is disabled in production;
- current schema changes do not receive migration files;
- local entity changes may require `pnpm db:reset`;
- production launch remains blocked until reviewed baseline migrations and a
  stable seeding process exist.

`pnpm db:reset` destroys local PostgreSQL and Redis volumes. Follow the
[local-development runbook](../runbooks/local-development.md) and verify the
target Compose project before using it.

## Documentation responsibilities

- Durable architectural change: amend/supersede an ADR.
- Current topology change: update the living architecture.
- Observable security/API behavior change: update its contract and tests.
- Contributor-process change: update this handbook.
- Operational command or recovery change: update its runbook.
- Completed execution wave: mark its plan complete and refresh the continuation
  brief.

Do not duplicate a rule into every document. Link to its authoritative owner.

## Review checklist

Before handing off a change, confirm:

- the requested behavior is implemented without unrelated refactoring;
- module ownership and dependency direction remain valid;
- transactions commit and roll back all required writes;
- external side effects are not treated as database-transactional;
- authorization remains default-deny;
- logs, audits, and errors expose no secrets or authentication material;
- exact money and historical snapshot rules are preserved where applicable;
- direct and root verification pass;
- Docker-backed tests run when the change touches PostgreSQL, Redis, sessions,
  authorization, or transaction behavior;
- generated `dist`, `.turbo`, coverage, and temporary files are removed;
- `git diff --check` passes;
- documentation links resolve.
