# ADR-0003 Implementation Plan

Status: Completed  
Date: 2026-07-23  
Completed: 2026-07-23  
Authority: `docs/adr/0003-backend.md`

The user accepted the ADR-0003 implementation after Agent 3's complete
Docker-backed verification and waived the optional independent Agent 4 pass.

## Purpose

Implement the accepted and frozen ADR-0003 backend boundaries without changing
external behavior, database semantics, authentication, authorization, session
security, or operational contracts.

This is a structural and dependency-boundary migration. It does not add
commerce features.

## Current baseline

The repository is a pnpm/Turborepo monorepo with the NestJS API in `apps/api`.
The existing regression baseline is:

- root frozen pnpm installation passes;
- root uncached build, type-check, lint, and unit gates pass;
- 16 unit suites and 54 tests pass;
- three environment-independent end-to-end suites and 14 tests pass;
- Docker Compose configuration resolves PostgreSQL and Redis;
- one root `pnpm-lock.yaml` exists;
- ADR-0002's independent verifier found no workspace-boundary defect.

Docker Desktop's daemon was unavailable during the ADR-0002 verification.
PostgreSQL/Redis-backed end-to-end tests, live health/OpenAPI checks, and a real
owner-bootstrap run remain required when Docker is available.

## Target source ownership

Only directories with real code are created:

```text
apps/api/src/
  modules/
    identity/
      auth/
      session/
      persistence/
      identity.module.ts
      index.ts

    authorization/
      audit/
      bootstrap/
      data/
      enforcement/
      staff/
      authorization.module.ts
      index.ts

  platform/
    config/
    database/
    health/
    http/
    observability/
    openapi/
    redis/
    security/
```

Internal folder names may be simplified when existing code does not justify a
layer. The migration must not create empty `domain`, `application`,
`infrastructure`, `ports`, or `adapters` folders.

No Catalog, Pricing, Inventory, Orders, Payments, Fulfillment, reporting
service, SDK, Admin, storefront, event bus, outbox, CQRS structure, or kernel is
created.

## Non-negotiable behavior

The following must remain unchanged:

- existing HTTP routes, methods, status codes, and response shapes;
- current OpenAPI behavior and security metadata;
- password hashing and verification;
- registration, login, logout, logout-all, and password-change behavior;
- email-verification behavior and its current feature flag;
- Redis-backed sessions, cookie policy, idle expiry, absolute expiry, rolling
  behavior, and authentication-version validation;
- CSRF, trusted-origin, and abuse-protection behavior;
- staff roles, permissions, owner bootstrap, last-owner locking, escalation
  prevention, and audit behavior;
- privilege-change `authVersion` increments in the same PostgreSQL transaction
  as the authorization mutation and audit record;
- current development/test schema synchronization policy;
- production prohibition on schema synchronization;
- root pnpm, Turbo, Docker, and bootstrap commands.

No migration files are introduced during this pre-launch development stage.

## Known architectural hotspots

### Database bootstrap currently depends on business entities

`platform/database` must not import Identity or Authorization. The current
database-options factory explicitly imports and registers every entity.

The migration should make entity registration module-owned, using Nest
TypeORM's supported automatic entity registration or an equally narrow
composition-root mechanism. Verification must prove that every Identity and
Authorization entity is still registered in development, test, and the
stateful end-to-end application.

The platform database facility continues to own connection configuration. It
does not own business entity discovery rules hidden in a generic glob.

### Public-route metadata currently belongs to Auth

Health, root, and CSRF controllers currently import Identity's public-route
decorator. This would create a platform-to-business dependency.

The public-route metadata key and decorator should move to a narrow platform
HTTP-authentication metadata location. Identity's session guard consumes that
platform metadata. The platform facility defines only transport metadata; it
does not decide Identity policy.

### Authorization directly reads and writes Identity persistence

Staff lifecycle and owner bootstrap currently:

- load and lock `User` entities;
- validate `User.status`;
- read email data;
- increment `User.authVersion`;
- save the Identity-owned entity through Authorization's transaction manager.

The final implementation must replace these business-level accesses with an
Identity Module Public Contract while preserving the existing atomic
authorization transaction.

### Authorization uses cross-module ORM traversal

Authorization currently joins `StaffProfile.user` for staff responses and
last-owner checks. Final business logic must not navigate that relationship.

Foreign-key metadata may remain in Authorization's persistence mapping only to
preserve PostgreSQL integrity during TypeORM synchronization. It must use a
scalar user identifier, disable eager/lazy loading and cascades, and must not be
used by application logic.

Staff presentation queries may use:

- an Identity batch-query public contract; or
- a purpose-specific, read-only projection query.

They must not expose or mutate an Identity entity.

## Transaction-aware Identity contract

Authorization mutations and their Identity authentication-version change must
remain atomic in one PostgreSQL transaction.

The implementation therefore needs a minimal opaque transaction mechanism with
these properties:

- the application-visible transaction context does not expose TypeORM's
  `EntityManager`, repositories, or entities;
- a platform database adapter owns transaction creation and infrastructure-only
  unwrapping;
- module persistence code can join the same transaction;
- Identity owns user locking, active-status validation, lookup, and
  `authVersion` mutation;
- Authorization owns staff, role, assignment, owner, and authorization-audit
  mutations;
- rollback removes both modules' writes;
- the mechanism is tested with real PostgreSQL;
- it is not promoted into a kernel or generic repository framework.

The minimum Identity administration contract needed by existing Authorization
is expected to cover:

- lock and return a safe active-identity reference by user ID;
- lock and return a safe active-identity reference by normalized email for
  bootstrap;
- increment the authentication version inside the supplied opaque transaction;
- retrieve safe identity summaries in a batch or through a read projection when
  needed for staff responses.

Safe identity references contain only fields needed by the use case, such as
user ID and display email. They are not entities and expose no credentials,
normalized email unless specifically required by bootstrap lookup, verification
tokens, password data, or session data.

The exact method names may follow the codebase's conventions. The authority and
information boundaries above are mandatory.

## Module Public Contracts

The target public entry points are:

```text
modules/identity/index.ts
modules/authorization/index.ts
```

Identity's public entry point may export:

- `IdentityModule`;
- the authenticated-user request type required by consumers;
- the narrow Identity administration/query contract and injection token;
- authentication enforcement providers needed by the composition root.

Authorization's public entry point may export:

- `AuthorizationModule`;
- the administrative guard and route/permission decorators required by the
  composition root and module-owned controllers;
- stable authorization context types required by consumers.

Neither public entry point exports:

- TypeORM entities;
- repositories;
- data modules;
- internal application services;
- persistence DTOs;
- query builders;
- infrastructure clients;
- wildcard barrels for private subdirectories.

A persistence-only Identity entity metadata import used to declare an
Authorization foreign key is an explicit infrastructure exception. It is not
re-exported through `modules/identity/index.ts`.

## Dependency enforcement target

The final code and automated checks must enforce:

- platform code imports no business module;
- Identity imports platform facilities but no Authorization implementation;
- Authorization imports Identity only through `modules/identity/index.ts`,
  except the documented persistence-only foreign-key metadata location;
- no module imports another module's repositories or entities for application
  behavior;
- no business code traverses a cross-module ORM relationship;
- no cross-module cascade is enabled;
- domain code, when introduced, cannot import NestJS, TypeORM, Redis, Express,
  or platform implementations;
- application code cannot deep-import another module;
- circular module dependencies fail verification;
- the composition root may wire both modules and platform implementations.

Use existing ESLint/TypeScript capabilities and focused architecture tests
first. Do not add a large architecture framework merely for import checks.

## Sequential agent assignments

Agents work sequentially because they share one worktree and later assignments
depend on the previous boundary.

### Agent 1 — Platform facilities and composition boundary

Recommended model: GPT-5.6 Terra, medium reasoning.

Responsibilities:

1. Establish `apps/api/src/platform` using existing real facilities only.
2. Move configuration, database setup, Redis, observability, health, OpenAPI,
   and generic HTTP-security code while preserving behavior.
3. Move public-route metadata into the narrow platform HTTP location and update
   current consumers.
4. Remove business-entity imports from platform database configuration using
   module-owned entity registration or composition-root wiring.
5. Keep session policy outside platform because Identity owns it.
6. Update imports, tests, and root application composition.
7. Add no business module, transaction abstraction, or speculative layer.

Agent 1 acceptance:

- platform imports no `modules`, current `auth`, current `users`, or current
  `authorization` source;
- every current entity remains registered;
- build, type-check, lint, unit tests, environment-independent E2E, Compose
  validation, and diff-check pass;
- public routes remain public and protected routes remain protected;
- no generated artifact or unrelated formatting churn remains.

### Agent 2 — Identity consolidation and public contract

Recommended model: GPT-5.6 Terra, high reasoning.

Responsibilities:

1. Consolidate current `users`, `auth`, and `session` code under
   `modules/identity`.
2. Preserve current internal grouping where useful; do not manufacture empty
   DDD layers.
3. Create `IdentityModule` and the narrow `modules/identity/index.ts` public
   entry point.
4. Keep User, password credential, and email-verification token entities private
   to Identity persistence.
5. Introduce safe identity reference/result types needed by Authorization.
6. Prepare the minimum Identity administration operations required for Agent 3,
   without exposing repositories, entities, or raw TypeORM transaction objects.
7. Preserve all authentication, email verification, and session behavior.
8. Update composition and tests.

Agent 2 may leave one clearly documented temporary deep persistence import in
Authorization solely to keep the sequential worktree buildable. Agent 3 must
remove every business-level use before the implementation wave can pass.

Agent 2 acceptance:

- no root `auth`, `users`, or `session` capability directory remains;
- all Identity behavior is under one capability;
- the public entry point exports no persistence implementation;
- existing HTTP/OpenAPI/session behavior and test counts remain green;
- Authorization behavior is unchanged pending Agent 3.

### Agent 3 — Authorization authority, transactions, and enforcement

Recommended model: GPT-5.6 Sol, high reasoning.

This is the highest-risk assignment because it changes transaction
collaboration around security-sensitive writes.

Responsibilities:

1. Move current Authorization under `modules/authorization` while preserving its
   useful internal sub-capabilities.
2. Create a narrow Authorization Module Public Contract.
3. Replace direct User repository/entity business access in staff lifecycle and
   owner bootstrap with Identity's public administration/query contract.
4. Implement the minimal opaque transaction mechanism needed for atomic
   Identity and Authorization writes.
5. Remove application use of `StaffProfile.user` and other cross-module ORM
   traversal.
6. Preserve necessary PostgreSQL foreign keys through persistence-only metadata
   without eager/lazy loading or cascades.
7. Convert staff list/email composition to an efficient batch Identity query or
   read-only projection.
8. Preserve last-owner locking, privilege escalation rules, audit atomicity, and
   session invalidation through `authVersion`.
9. Add import/export boundary enforcement and architecture tests.
10. Run rollback and concurrency-sensitive PostgreSQL tests when Docker is
    available.

Agent 3 acceptance:

- Authorization performs no direct business write to Identity tables;
- Authorization application code imports no Identity entity or repository;
- one failed staff mutation rolls back Authorization, Identity
  `authVersion`, and audit writes together;
- one successful privilege mutation commits exactly the existing required
  changes;
- owner bootstrap remains idempotent and safe;
- last-owner and anti-escalation behavior remains intact;
- no cross-module ORM relationship is traversed by business code;
- boundary tests fail on representative forbidden imports;
- all previous verification remains green.

### Agent 4 — Independent architecture and behavior verifier

Recommended model: GPT-5.6 Terra, high reasoning.

Responsibilities:

1. Read ADR-0003 and this plan independently.
2. Audit module ownership, public exports, dependency direction, transaction
   boundaries, ORM relationships, foreign keys, and platform independence.
3. Run frozen install and uncached root build, type-check, lint, unit, and E2E
   gates.
4. Run direct API-package gates to detect root orchestration mistakes.
5. Start Docker Desktop if necessary and permitted; validate PostgreSQL and
   Redis using the dedicated test scope.
6. Run all stateful authentication and authorization E2E suites.
7. Validate live development startup, liveness/readiness, development OpenAPI,
   production OpenAPI absence, and a disposable real owner-bootstrap workflow.
8. Prove successful commit and rollback of the cross-module authorization
   transaction.
9. Audit for stale old directories, forbidden imports, entity leaks, extra
   lockfiles, migrations, cache/build artifacts, and unrelated changes.
10. Make only a narrowly scoped correction for an evidenced defect.

Agent 4 gives a pass/fail recommendation. It does not redesign ADR-0003.

## Lead-agent integration responsibilities

The lead Codex:

- runs agents sequentially;
- reviews each shared-file change before starting the next agent;
- rejects temporary compatibility imports after Agent 3;
- prevents agents from weakening tests or ADR invariants to obtain green gates;
- preserves the user's dirty worktree and creates no commit unless requested;
- records exact environmental skips rather than treating them as passes;
- updates the continuation relay after final verification.

## Verification matrix

Run from the repository root:

```text
pnpm install --frozen-lockfile
pnpm exec turbo run build --force --no-daemon
pnpm exec turbo run typecheck --force --no-daemon
pnpm exec turbo run lint --force --no-daemon
pnpm exec turbo run test --force --no-daemon -- --runInBand
docker compose config --quiet
pnpm test:e2e -- --runInBand
```

Verification must bypass stale cache. The non-daemon form is preferred on the
current Windows execution backend because the Turbo daemon has previously
introduced multi-minute process delays.

Also verify:

- direct `@better-commerce/api` build, type-check, lint, and unit commands;
- every TypeORM entity is registered;
- PostgreSQL and Redis readiness;
- authentication and authorization stateful E2E suites;
- live `/health/live` and `/health/ready`;
- development `/docs` and `/docs/openapi.json`;
- production omission of interactive and machine-readable OpenAPI routes;
- owner bootstrap accepts exactly one existing email and never a password;
- transaction commit and rollback across Identity and Authorization;
- no secret, session ID, password material, or token enters logs/audits;
- `git diff --check`;
- no generated `dist`, `.turbo`, coverage, or temporary artifacts remain.

## Completion criteria

ADR-0003 implementation is complete only when:

1. Existing Identity and Authorization behavior is preserved.
2. Real code lives under the target capability/platform ownership.
3. Platform facilities depend on no business module.
4. Identity and Authorization expose narrow Module Public Contracts.
5. Authorization no longer performs Identity persistence operations.
6. Cross-module authorization mutations remain atomically correct.
7. Cross-module ORM traversal and cascades are absent.
8. Deliberate foreign-key integrity remains.
9. Automated boundary checks reject representative violations.
10. All available clean verification gates pass.
11. Stateful gates pass with Docker, or the exact external blocker is recorded
    and remains a named pre-production verification item.
12. No commerce capability, kernel, event framework, repository framework,
    migration, or unrelated feature was introduced.

## Stop conditions

An agent stops and reports rather than improvising if:

- preserving atomic `authVersion` behavior would require weakening an
  authorization invariant;
- a foreign key cannot be preserved without exposing an entity as a general
  contract;
- external HTTP or OpenAPI behavior would change;
- a boundary rule creates a genuine circular business dependency;
- a proposed abstraction expands beyond the concrete Identity/Authorization
  use case;
- completing the work requires destructive access to non-test data.
