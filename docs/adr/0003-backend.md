# ADR-0003 — Backend Module Architecture

Status: Accepted  
Date: 2026-07-23  
Frozen: 2026-07-23

## Context

Better Commerce is a NestJS modular monolith deployed independently for each
merchant store. ADR-0001 establishes that business capabilities remain inside
one process while owning their data and invariants. ADR-0002 places the backend
inside `apps/api` and prohibits extracting backend domain logic into generic
workspace packages.

The existing backend already contains identity, authentication, authorization,
session, security, observability, Redis, database, health, and OpenAPI code.
Future commerce capabilities will include catalog, pricing, inventory, orders,
payments, and fulfillment. Without explicit internal boundaries, a monolith can
gradually become a collection of services that import each other's entities,
repositories, and implementation details.

This decision defines the backend's module model, data authority, module public
contracts, cross-module communication, transaction ownership, read-model
policy, dependency rules, kernel admission criteria, and testing expectations.
It establishes strong boundaries without pretending that in-process modules
are independently deployed services.

## Decision drivers

- Clear ownership of business state and invariants
- Solo-developer maintainability without speculative ceremony
- Direct in-process communication by default
- PostgreSQL integrity without microservice constraints
- Explicit and enforceable module dependencies
- Atomic business operations where they are genuinely required
- Efficient administrative and reporting queries
- Incremental migration of the existing backend without behavior changes
- A path for future team ownership and commerce growth

## Vocabulary

- **Business module:** a capability that owns business state, rules, and use
  cases, such as Identity, Authorization, Catalog, Pricing, Inventory, or
  Orders.
- **Platform facility:** application-wide technical support such as
  configuration, database setup, Redis connectivity, observability, health
  checks, or HTTP infrastructure. A platform facility does not own commerce
  policy.
- **Module Public Contract:** the intentionally exported in-process application
  boundary through which another backend module invokes or observes a module.
- **External Platform Contract:** a supported boundary outside the backend
  process, such as HTTP, OpenAPI, a generated SDK, or a future integration event.
- **Composition root:** the application startup code that wires modules,
  adapters, and implementations together.
- **Read model:** a non-authoritative query shape designed for a use case,
  presentation, administration, search, or reporting.
- **Kernel:** a possible future set of API-internal, platform-wide domain
  primitives. No kernel is created by this ADR.

## Decision

### Capability-first business modules

Backend business code is organized by capability rather than by technical type.
The intended direction is:

```text
apps/api/src/
  modules/
    identity/
    authorization/
    catalog/
    pricing/
    inventory/
    orders/

  platform/
    configuration/
    database/
    redis/
    observability/
    health/
```

The names above describe architectural roles, not directories that must be
created before they have real code. ADR-0004 decides the final commerce
capability map. In particular, `catalog` is a likely owner for products,
categories, collections, attributes, and brands, while Pricing and Inventory
remain separate authorities.

Modules begin with the smallest structure that keeps ownership clear. A small
module may contain a controller, application service, entity, and tests in one
feature directory. It introduces `domain`, `application`, `infrastructure`,
`http`, or similar internal folders only when complexity makes the distinction
useful.

The following structure is not mandatory for every module:

```text
module/
  application/
  domain/
  infrastructure/
  http/
  ports/
  adapters/
```

Layer names do not establish architecture by themselves. Import rules, data
authority, explicit contracts, and tests establish the boundary.

### Identity and Authorization

Identity owns:

- the authenticated user identity;
- email normalization and account lookup;
- password credentials and password policy;
- registration and login;
- email-verification state and tokens;
- account status;
- authentication-version changes;
- session issuance, validation, expiry, and revocation policy;
- future authentication methods such as OTP, magic links, passkeys, or external
  identity providers when separately approved.

The existing `users` and `auth` code therefore belong to one Identity
capability. Authentication is behavior supplied by Identity, not a separate
owner of User persistence.

Authorization owns:

- staff profiles;
- roles and permissions;
- role assignments;
- administrative authorization decisions;
- owner bootstrap and last-owner invariants;
- authorization audit records.

Authorization may reference an Identity user identifier and may request an
Identity operation such as authentication-version invalidation through
Identity's Module Public Contract. It does not update Identity-owned tables.

An authenticated user is not automatically a commerce customer aggregate.
Future customer profile, address, segmentation, or commerce-history concepts
belong to the capability selected by their business invariants rather than
being added to Identity merely because they reference a user.

### Sole authority over persistent state

The primary backend invariant is:

> A module is the sole authority over mutations to its persistent state.

The owning module alone may:

- write its tables;
- use its repositories and persistence adapters;
- enforce its state-transition invariants;
- decide how its records are created, changed, or deleted;
- expose commands that permit other modules to request those changes.

A different module must not:

- inject or construct the owner's repository;
- issue SQL that mutates the owner's tables;
- import the owner's entity to perform business operations;
- use ORM cascade behavior to mutate the owner's state;
- bypass the owner's application service because both modules share a process
  or database.

For example, Orders requests an inventory reservation through Inventory's
Module Public Contract. Orders does not decrement an inventory column directly.
A shared PostgreSQL transaction does not weaken this ownership rule.

### Cross-module identifiers and foreign keys

Modules exchange stable identifiers rather than navigating object graphs across
module boundaries.

Deliberate PostgreSQL foreign keys between module-owned tables are allowed.
A foreign key is a database-integrity constraint, not a grant of application
write ownership.

Cross-module foreign keys follow these rules:

- the referenced lifecycle and delete behavior are explicitly reviewed;
- `RESTRICT` or `NO ACTION` is the default;
- cross-module cascading writes or deletes are prohibited by default;
- the referencing module stores the foreign identifier as a scalar field;
- business logic does not rely on ORM relationship traversal;
- the existence of a foreign key does not permit repository or entity access
  outside the owner.

Persistence mapping may reference another module's table or entity metadata
only where the ORM requires it to declare the foreign-key constraint. This is a
schema-level dependency confined to infrastructure code. It is not exported as
a Module Public Contract, must not enable eager or lazy loading, and must not be
used to navigate or mutate the referenced aggregate.

Production migrations eventually become the authoritative representation of
cross-module constraints. The current disposable development workflow may use
TypeORM synchronization until the schema is stabilized, as already constrained
by the accepted operational policy.

### Module Public Contracts

Each business module exposes one intentional in-process boundary. Other modules
import only from that boundary.

A Module Public Contract may expose:

- command and query application services;
- explicit command/query input and result types;
- stable identifiers and selected value types;
- injection tokens or provider interfaces where implementation substitution is
  required;
- documented facts or event contracts after an event decision is accepted.

It does not expose:

- repositories or query builders;
- TypeORM entities or persistence models;
- database transaction objects as an accidental convenience;
- internal domain services;
- private NestJS providers;
- implementation-only DTOs;
- infrastructure clients;
- arbitrary internal files through deep imports.

NestJS module exports are kept as narrow as the Module Public Contract. An
exported provider is not automatically a supported contract merely because
NestJS can resolve it.

Module Public Contracts and External Platform Contracts are different
boundaries. HTTP controllers and OpenAPI DTOs define an external transport
contract; they are not imported by backend modules as an in-process API.

Module Public Contracts are explicit and change-controlled. Because backend
modules compile and deploy atomically today, an internal contract may normally
change through one repository-wide refactor. It is versioned only when old and
new in-process consumers must coexist. External HTTP, SDK, event, and extension
contracts follow their own compatibility and versioning decisions.

### Cross-module communication

A direct synchronous call to the owning module's public application service is
the default.

Use a direct call when:

- the caller requests an action;
- the caller needs a result to continue;
- failure must be returned to the caller;
- the operation participates in an explicit synchronous workflow.

An event describes a fact that has already occurred. Event names use factual,
past-tense language. An event must not disguise a command merely to avoid a
direct dependency.

For example:

- `InventoryService.reserve(...)` is a command and uses a direct call;
- `OrderCreated` is a fact and may later notify independent reactions;
- `ReserveInventory` is not published as an event.

This ADR does not introduce an event bus, domain-event framework, integration
events, or outbox. A focused later ADR defines event timing, delivery,
transactions, failure semantics, idempotency, and extension-point rules before
events become a material coordination mechanism.

### Transaction ownership

A normal module command owns its transaction boundary. Controllers do not own
business transactions, and repositories do not independently commit fragments
of one declared atomic operation.

Most cross-module workflows use ordinary public calls and do not automatically
become one large transaction. When a business invariant genuinely requires
atomic writes across multiple modules in the shared PostgreSQL database:

1. a named application-level orchestrator owns the use case;
2. one explicit database transaction spans the required writes;
3. each participating module performs its own writes through a transaction-aware
   form of its Module Public Contract;
4. the orchestrator never accesses another module's repository or table
   directly;
5. the transaction propagation mechanism remains an application/infrastructure
   concern rather than leaking TypeORM entities or repositories into domain
   code.

The exact transaction-context mechanism is selected during implementation. It
must be explicit, testable, and narrow. A raw TypeORM `EntityManager` is not a
general-purpose Module Public Contract.

Database transactions do not make external side effects atomic. Network calls
to payment, email, shipping, or other external systems are not held open inside
a database transaction merely to appear consistent. Idempotency, durable work,
or an outbox is introduced when a concrete workflow requires it and after its
failure semantics are designed.

### Read models and projection queries

Write ownership does not require inefficient row-by-row service composition for
complex reads.

A use-case-owned read model may join or denormalize data from multiple modules
for:

- administrative dashboards;
- reporting;
- search;
- list pages;
- presentation-specific query shapes.

A cross-module read model:

- is read-only;
- is not a source of truth;
- does not mutate module-owned tables;
- does not expose repositories or entities to callers;
- cannot redefine business invariants;
- cannot authorize a sensitive mutation using stale projected state;
- documents freshness when it is materialized or eventually updated;
- returns a purpose-specific result rather than a reusable cross-module object
  graph.

At the current scale, a direct PostgreSQL projection query is acceptable. This
ADR does not require CQRS, a separate read database, event-fed projections, or
a reporting service. A dedicated reporting module is introduced only when real
reporting ownership and complexity justify it.

### Source dependency rules

Runtime call flow and source-code dependencies are not the same graph.
Infrastructure may be invoked by an application port at runtime while its
source code depends inward on that port.

The permitted source dependencies are:

| Source area | May depend on |
| --- | --- |
| Composition root | Business modules and platform implementations for wiring |
| HTTP/CLI adapters | Their module's application layer and external transport support |
| Module application code | Its domain, its own ports, another module's Module Public Contract, and approved platform abstractions |
| Module domain code | Its own domain and an admitted kernel primitive, if one exists |
| Module infrastructure | Its module's domain/application ports, approved platform facilities, and external libraries |
| Platform facilities | Other lower-level platform facilities and external libraries |
| Read-model adapters | Purpose-specific query contracts and the database read mechanism |

The following dependencies are prohibited:

- domain code depending on NestJS, TypeORM, Redis, HTTP, controllers, or
  infrastructure implementations;
- one business module deep-importing another module's source;
- one business module importing another module's repository or entity for
  business behavior;
- platform facilities depending on business modules;
- the API depending on Admin, storefronts, the SDK, or presentation source;
- circular module dependencies.

The composition root is the only general location allowed to know all modules
and concrete adapters.

### Platform facilities

Configuration, database connection setup, Redis connectivity, observability,
health checks, and generic HTTP infrastructure are platform facilities rather
than business modules.

A platform facility:

- supplies technical mechanisms;
- contains no merchant-specific behavior;
- contains no catalog, pricing, inventory, order, or authorization policy;
- depends on no business module;
- exposes only the minimum application-wide capability required by consumers.

Security placement follows ownership. Generic trusted-origin, CSRF, secure
headers, logging, and abuse-protection mechanisms may be platform HTTP-security
facilities. Identity owns authentication and session policy even when Redis and
HTTP middleware provide its technical implementation.

### Kernel admission

No `apps/api/src/kernel` directory is created by this decision.

A primitive may enter a future API-internal kernel only when all of the
following are true:

1. At least two genuine business modules need it.
2. It has one stable, platform-wide semantic meaning.
3. No existing business module is its natural owner.
4. It represents a domain primitive or policy-neutral abstraction rather than a
   convenience helper.
5. It contains no NestJS, TypeORM, Redis, HTTP, configuration, or feature
   dependency.
6. Moving it into the kernel reduces duplication without hiding ownership.
7. It has focused tests and a deliberately small public surface.

Money and possibly a clock abstraction may qualify when real consumers exist.
Inventory concepts, order snapshots, generic events, generic errors, IDs,
helpers, and utilities do not qualify merely because several files can import
them.

The kernel is orthogonal to application and domain layers, not a bottom
infrastructure layer. It depends on no business module. It remains inside the
API application and is not extracted into a workspace package without a
separate demonstrated distribution boundary.

### Testing policy

Tests follow risk and contract boundaries rather than a mandatory quota of test
types.

- Domain rules receive focused unit tests.
- Persistence behavior, database constraints, and infrastructure adapters
  receive integration tests where mocks would hide meaningful risk.
- A Module Public Contract receives contract tests when another module relies on
  behavior that could regress.
- HTTP contracts and complete workflows receive end-to-end tests.
- Cross-module atomic workflows test successful commit and rollback.
- Read models test query correctness and prove that no write path exists.
- Architectural tests or static checks enforce import and export boundaries.

A small module is not required to contain artificial unit, integration, and
contract test files when one higher-value test covers its current behavior.

### Enforcement

Folder conventions alone are insufficient. The implementation incrementally
adds lightweight enforcement using:

- one explicit public entry point per business module;
- narrow NestJS exports;
- TypeScript and ESLint import restrictions;
- static dependency or architecture tests;
- tests that fail on cross-module entity/repository imports outside approved
  persistence-only foreign-key mapping;
- tests that fail on circular module dependencies;
- code review against the data-authority and transaction invariants.

Another monorepo framework, dependency-injection framework, or generalized
architecture library is not introduced solely to enforce this ADR.

## Incremental adoption

ADR-0003 is implemented separately from ADR-0002 and without changing external
authentication or authorization behavior.

The initial adoption sequence is:

1. Establish the target business-module and platform-facility boundaries.
2. Consolidate existing `users` and `auth` ownership under Identity while
   preserving every current route, entity field, session rule, and test.
3. Preserve Authorization as a separate authority and replace business-level
   Identity persistence access with Identity's Module Public Contract.
4. Confine necessary cross-module foreign-key metadata to persistence mapping
   and prohibit relationship traversal.
5. Classify configuration, database, Redis, observability, health, OpenAPI, and
   generic HTTP-security code as platform facilities.
6. Introduce explicit module entry points and lightweight boundary checks.
7. Run the complete existing authentication, authorization, security, unit, and
   end-to-end regression suite.

This adoption does not create Catalog, Pricing, Inventory, Orders, a kernel,
CQRS, an event bus, an outbox, or repository interfaces without a current
consumer.

## Explicit non-goals

This decision does not introduce:

- microservices or independently deployed backend modules;
- a database or schema per module;
- tenant, merchant, or store identifiers;
- distributed transactions or two-phase commit;
- CQRS as a required application style;
- an event bus, outbox, or event-sourcing framework;
- repositories for every entity;
- mandatory hexagonal or four-layer folder structures;
- generic `core`, `shared`, `common`, `helpers`, or `utils` modules;
- a kernel before a primitive satisfies the admission criteria;
- runtime contract versioning for every internal change;
- cross-module object graphs or ORM cascade behavior;
- a separate reporting service or read database;
- business-module extraction into workspace packages.

## Alternatives considered

### Technical-layer-first organization

Rejected because global controller, service, entity, and repository directories
obscure business ownership and allow unrelated capabilities to depend on each
other accidentally.

### Mandatory layered or hexagonal structure for every module

Rejected because it creates interfaces, adapters, and folders before complexity
requires them. Layers remain available inside modules where they clarify real
dependencies.

### No foreign keys between modules

Rejected because this is one modular monolith using one PostgreSQL database.
Database referential integrity is valuable and does not imply application write
ownership.

### Cross-module ORM navigation

Rejected because object-graph traversal hides dependencies, encourages
accidental writes and cascades, and allows one module's persistence model to
become another module's application API.

### Events for all module communication

Rejected because commands and queries are clearer as direct calls. Events are
facts and require explicit delivery and failure semantics that are not currently
needed.

### Globally version every module contract

Rejected because modules compile and deploy atomically. Versions are introduced
only when incompatible consumers must coexist.

### Strict write isolation that forbids cross-module reads

Rejected because administrative and reporting use cases need efficient
cross-capability query shapes. Read-only, non-authoritative projections preserve
write ownership without forcing row-by-row service calls.

## Consequences

### Positive

- Every persistent mutation has one accountable owner.
- Cross-module calls are visible and testable.
- PostgreSQL continues to enforce deliberate referential integrity.
- Complex dashboards can use efficient read models without becoming write
  authorities.
- Identity can grow to support future authentication methods without creating
  separate capability modules.
- Future commerce modules can evolve without repository and entity leakage.
- The design remains understandable to one developer and enforceable as a team
  grows.

### Negative

- Some operations require explicit application orchestration.
- Cross-module foreign keys create deliberate schema coordination.
- Efficient read models may duplicate fields or query knowledge.
- Boundary enforcement adds static checks and review responsibilities.
- Moving existing authentication and authorization code requires careful,
  behavior-preserving refactoring.
- Direct in-process contracts still couple modules at compile time, which is
  intentional for the current modular monolith.

## Architectural invariants

An implementation complies with this decision only if:

1. Business code is organized by capability rather than global technical type.
2. Identity is the sole authority for authenticated users, credentials,
   verification, authentication state, and session policy.
3. Authorization is the sole authority for staff profiles, roles, permissions,
   assignments, owner invariants, and authorization audit records.
4. A module is the sole authority over mutations to its persistent state.
5. No module injects another module's repository or mutates another module's
   table.
6. Cross-module calls use the owner's Module Public Contract.
7. Module Public Contracts do not expose repositories, entities, query builders,
   or private providers.
8. Cross-module foreign keys are deliberate, default to restrictive lifecycle
   behavior, and do not grant write ownership.
9. Business logic does not traverse cross-module ORM relationships or use
   cross-module cascades.
10. Commands and required queries use direct application-service calls by
    default.
11. Events describe facts and are not commands disguised as events.
12. A normal module command owns its transaction.
13. A multi-module atomic workflow uses a named orchestrator while every module
    retains ownership of its writes.
14. External network effects are not treated as atomic merely because they are
    initiated inside a database transaction.
15. Cross-module read models are read-only, non-authoritative, and cannot mutate
    state or redefine invariants.
16. Domain code does not depend on NestJS, TypeORM, Redis, HTTP, or
    infrastructure implementations.
17. Platform facilities do not depend on business modules or contain business
    policy.
18. Business modules do not deep-import another module's private source.
19. Circular business-module dependencies are prohibited.
20. No kernel exists until a real primitive satisfies every admission criterion.
21. Internal contracts are versioned only when incompatible in-process
    consumers must coexist.
22. Tests cover rules and contracts according to risk, and automated checks
    enforce module boundaries.

## Freeze policy

This ADR is frozen after acceptance. Editorial corrections may clarify wording
without changing meaning. A normative change to module ownership, dependency
rules, transaction policy, read-model authority, contract boundaries, or kernel
criteria requires either:

- an explicitly dated amendment with rationale and consequences; or
- a new ADR that supersedes this decision.

Implementation discoveries are recorded as evidence. They do not silently
weaken an invariant.

## Related decisions

- ADR-0001 defines platform principles, independent store deployments, and the
  modular-monolith direction.
- ADR-0002 defines repository, application, package, and storefront boundaries.
- ADR-0004 defines the commerce capability and domain model.
- ADR-0009 defines authentication architecture and external session behavior.
- A later focused contract ADR defines the complete external and internal
  contract taxonomy and compatibility policy.
- A later focused events ADR defines event timing, delivery, transactions,
  failure semantics, idempotency, and extension-point rules.
