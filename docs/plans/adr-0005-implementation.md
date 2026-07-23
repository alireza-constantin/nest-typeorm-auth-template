# ADR-0005 Catalog Implementation Plan

Status: Proposed
Date: 2026-07-23
Authority:

- `docs/adr/0003-backend.md`
- `docs/adr/0004-commerce-model.md`
- `docs/adr/0005-catalog.md`
- `docs/contracts/authorization.md`
- `docs/contracts/catalog.md`

## 1. Objective

Implement the approved initial Catalog contract inside the NestJS modular
monolith without introducing Pricing, Inventory, Orders, deferred Catalog
features, or customer-specific storefront code.

The completed slice must allow authorized staff to create, configure, publish,
unpublish, archive, and restore Products while public callers can read only
published Products and active Variants. Every Product begins with one stable
default Variant, and other modules can resolve Variant facts only through
Catalog's Module Public Contract.

## 2. Delivery rules

Only Agents 1, 2, 3, and 4 participate. They work sequentially in one shared
worktree. Each agent:

- reads every authority document listed above before editing;
- inspects and preserves unrelated dirty-worktree changes;
- treats previously completed agent work as owned input, not disposable code;
- updates tests with the behavior it introduces;
- reports exact commands, counts, failures, and remaining risks;
- does not edit `docs/plans/continuation.md`;
- creates no migration files during the current disposable-schema stage;
- creates no deferred module, empty abstraction, generic repository, event bus,
  outbox, worker, or storefront implementation;
- does not commit, push, or rewrite Git history unless the user separately
  authorizes it.

No agent weakens an accepted ADR or contract to make a test pass. A discovered
contract conflict stops implementation for architectural review.

## 3. Recommended model allocation

Use a balanced allocation:

| Agent | Recommended model | Reason |
| --- | --- | --- |
| Agent 1 | GPT-5.6 Terra, high reasoning | Domain and PostgreSQL invariants need careful state and concurrency reasoning |
| Agent 2 | GPT-5.6 Terra, high reasoning | Application transactions and Module Public Contract cross several internal boundaries |
| Agent 3 | GPT-5.6 Terra, medium reasoning | HTTP, authorization, validation, and OpenAPI are broad but follow established repository patterns |
| Agent 4 | GPT-5.6 Terra, high reasoning | Independent adversarial verification needs enough depth to find boundary and concurrency defects |

Use the stronger Sol model only if an agent encounters a genuinely difficult
concurrency or architecture defect after evidence-based investigation. Do not
pay the higher cost by default.

## 4. Target source boundary

The implementation introduces only the structure justified by real code:

```text
apps/api/src/modules/catalog/
  catalog.module.ts
  index.ts
  domain/ or feature-local domain files
  persistence/
  application/
  http/
```

Folder names may be flatter where that is clearer. The mandatory boundary is
behavioral:

- Catalog owns its state and mutations.
- `modules/catalog/index.ts` is its only cross-module import surface.
- Catalog domain code imports no NestJS, TypeORM, Express, Redis, or HTTP types.
- Persistence and HTTP types are not exported through the Module Public
  Contract.
- `app.module.ts` remains the composition root.
- platform facilities do not import Catalog.

The existing architecture fitness test is extended to cover Catalog. It must
reject private deep imports and public exports of entities, repositories,
TypeORM, or query builders.

## 5. Agent 1 — Domain and persistence foundation

### Mission

Implement Catalog-owned domain rules, normalization, persistence mappings, and
database constraints with no HTTP controllers.

### Required work

1. Introduce `CatalogModule` only with providers required by this wave.
2. Implement Product lifecycle values:
   - `draft`;
   - `published`;
   - `archived`.
3. Implement Variant lifecycle values:
   - `active`;
   - `archived`.
4. Implement fulfillment classifications:
   - `physical`;
   - `digital`;
   - `service`.
5. Implement and test centralized normalization:
   - Unicode NFKC slug normalization;
   - locale-independent case comparison;
   - slug grammar and reserved-route rejection;
   - SKU display/canonical forms;
   - Option and Option-value canonical comparison;
   - all approved text and aggregate limits.
6. Implement Catalog persistence for:
   - Products;
   - slug aliases/reservations;
   - Variants;
   - Product Options;
   - Option values;
   - Variant selections;
   - deterministic combination uniqueness.
7. Implement database constraints for ownership, lifecycle values,
   nullability, ordering uniqueness, slug namespace, SKU uniqueness, and
   referential integrity.
8. Implement Product creation persistence so Product, slug reservation, and
   default Variant commit or roll back atomically.
9. Implement persistence operations needed for aggregate load/save with
   expected-version comparison, but do not expose a generic repository.
10. Add the minimum `CatalogModule` registration to the composition root so
    TypeORM metadata and module verification run.
11. Extend architecture checks for Catalog's private/public boundary.

### Required tests

- table-driven normalization and limit tests;
- lifecycle rule unit tests;
- simple/default Variant invariants;
- Option/value/selection consistency tests;
- duplicate-combination tests;
- Docker-backed slug and alias uniqueness tests;
- Docker-backed SKU uniqueness tests including archived Variants;
- concurrent uniqueness tests;
- create rollback tests;
- aggregate-version compare/update persistence tests;
- module-boundary tests.

### Explicit exclusions

Agent 1 does not implement:

- administrative or public controllers;
- authorization permission changes;
- OpenAPI DTOs;
- Pricing or Inventory placeholders;
- Categories, Collections, media, or Attributes;
- generic repositories or a speculative domain framework.

### Exit gate

Agent 1 hands off only when:

- direct API build, typecheck, lint, and relevant tests pass;
- Docker-backed Catalog persistence tests pass against isolated test state;
- existing Identity and Authorization unit tests remain green;
- no generated migration exists;
- the public Catalog entry point leaks no persistence type.

## 6. Agent 2 — Application behavior and Module Public Contract

### Mission

Build Catalog commands and queries on Agent 1's foundation, including atomic
aggregate behavior and the narrow internal contract. No HTTP controller is
introduced in this wave.

### Required work

1. Implement application commands for:
   - Product creation;
   - merchandising edits and atomic slug aliasing;
   - configuration replacement;
   - publish;
   - unpublish;
   - archive;
   - restore.
2. Enforce every approved publication requirement.
3. Enforce every pre- and post-first-publication configuration rule.
4. Enforce one fulfillment classification per Product in version 1.
5. Apply `expectedVersion` atomically to every Product mutation.
6. Increment the aggregate version exactly once per successful command.
7. Translate domain and persistence conflicts into stable application errors
   without leaking PostgreSQL or TypeORM details.
8. Implement bounded administrative list/detail application queries.
9. Implement public published Product list and canonical/alias resolution
   queries without creating controllers.
10. Export immutable Module Public Contract operations:
    - `resolvePurchasableVariants`;
    - `getVariantSnapshotFacts`.
11. Ensure public contract responses contain Catalog facts only and do not
    invent price, stock, currency, or availability.

### Required tests

- every allowed and rejected lifecycle transition;
- publish requirement matrix;
- edit and slug-alias atomicity;
- stale-version no-write behavior;
- exactly-once version increment per command;
- configuration replacement before publication;
- permitted and rejected post-publication changes;
- rollback of multi-row aggregate changes;
- public visibility queries;
- canonical and historical slug resolution;
- bounded deterministic list behavior;
- Module Public Contract behavior and export-surface checks.

### Exit gate

Agent 2 hands off only when:

- Agent 1's full evidence remains green;
- every application command has success, conflict, and rollback coverage;
- the internal contract is narrow and immutable;
- no application service accesses another module's repository;
- no HTTP behavior has been invented outside the approved contract.

## 7. Agent 3 — Authorization and HTTP contracts

### Mission

Expose the approved administrative and public HTTP contracts, integrate Catalog
permissions into Authorization, and complete transport/security/OpenAPI
verification.

### Required work

1. Add the stable permissions:
   - `catalog.products.read`;
   - `catalog.products.write`;
   - `catalog.products.publish`;
   - `catalog.products.archive`.
2. Update built-in role grants exactly as approved:
   - owner: every permission explicitly;
   - administrator: all Catalog permissions;
   - catalog manager: all Catalog permissions;
   - marketing manager: read only;
   - no unapproved grants to other roles.
3. Amend `docs/contracts/authorization.md` in the same change so its permission
   catalogue and role matrix remain authoritative.
4. Implement administrative endpoints under `/api/v1/admin/catalog`.
5. Implement public endpoints under `/api/v1/catalog`.
6. Apply existing session authentication, default-deny Admin enforcement,
   trusted-origin checks, and CSRF protection.
7. Implement DTO validation for every exact field and approved limit.
8. Implement bounded opaque cursor pagination and allow-listed filtering.
9. Implement the stable problem codes and status semantics from the Catalog
   contract.
10. Ensure public not-found behavior does not disclose draft/archive existence.
11. Document both surfaces in OpenAPI without exposing internal DTO or
    persistence details.
12. Update the living architecture map and relevant handbook/runbook only when
    implementation behavior actually requires it.

### Required tests

- all administrative endpoint success paths;
- unauthenticated `401`;
- ordinary customer and insufficient-permission `403`;
- exact permission matrix and default-deny metadata enforcement;
- CSRF and trusted-origin rejection for mutations;
- request validation and aggregate limits;
- every conflict/error translation;
- public draft/archive/unknown indistinguishability;
- public canonical and alias detail behavior;
- deterministic cursor pagination;
- OpenAPI route, schema, permission, and error coverage;
- regression tests for existing Identity and Authorization behavior.

### Exit gate

Agent 3 hands off only when:

- all direct API and root build/typecheck/lint/unit gates pass;
- Docker-backed Catalog E2E tests pass;
- existing authentication and authorization E2E tests remain green;
- authorization documentation and code-owned grants agree exactly;
- no Catalog response contains price, stock, availability, private normalized
  columns, entities, or persistence errors.

## 8. Agent 4 — Independent production-readiness verification

### Mission

Review and test the completed Catalog slice adversarially. Agent 4 does not
redesign accepted behavior and does not perform unrelated refactoring.

### Review focus

1. Trace every Catalog-contract acceptance criterion to code and automated
   evidence.
2. Inspect module imports/exports for ownership leakage.
3. Attempt concurrent:
   - duplicate slug creation;
   - slug alias collisions;
   - duplicate SKU creation;
   - duplicate Variant combinations;
   - stale-version mutations.
4. Verify rollback leaves no partial Product, Variant, alias, Option,
   selection, or version change.
5. Verify public visibility fails closed.
6. Verify every Admin handler declares exact permissions.
7. Verify role grants and anti-escalation behavior remain correct.
8. Verify content, errors, logs, and OpenAPI expose no prohibited internals.
9. Verify no migration, Pricing, Inventory, Order, Media, Category, Collection,
   Attribute, event, worker, or storefront scope leaked into the slice.
10. Run uncached root and direct package gates plus Docker Compose validation.

### Defect policy

Agent 4 may fix a localized defect only when:

- the accepted contract makes the correct result unambiguous;
- the fix stays inside Catalog or the exact Authorization integration;
- a failing regression test is added first or alongside the fix;
- all affected gates are rerun.

An architectural ambiguity or contract conflict is reported for user review
instead of being decided silently.

### Exit gate

Agent 4 reports:

- pass/fail for every contract acceptance criterion;
- exact test commands and counts;
- any defect fixed and its regression evidence;
- remaining production blockers;
- confirmation that deferred scope is absent.

## 9. Verification commands

Agents use repository scripts as the source of truth. Expected gates include:

```bash
pnpm --filter @better-commerce/api build
pnpm --filter @better-commerce/api typecheck
pnpm --filter @better-commerce/api lint
pnpm --filter @better-commerce/api test --runInBand

pnpm exec turbo run build --force --no-daemon
pnpm exec turbo run typecheck --force --no-daemon
pnpm exec turbo run lint --force --no-daemon
pnpm exec turbo run test --force --no-daemon -- --runInBand

docker compose config --quiet
pnpm test:e2e -- --runInBand
git diff --check
```

On Windows, agents use `pnpm.cmd` if PowerShell blocks the script shim.

No agent runs `pnpm db:reset` unless isolated Catalog verification truly
requires a disposable development reset and the target Compose project has
been verified. Normal automated tests use the dedicated test database and
isolated Redis state.

## 10. Completion evidence

The implementation is complete only when:

- all 32 Catalog-contract test obligations are mapped to passing evidence;
- Product/Variant ownership and public contract boundaries pass automated
  checks;
- direct API and uncached root gates pass;
- Docker-backed transaction, constraint, concurrency, and E2E suites pass;
- existing Identity and Authorization regressions pass;
- OpenAPI reflects the approved contract;
- documentation and implementation agree;
- the architecture module map describes the implemented Catalog rather than a
  future capability;
- no production migration is created during this development stage;
- no deferred capability or placeholder is introduced;
- `git diff --check` passes.

Only after this evidence may the plan be marked Completed. Completion of
Catalog does not imply ADR-0004 as a whole is implemented; Orders, Pricing, and
Inventory remain separate future decisions and implementation waves.

