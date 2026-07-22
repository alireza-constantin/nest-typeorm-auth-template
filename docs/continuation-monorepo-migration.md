# Better Commerce Continuation Brief — Monorepo Foundation

Last updated: 2026-07-22  
Purpose: work-to-home context relay for a new Codex session

## Start here

The next Codex should read, in order:

1. `docs/continuation-monorepo-migration.md` — this handoff;
2. `docs/architecture/0001-platform-principles.md` — accepted platform philosophy;
3. `docs/architecture/0002-monorepo.md` — accepted repository and workspace boundaries;
4. `docs/authorization-contract.md` — existing authorization behavior that must not regress;
5. `docs/operations.md` and `README.md` — current development and verification workflows.

Do not redesign ADR-0001 or ADR-0002 during the next implementation wave. Their immediate purpose is to guide a behavior-preserving repository migration.

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

At the time of this handoff, the repository is still a single root NestJS application. The monorepo migration has not started.

### Git state

- Branch: `main`
- Recorded HEAD when this handoff was written: `3f1b8b3 add platform principles ADR`
- `docs/architecture/0001-platform-principles.md` is modified.
- `docs/architecture/0002-monorepo.md` is a new untracked file.
- This continuation brief is also a new untracked file.
- No application code was intentionally changed while refining the ADRs.

The next Codex must run `git status --short` before editing and preserve all user changes. Do not reset, discard, or overwrite the documentation work. Do not stage or commit unless the user requests it.

If the home machine does not contain these files, the documentation changes were not transferred; obtain them through the user's normal Git or file-sync workflow before continuing.

### Current tooling

- Node observed at work: `v22.17.0`
- npm CLI observed through `npm.cmd`: `10.9.2`
- pnpm observed through `pnpm.cmd`: `11.9.0`
- Current package manager in the repository: npm
- Current lockfile: `package-lock.json`
- Current application framework: NestJS 11 and TypeScript
- Current database library: TypeORM
- Current infrastructure: PostgreSQL 16 and Redis 7 through root `docker-compose.yml`
- There is no application `Dockerfile`; Docker Compose currently starts only PostgreSQL and Redis.

On the work Windows machine, PowerShell blocks `npm.ps1` under the current execution policy. Use `npm.cmd` and `pnpm.cmd` when necessary. Do not weaken machine execution policy as part of this task.

### Current source layout

```text
src/                 NestJS application source
test/                end-to-end tests
docs/                architecture, contracts, and operations
docker-compose.yml   PostgreSQL and Redis only
nest-cli.json
tsconfig.json
tsconfig.build.json
eslint.config.mjs
package.json
package-lock.json
```

Important implemented capabilities already exist and must survive relocation:

- email/password registration and login;
- Argon2id password credentials;
- Redis-backed opaque sessions;
- idle and absolute session expiry;
- logout, logout-all, and password-change invalidation;
- CSRF protection and trusted-origin checks;
- Redis-backed abuse protection;
- email-verification services and endpoints, disabled for production registration until completed;
- database-authoritative staff roles and permissions;
- owner bootstrap and staff lifecycle rules;
- authorization audit records;
- structured logging and redaction;
- liveness/readiness probes;
- OpenAPI contract generation in development/test;
- unit and end-to-end regression suites.

### Current development database policy

The current pre-launch development database is disposable:

- TypeORM synchronization is enabled outside production.
- There are intentionally no current migration files.
- Entity changes are handled locally by resetting PostgreSQL and Redis and recreating the schema.
- Production synchronization is disabled.
- Reviewed production migrations and stable catalogue seeding must be restored before launch.

Do not introduce migration files during the monorepo relocation. Do not weaken the production prohibition on schema synchronization.

### Current root commands

The current npm commands include:

```text
npm.cmd run build
npm.cmd test -- --runInBand
npm.cmd run test:e2e -- --runInBand
npm.cmd run start:dev
npm.cmd run db:up
npm.cmd run db:down
npm.cmd run db:reset
npm.cmd run db:logs
npm.cmd run staff:bootstrap-owner -- owner@example.test
```

`db:reset` destroys local PostgreSQL and Redis volumes. Use it only for the explicitly disposable local/test environment and only when the target Compose project is confirmed.

## Exact next objective

Implement only the first ADR-0002 migration wave:

1. Convert the repository from npm to a pinned pnpm workspace.
2. Add Turborepo root task orchestration.
3. Move the existing NestJS application into `apps/api`.
4. Preserve all current application behavior and operational workflows.

This is a repository relocation and tooling change, not a backend redesign.

## Expected structure after this wave

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
scripts/

docker-compose.yml
eslint.config.mjs
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
turbo.json
```

Exact placement of Jest configuration may follow the existing Nest package conventions as long as root commands remain stable and tests resolve paths correctly.

Do not create empty `admin`, `reference-storefront`, `sdk`, `storefront-core`, `store-config`, copied-source distribution, or API-kernel implementations in this wave.

## Root command contract after migration

The repository should expose non-surprising root commands through pnpm, including:

```text
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm start:dev
pnpm db:up
pnpm db:down
pnpm db:reset
pnpm db:logs
pnpm staff:bootstrap-owner -- owner@example.test
```

Requirements:

- `lint` should be a non-mutating CI check; provide a separate `lint:fix` if automatic fixes are useful.
- `dev`/`start:dev` is persistent and must not be cached.
- end-to-end tests depend on mutable PostgreSQL and Redis and must not be cached.
- database lifecycle commands are root operational commands, not cacheable Turbo tasks.
- workspace package versions and tool versions must be pinned deliberately; do not commit `latest` ranges.
- internal workspace dependencies use `workspace:` when they are introduced.

## File-move and configuration risks

The implementation agents must explicitly handle these risks:

1. Moving both `src/` and `test/` under `apps/api` should preserve relative imports such as `test/../src`.
2. The current Jest unit configuration lives in the root `package.json`; it must move or be rewritten without changing test discovery.
3. The current e2e configuration uses `test/jest-e2e.json` and a setup file under `test/`.
4. `nest-cli.json`, `tsconfig.json`, and `tsconfig.build.json` currently assume the root application layout.
5. The owner-bootstrap script directly references `src/authorization/bootstrap/bootstrap-owner.cli.ts`.
6. Root `.env` loading currently relies on Nest/Node working-directory behavior. Preserve local configuration resolution deliberately; never read, print, move, or commit the real `.env` accidentally.
7. `.gitignore` currently contains root-oriented entries such as `/dist`; ensure nested application build and coverage outputs remain ignored.
8. `README.md`, `docs/operations.md`, and other command examples currently use npm and root paths.
9. `docker-compose.yml` should remain at the platform root unless there is a demonstrated reason to move it. It currently defines only PostgreSQL and Redis.
10. `package-lock.json` must remain until a clean pnpm installation and verification succeed. Remove it only after `pnpm-lock.yaml` is valid.
11. Do not modify authentication, authorization, session, CSRF, abuse-protection, database, or OpenAPI behavior merely to simplify the move.

## Delegation plan

The lead Codex should coordinate and review. Use four bounded implementation/review assignments, preferably GPT-5.6 Terra medium. Do not let agents concurrently edit overlapping root manifests.

### Agent 1 — Workspace foundation

Responsibilities:

- establish pinned pnpm and the workspace definition;
- create the private root package/task contract;
- add Turborepo configuration;
- define deterministic cache boundaries;
- avoid moving application source.

Agent 1 must complete and receive review before Agent 2 edits the same root configuration.

### Agent 2 — API relocation

Responsibilities:

- move the NestJS package into `apps/api`;
- update Nest, TypeScript, Jest, and package-relative paths;
- preserve source/test behavior;
- preserve the owner-bootstrap CLI;
- avoid internal module reorganization.

### Agent 3 — Operations and developer workflows

Start after the API relocation is stable.

Responsibilities:

- restore root Docker Compose lifecycle commands;
- preserve safe disposable-development reset behavior;
- update README and operations commands from npm to pnpm;
- preserve `.env` and configuration loading behavior without exposing secrets;
- update ignore patterns for nested outputs.

### Agent 4 — Independent verifier

Start after the main migration is assembled.

Responsibilities:

- inspect dependency and task boundaries;
- run the full verification matrix;
- check that no unrelated behavior changed;
- report failures with evidence;
- make only narrowly assigned fixes after review, rather than broadly rewriting the migration.

The lead Codex owns integration decisions, reviews every shared-file edit, and prevents agents from overwriting one another.

## Verification sequence

Before migration, establish a baseline if the environment permits:

```text
npm.cmd run build
npm.cmd test -- --runInBand
docker compose up -d
npm.cmd run test:e2e -- --runInBand
```

After migration, verify from a clean dependency state where practical:

```text
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd test -- --runInBand
docker compose up -d
pnpm.cmd test:e2e -- --runInBand
docker compose ps
```

Also verify:

- `pnpm start:dev` starts the API with the expected environment configuration;
- `/health/live` reports process liveness;
- `/health/ready` reflects both PostgreSQL and Redis;
- development OpenAPI remains available at `/docs` and `/docs/openapi.json`;
- production still omits interactive and machine-readable OpenAPI routes;
- owner bootstrap still accepts exactly one existing email and never a password;
- database reset remains clearly documented as forbidden in production;
- no test or build task incorrectly succeeds only because of stale Turbo cache.

If a command fails because Docker or dependencies are unavailable, record the exact blocker. Do not weaken tests or silently skip verification to make the migration appear complete.

## Acceptance criteria

The first migration wave is complete only when:

1. The root is a private pnpm workspace with one `pnpm-lock.yaml`.
2. The package-manager version and Turborepo version are pinned.
3. `apps/api` builds, typechecks, lints, and runs unit/e2e tests through root commands.
4. Existing authentication, authorization, session, security, health, OpenAPI, and bootstrap behavior is preserved.
5. PostgreSQL and Redis development workflows still operate from root commands.
6. Stateful e2e tests are not cached.
7. Nested build, coverage, and dependency outputs are ignored correctly.
8. README and operations documentation use the new pnpm commands.
9. `package-lock.json` is removed only after the pnpm lockfile and clean verification succeed.
10. No Admin, storefront, SDK, storefront-core, source-registry, API-kernel, or commerce-module implementation is introduced.
11. The working diff contains no unrelated refactors or formatting churn.

## Explicitly out of scope

Do not do any of the following in the next wave:

- create backend commerce modules;
- reorganize authentication or authorization internals;
- create `apps/api/src/kernel` speculatively;
- create Admin or storefront applications;
- generate or publish the SDK;
- implement storefront-core;
- implement a shadcn-compatible registry or CLI;
- add merchant storefront source to this repository;
- introduce a CMS or database page builder;
- add microservices, tenant abstractions, Nx, Kubernetes, remote caching, module federation, or dynamic plugins;
- introduce production migrations during this relocation;
- change database entities, session policy, permission semantics, or public API behavior.

## What follows this wave

After the monorepo foundation passes verification:

1. Review and accept ADR-0003 — Backend Architecture.
2. ADR-0003 should define module structure, sole authority over persistent state, public/private module contracts, transaction ownership, cross-module calls, kernel admission criteria, and an enforceable dependency matrix.
3. Implement ADR-0003 without mixing it with the repository relocation.
4. Continue with ADR-0004 — Commerce Domain Model.
5. Defer detailed storefront source-distribution mechanics to ADR-0012.
6. Add focused contract and event ADRs later without renumbering already referenced ADRs.

The API-internal kernel should not be created until ADR-0003 is accepted and a real shared primitive exists. Money and possibly a clock abstraction may eventually qualify. Inventory, order snapshots, module errors, and event infrastructure do not automatically belong in the kernel.

## Suggested opening instruction at home

The user can tell the next Codex:

> Continue Better Commerce from `docs/continuation-monorepo-migration.md`. Read that file and ADR-0001/ADR-0002 completely before acting. Preserve the current dirty worktree. Act as lead architect, delegate the bounded implementation work according to the handoff, and implement only the first monorepo migration wave. Do not redesign backend modules or build Admin, storefront, SDK, storefront-core, or registry functionality yet. Verify all existing auth, authorization, PostgreSQL, Redis, health, security, and OpenAPI behavior before declaring completion.

## Completion record for this documentation turn

This handoff records documentation decisions only. No monorepo migration, package-manager conversion, source move, application change, dependency installation, database reset, or Git commit was performed while creating it.
