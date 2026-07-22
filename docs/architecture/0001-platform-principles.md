# ADR-0001 — Platform Architecture Principles

Status: Accepted  
Date: 2026-07-22

## Context

Better Commerce is a reusable platform for building independently operated commerce websites. A single platform codebase may be used to create unrelated stores such as a dog-house store, clothing store, bicycle shop, or cosmetics shop.

The platform must remain maintainable by a solo developer today while allowing development and operations to grow into a team when demonstrated demand justifies it.

## Decision drivers

- Solo-developer maintainability today
- Long product lifetime
- Independent merchant deployments and data isolation
- One upgrade path without merchant forks
- Operational simplicity
- Maintainability over premature scalability
- Incremental team growth without requiring distributed systems

## Vocabulary

- **Platform:** the shared Better Commerce source code and its stable contracts.
- **Merchant:** the person or business operating one store.
- **Store:** one independently deployed instance of the platform for one merchant.
- **Customer:** a shopper who registers with or purchases from a store.
- **Theme:** a presentation implementation selected by a store deployment.
- **Platform Module:** a logically isolated business capability within the platform, such as Products or Orders, that owns its data writes and invariants and exposes explicit public application contracts.

Growth estimates in this document refer to merchant/store installations, not shoppers.

## Decision

One maintained platform release should power many isolated merchant stores without creating merchant forks of platform business logic.

Expected installation scale:

- Today: 1 store
- One year: 2–3 stores
- Five years: approximately 10 stores
- Ten years: potentially approximately 100 stores

These estimates guide maintainability. They do not justify infrastructure or abstractions before those tools provide measurable value.

## Independent deployment per store

Every store is a separate deployment. Stores do not share runtime data or identity.

Each store has its own:

- Docker deployment;
- PostgreSQL database;
- dedicated Redis container;
- secrets and environment configuration;
- uploaded media and storage boundary;
- domain, TLS configuration, backups, and operational lifecycle.

The commerce application is not a multi-tenant SaaS system. Business tables do not contain `merchantId`, `storeId`, `organizationId`, or `tenantId` solely to support different deployments. Requests do not pass through tenant-resolution middleware.

Fleet deployment automation is outside this decision. Each store remains independently deployable, and operational automation may be introduced when manual upgrades, backups, or monitoring are no longer reliable. This architecture promises reusable software, not indefinite manual operation of one hundred deployments by one person.

## No merchant forks

Merchant-specific presentation and supported behavior are supplied through validated configuration, themes, assets, and platform-owned extension points.

The following are prohibited:

- copying platform business modules for one merchant;
- long-lived merchant branches;
- merchant-name, domain, or identifier conditionals in platform business logic;
- modifying commerce invariants inside a theme;
- duplicating fixes across store-specific versions of the same module.

If a merchant needs a reusable commerce capability, it should be evaluated as a platform feature. A legal or business requirement that is fundamentally incompatible with the platform may require a separate product rather than a hidden permanent fork.

Merchant-specific platform divergence is not a supported solution. An emergency deployment patch must be upstreamed into a generalized platform capability or removed before the deployment returns to the normal upgrade path.

## Modular monolith

The platform is a modular monolith:

- business capabilities are isolated into modules;
- modules execute in the same application process;
- modules may share one PostgreSQL database while preserving logical ownership;
- a module owns its entities, writes, and business invariants;
- modules expose public application services and contracts;
- other modules depend only on those public contracts, while internal implementation details remain private;
- one module does not directly write another module's tables or import its private repository;
- direct in-process service calls are the default;
- in-process events are used only when loose coupling provides a concrete benefit.

Microservices are introduced only for a demonstrated operational requirement that a modular monolith cannot reasonably satisfy.

## Configuration before merchant-specific code

Configuration is appropriate for choices such as:

- store identity and branding;
- locale and supported currency;
- selecting supported payment, shipping, tax, media, or email strategies;
- enabling a platform capability;
- theme selection;
- operational limits with safe platform defaults.

Configuration must be typed, schema-validated at startup, documented, versioned, and supplied with safe defaults.

Configuration must not become an unreviewed programming language or allow arbitrary business-logic execution. Arbitrary scripts, SQL, authorization policies, and merchant-authored pricing formulas are not configuration. Advanced workflow customization may be introduced later only through dedicated, reviewed platform capabilities. A behavior that changes commerce invariants normally becomes a reviewed platform capability.

## Extension points

Extension points are explicit, compile-time platform contracts. Examples may include payment providers, shipping-rate providers, tax strategies, media storage, and email delivery.

Store deployments select supported implementations using validated configuration. Dynamic module loading, untrusted runtime plugins, and a plugin marketplace are not part of the platform.

## Themes own presentation

Themes may own:

- layout, components, styling, and visual assets;
- page composition and navigation;
- responsive and accessible presentation;
- client-side interaction with documented platform APIs.

The backend remains authoritative for prices, discounts, inventory, tax, checkout eligibility, order state, authorization, and validation. A theme may choose how a capability is presented, but it cannot redefine the business rule.

The repository and packaging relationship between platform code and merchant themes is decided in ADR-0002 and ADR-0011.

Themes communicate with the platform only through documented public APIs and client contracts. They do not import backend implementation details.

## Commerce-first evolution

The platform is commerce-focused. Its foundations should allow physical products, digital products, services, and future fulfillment models to be added without replacing identity, catalog, pricing, and order foundations.

This is not a promise that future commerce models require no schema or API evolution. The platform avoids speculative universal abstractions and implements capabilities incrementally. ADR-0004 defines the durable commerce concepts and their boundaries.

## Correctness and security

Commerce correctness takes priority over cleverness:

- money uses exact representations and never binary floating-point arithmetic;
- orders preserve the historical facts required to explain a purchase;
- inventory mutations are concurrency-safe;
- external side effects such as payment operations are idempotent where required;
- authorization is server-enforced and default-deny;
- sensitive administrative operations are auditable;
- secrets and customer data are isolated per deployment;
- production schema changes use reviewed migrations;
- complexity is added in response to an observed requirement or measured bottleneck;
- instants are stored as UTC timestamps;
- merchant time zones use explicit IANA time-zone identifiers;
- calendar dates and local business times are modeled separately when their meaning is not an instant.

## Platform independence from merchants

The platform source code contains no knowledge of individual merchants. At runtime, an installation necessarily knows its own validated store configuration, but platform modules do not depend on another store or on a central merchant registry.

Merchant-specific configuration, assets, and themes consume platform contracts. The platform does not import merchant business logic.

## Explicit non-goals

The current architecture does not include:

- multi-tenant runtime data;
- plugin marketplace;
- Kubernetes;
- microservices;
- dynamic module loading;
- SaaS control plane;
- multi-region deployment;
- cross-store customer identity;
- shared cross-store catalog, orders, inventory, or sessions;
- distributed transactions, two-phase commit, or a distributed transaction coordinator.

These may be reconsidered only when concrete business or operational requirements justify their cost.

## Alternatives considered

### Multi-tenant runtime

Rejected because it couples unrelated merchants operationally and introduces tenant resolution, tenant-aware authorization, shared failure modes, and data-isolation risk before the business requires them.

### Merchant-specific forks

Rejected because fixes, security updates, and platform evolution would have to be repeated and reconciled across divergent codebases.

### Microservices from the beginning

Rejected because the expected scale does not justify distributed deployment, network-failure handling, cross-service observability, or distributed data consistency.

### Shared Redis separated by merchant namespaces

Rejected because each store already has an independent Docker deployment. A dedicated Redis container provides clearer failure, security, backup, and operational isolation.

### Arbitrary runtime plugins or configuration scripts

Rejected because they create an unbounded execution and compatibility surface. Extension points remain reviewed compile-time platform contracts.

## Consequences

### Positive

- stores have strong data and failure isolation;
- one platform fix can be released to every store without merging merchant forks;
- local development and small installations remain understandable;
- module boundaries provide a path for team ownership without requiring distributed systems.

### Negative

- each store requires its own deployment, backup, monitoring, and upgrade process;
- platform upgrades must preserve or explicitly migrate versioned configuration and data;
- store-specific requests must fit supported configuration, themes, or reviewed extension contracts;
- operating many installations will eventually require deployment automation even though a SaaS control plane is not currently justified.

## Architectural invariants

An implementation complies with this decision only if:

1. A store can be deployed without changing platform business logic.
2. Two stores can run with completely separate databases, Redis data, secrets, and media.
3. Platform business code contains no merchant-specific conditional behavior.
4. Configuration is validated before the application accepts traffic.
5. Themes cannot bypass backend commerce or authorization rules.
6. Modules cannot mutate another module's owned data through private repositories.
7. No multi-tenant abstraction is introduced without a later accepted architecture decision.
8. Platform business logic remains testable without merchant-specific code, themes, or configuration branches.

## Related ADRs

- ADR-0002 defines repository and package boundaries.
- ADR-0003 defines backend module structure and dependency rules.
- ADR-0004 defines durable commerce concepts.
- ADR-0011 defines storefront and theme contracts.
