# Better Commerce Continuation Brief — Monorepo Foundation

Last updated: 2026-07-23
Purpose: work-to-home context relay for a new Codex session

## Start here

The next Codex should read, in order:

1. `docs/continuation-monorepo-migration.md` — this handoff;
2. `docs/architecture/0001-platform-principles.md` — accepted platform philosophy;
3. `docs/architecture/0002-monorepo.md` — accepted repository and workspace boundaries;
4. `docs/architecture/0003-backend.md` — accepted and frozen backend module architecture;
5. `docs/authorization-contract.md` — existing authorization behavior that must not regress;
6. `docs/operations.md` and `README.md` — current development and verification workflows.

Do not redesign ADR-0001, ADR-0002, or ADR-0003 during the next implementation
wave. ADR-0003 is frozen; normative changes require its amendment process.

## User intent

Better Commerce is a production-grade commerce platform maintained by one developer today and intended to power multiple unrelated stores over time.

The user wants Codex to act as the lead architect and coordinator. Implementation should be delegated to four bounded agents when agent tooling is available. The preferred cost/power balance is GPT-5.6 Terra at medium reasoning unless a concrete task justifies more.

The user values:

- maintainability over speculative scale;
- strong authentication and authorization;
- separate deployments and data for each merchant store;
- bespoke storefronts that feel exclusive rather than CMS-generated;
- static, source-controlled merchant pages and copy;
- reuse without manually copying commerce or security logic;
- explicit architecture decisions before large implementation changes.

## Accepted architecture context

### Platform and deployments

- The backend is a modular monolith, not microservices.
- Every merchant store is a separate deployment with its own PostgreSQL, Redis, secrets, media, backups, and lifecycle.
- The system is not a multi-tenant runtime. Do not add `tenantId`, `merchantId`, or store-resolution middleware merely to distinguish deployments.
- Platform business logic contains no merchant-specific conditionals or forks.
- A backend module is the sole authority over mutations to its persistent state. ADR-0003 will formalize this before internal module restructuring.

### Platform repository versus storefront repositories

- The Better Commerce repository is the monorepo for shared platform source.
- API, Admin, future public packages, tooling, and a reference storefront belong here.
- Every production merchant storefront has its own repository, lockfile, CI pipeline, static content, visual source, and deployment artifact.
- Production merchant text, pages, branding, and bespoke storefront code do not belong in this platform repository.
- A merchant storefront is an external presentation consumer, not a fork of backend business logic.

### Storefront reuse model

There are two ownership models:

1. Versioned runtime packages remain in `node_modules`. Security-sensitive and correctness-critical SDK, session, cart, checkout, error, and API-orchestration mechanisms belong here.
2. Presentation source may be copied into a storefront and customized locally. Markup, styling, page composition, product cards, visual checkout pages, and similar source may diverge.

The exact copied-source distribution mechanism is intentionally not selected by ADR-0002. A future ADR-0012 will decide whether and how to use a shadcn-compatible registry or CLI, including catalogue format, provenance, diffs, and updates.

Do not implement a source registry in the next wave.

### Content model

- Merchant marketing pages use content-as-code and static prerendering.
- A general-purpose CMS or database-driven page builder is a non-goal.
- Dynamic commerce facts still come from the API.
- Prices, inventory, discounts, tax, checkout eligibility, authorization, and order creation remain API-authoritative even when a page is statically rendered.

## Current repository reality

The first ADR-0002 migration wave is implemented.

### Current tooling and layout

- Node.js requirement: 22.17.0 or newer.
- Package manager: pnpm 11.9.0, pinned in the root manifest.
- Workspace orchestrator: Turborepo 2.5.4.
- One root `pnpm-lock.yaml`; no npm lockfile.
- The NestJS application is the `@better-commerce/api` package under
  `apps/api`.
- Root `docker-compose.yml` starts PostgreSQL 16 and Redis 7 only.
- There is still no application Dockerfile.

```text
apps/
  api/
    src/
    test/
    package.json
    nest-cli.json
    tsconfig.json
    tsconfig.build.json

docs/
docker-compose.yml
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
turbo.json
```

Do not create empty Admin, reference-storefront, SDK, storefront-core,
store-config, registry, or API-kernel implementations. Those need their focused
architecture decisions and real consumers.

### Root command contract

Run platform commands from the repository root:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test -- --runInBand
pnpm test:e2e -- --runInBand
pnpm start:dev
pnpm db:up
pnpm db:down
pnpm db:reset
pnpm db:logs
pnpm staff:bootstrap-owner -- owner@example.test
```

Root build, type-check, lint, unit, and end-to-end commands are orchestrated
through Turborepo. Persistent development tasks and stateful end-to-end tests
are not cached. Database lifecycle commands remain direct root operations.
Use `pnpm --filter @better-commerce/api <script>` only when intentionally
targeting the API package.

On Windows, use `pnpm.cmd` if PowerShell blocks the `pnpm.ps1` shim. Do not
weaken the machine execution policy.

### Environment and local data

The API deliberately resolves the ignored root `.env` after relocation.
`.env.example` contains development-only placeholders and matches the local
Compose services. Production secrets remain deployment inputs.

The pre-launch development database policy remains disposable:

- TypeORM synchronization is enabled in development and test.
- There are intentionally no current migration files.
- `pnpm db:reset` destroys both local PostgreSQL and Redis volumes.
- Development/test startup idempotently synchronizes the built-in
  authorization catalogue.
- There is no general seed command.
- Public registration creates a development user; the initial owner is then
  bootstrapped with the root owner command.
- Production synchronization is disabled. Reviewed migrations and stable
  production seeding must exist before launch.

The stateful end-to-end suites create/use `better_commerce_test` and isolated
Redis prefixes; they do not reset development volumes.

## Migration completion record

### Agent 1 — workspace foundation

Completed:

- pinned pnpm workspace and single lockfile;
- pinned Turborepo root orchestration;
- non-mutating lint and separate fixing commands;
- deterministic cache exclusions and dependency build-script policy.

### Agent 2 — API relocation

Completed:

- moved the backend package to `apps/api`;
- relocated Nest, TypeScript, Jest, source, and test configuration;
- preserved root environment loading and owner-bootstrap behavior;
- restored root Turbo orchestration for the relocated package.

### Agent 3 — operations and developer workflow

Completed:

- updated README and operations guidance to pnpm/Turbo and `apps/api`;
- documented root orchestration versus direct package filtering;
- clarified prerequisites, setup, verification, Docker lifecycle, disposable
  resets, test database isolation, and owner bootstrap;
- improved `.env.example` explanations without adding real secrets.

The clean pnpm reinstall showed that Agent 2's Redis-store compatibility cast
was no longer needed and violated the non-mutating lint gate. Agent 3 removed
only that type assertion; build and type-check confirm the direct assignment.
No authentication, authorization, session runtime, entity, dependency, or
application-structure behavior changed.

Agent 3 verification:

- frozen pnpm installation passed;
- uncached build, type-check, lint, and unit gates passed;
- all 16 unit suites and 54 tests passed;
- Docker Compose configuration validation passed;
- three environment-independent end-to-end suites and all 14 tests passed;
- owner-bootstrap rejected a missing email before opening dependencies;
- generated build and cache artifacts were removed.

The Docker Desktop Linux engine was unavailable on the work machine
(`//./pipe/dockerDesktopLinuxEngine` did not exist). Agent 3 therefore could not
start PostgreSQL/Redis, run the two stateful end-to-end suites, start the full
API, exercise health probes, or bootstrap a real existing user.

### Agent 4 — independent migration verifier

Completed:

- independently audited pnpm, Turbo, API package, Nest, TypeScript, Jest,
  environment, Compose, lockfile, and documentation boundaries;
- passed frozen installation and uncached build, type-check, lint, and unit
  gates;
- passed all 16 unit suites and 54 tests;
- passed three environment-independent end-to-end suites and all 14 tests;
- confirmed no stale root source/test layout, recursive task orchestration,
  extra lockfile, or generated artifact remained;
- recommended accepting ADR-0002 and proceeding to ADR-0003.

Docker Desktop's daemon was unavailable
(`open //./pipe/docker_engine: The system cannot find the file specified`).
Stateful PostgreSQL/Redis end-to-end tests, live health/OpenAPI probes, and a
real-user owner bootstrap still need one later run on a machine with Docker.

## Exact next objective

ADR-0003 — Backend Module Architecture is accepted and frozen. Implement it as
a behavior-preserving backend-boundary migration, separately from the completed
repository relocation.

The implementation wave should:

1. establish explicit business-module and platform-facility locations and
   public entry points without creating empty future commerce modules;
2. consolidate current `users`, `auth`, and session-policy ownership under
   Identity while preserving every existing HTTP and session contract;
3. preserve Authorization as a separate data authority and replace
   business-level Identity repository/entity access with Identity's Module
   Public Contract;
4. confine necessary foreign-key metadata to persistence mapping and prohibit
   cross-module ORM traversal and cascades;
5. classify configuration, database, Redis, observability, health, OpenAPI, and
   generic HTTP-security mechanisms as platform facilities;
6. add lightweight static boundary checks and keep all current regression tests
   green;
7. run an independent final verification, including the previously skipped
   Docker-backed checks when the engine is available.

Do not create Catalog, Pricing, Inventory, Orders, CQRS, an event bus, an
outbox, generic repository abstractions, or `apps/api/src/kernel` during this
wave.

## What follows ADR-0003 implementation

1. Review and accept ADR-0004 — Commerce Domain Model.
2. Let ADR-0004 decide the concrete commerce capability map, including Catalog,
   Pricing, Inventory, and Orders.
3. Implement commerce capabilities incrementally under ADR-0003's boundaries.
4. Keep detailed storefront source-distribution mechanics for ADR-0012.

The API-internal kernel remains absent until a real primitive satisfies every
ADR-0003 admission criterion. Money and possibly a clock abstraction may
eventually qualify; inventory, order snapshots, generic events, generic errors,
IDs, and helpers do not qualify merely because multiple files could import
them.

## Suggested opening instruction on another machine

> Continue Better Commerce from `docs/continuation-monorepo-migration.md`. Read
> it and ADR-0001/ADR-0002/ADR-0003 completely, then inspect the actual Git
> state. Preserve all existing changes. ADR-0002's pnpm/Turbo migration is
> complete, and ADR-0003 is accepted and frozen. Plan and execute only the
> behavior-preserving ADR-0003 backend-boundary migration. Do not build Admin,
> storefront, SDK, storefront-core, registry, kernel, or new commerce modules.
