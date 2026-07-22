# ADR-0002 — Repository and Workspace Boundaries

Status: Accepted  
Date: 2026-07-22  
Amended: 2026-07-22

## Context

Better Commerce has two different source-code lifecycles:

1. Shared platform source contains the API, Admin, public contracts, correctness-critical storefront libraries, tooling, and reference implementations.
2. Each merchant has a customer-facing storefront with unique pages, static copy, design, and composition that changes and deploys independently.

Putting every production storefront and every merchant content change in the platform repository would couple unrelated deployments. Giving every merchant a complete copy of storefront integration code would instead duplicate authentication, cart, checkout, and API communication and make critical fixes difficult to distribute.

The repository architecture must support bespoke, statically rendered storefronts without creating forks of platform business logic.

## Decision drivers

- One maintained repository for shared platform source
- Atomic platform changes across applications and public contracts
- Independent production storefront repositories and deployments
- Content-as-code and static prerendering for merchant marketing pages
- Reuse without copying commerce or security behavior
- Explicit ownership and dependency direction
- Reproducible local and CI builds
- Incremental adoption from the existing backend repository
- Solo-developer maintainability today
- A credible upgrade path for a future fleet of storefront repositories

## Decision

Better Commerce uses:

- a TypeScript platform monorepo managed by pnpm workspaces and Turborepo;
- a separate repository for each production merchant storefront;
- versioned runtime packages for contracts, security-sensitive integration, and commerce orchestration;
- locally owned presentation source that storefronts may copy and customize;
- an official reference storefront in the platform monorepo to document and test the consumer contract.

The platform monorepo is the single repository for shared platform source. It is not the single repository for every production storefront.

The architectural distinction between versioned runtime dependencies and copied presentation source is decided here. The transport and tooling used to distribute copied source—such as a source registry or CLI—are defined by ADR-0012 rather than this decision.

## Platform repository layout

The intended platform structure is:

```text
apps/
  api/
  admin/
  reference-storefront/

packages/
  sdk/
  storefront-core/
  store-config/
  eslint-config/
  typescript-config/

examples/
  example-store/

docs/
  architecture/

scripts/

package.json
pnpm-workspace.yaml
pnpm-lock.yaml
turbo.json
```

This layout defines ownership and permitted locations. Directories and packages are introduced only when they have real producers, consumers, or verification responsibilities.

ADR-0012 may add a dedicated source-distribution location after its format and tooling are accepted.

## Tooling

pnpm owns dependency installation, workspace linking, and the platform repository lockfile. Turborepo owns dependency-aware task orchestration and caching.

The root package manifest is private and pins the package-manager version. The platform repository has exactly one `pnpm-lock.yaml`. Internal workspace dependencies use the `workspace:` protocol. npm, Yarn, and application-level lockfiles are not used inside the platform monorepo.

External storefront repositories have their own pinned package manager and lockfile because they are independently built and deployed consumers.

## Platform applications

Only independently runnable or deployable platform applications belong under `apps/`.

### API

`apps/api` is the NestJS modular-monolith backend. It owns authoritative business logic, persistence, authorization, validation, and commerce invariants.

Backend capability modules remain inside the API application. Products, pricing, inventory, orders, payments, identity, and authorization are not extracted into workspace packages merely to appear reusable.

### Admin

`apps/admin` is the merchant administration application. It uses React and Vite, subject to ADR-0010.

Admin manages commerce operations and supported platform settings. A general-purpose CMS or page builder is not part of this decision. Admin communicates with the API through documented external contracts and does not import API implementation code.

### Reference storefront

`apps/reference-storefront` is an official Next.js consumer of the public storefront contract, subject to ADR-0011.

It serves as:

- executable documentation;
- an integration and compatibility test for published packages;
- a development host for reusable presentation examples;
- a source for screenshots and usage examples;
- an integration reference and source for a minimal storefront starter whose shared mechanisms remain package dependencies.

It is not the permanent production source of every merchant website, and it does not contain production merchant copy, branding, or pages.

## Independent merchant storefronts

Each production merchant storefront lives in its own repository:

```text
dog-house-storefront/
  app/
    page.tsx
    about/
      page.tsx
    products/
      page.tsx
    checkout/
      page.tsx
  content/
  components/
  public/
  tests/
  deployment/
  store.config.ts
  package.json
  pnpm-lock.yaml
```

The storefront repository owns:

- page composition and routes;
- static marketing copy and content-as-code;
- merchant-specific presentation components;
- branding, public assets, and styles;
- locally modified copied presentation source;
- storefront tests and deployment configuration;
- exact versions of platform packages it consumes.

A text, page, or design change is committed and deployed only from that storefront repository. It does not require a platform monorepo commit or an API/Admin release.

Merchant storefronts are presentation consumers, not platform backend forks. They do not contain copied API modules, repositories, entities, business policies, or private Admin source.

## Content and rendering ownership

Developer-maintained marketing content belongs to the merchant storefront repository as TSX, TypeScript, Markdown, MDX, or another reviewed build-time format. It is prerendered where appropriate.

The architecture does not require ordinary merchant marketing pages, navigation copy, or page layouts to be stored in the commerce database. A future content system requires a separate accepted decision.

Rendering mode follows data semantics:

- home, about, contact, policy, campaign, and other marketing pages may be statically generated;
- catalog and product pages may be statically generated or revalidated from external API data;
- cart, checkout, account, and order-history experiences use current session and API state;
- prices, discounts, tax, inventory, checkout eligibility, authorization, and order creation are always validated by the API regardless of how a page was rendered.

Static output is a performance and presentation technique, not an authority for mutable commerce facts.

## Artifact ownership model

The platform deliberately separates managed runtime dependencies from copied presentation source.

### Versioned runtime packages

Correctness-critical behavior is distributed as versioned packages and remains in `node_modules` of consuming storefronts.

Initial public package roles are:

- `@better-commerce/sdk`: generated or generated-backed external API client and contract types;
- `@better-commerce/storefront-core`: framework-facing session, cart, checkout, error, cache, and API-orchestration mechanisms with explicit server and browser entry points;
- `@better-commerce/store-config`: validated public storefront configuration when a cross-repository consumer requires it.

These packages may own:

- generated request and response types;
- browser-safe and server-only API clients;
- cookie-aware request behavior without exposing secrets;
- authentication and session integration;
- cart synchronization;
- checkout state and API orchestration;
- idempotency-key handling;
- error normalization;
- cache and revalidation helpers;
- exact money and currency serialization required by the external contract.

They do not own merchant page composition, copy, branding, or visual design.

Consumers customize runtime packages through documented public APIs. They do not copy and modify package internals. If a security or correctness fix must reliably reach every storefront through an upgrade, the relevant implementation belongs in a versioned package or the API.

Public packages are released when the first external storefront consumes them. Initially they may share the platform release train rather than requiring an independent versioning system for every package. Storefronts pin compatible versions and upgrade through reviewed dependency changes.

### Copied presentation source

Presentation source intended for unconstrained visual customization is copied into a consuming storefront's source tree. It may include:

- UI primitives;
- product cards and product grids;
- category navigation;
- cart drawers and visual cart components;
- checkout page composition;
- account layouts;
- complete page blocks;
- styling and presentation configuration;
- starter storefront source;
- presentation-only hooks and utilities.

Once copied, the source belongs to the consuming storefront:

- the storefront may modify it freely;
- platform releases do not silently overwrite it;
- divergence between storefronts is expected;
- upstream improvements require an explicit review or merge;
- platform support cannot assume the copied source remains identical to its original version.

Copied presentation source may depend on documented runtime packages and other explicitly declared presentation dependencies. It does not import API implementation code, contain secrets, or reimplement authoritative authentication, session, pricing, inventory, authorization, or order-submission behavior.

The exact catalogue format, installation process, provenance metadata, update comparison, and merge behavior are outside this ADR and belong to ADR-0012.

### Distribution decision rule

If a security or correctness fix must reliably reach every storefront through a dependency upgrade, the implementation belongs in the API or a versioned runtime package.

If a storefront must be free to diverge permanently in markup, styling, composition, or static content, the implementation may be copied presentation source.

## Public contracts and SDK

The API's documented HTTP contract is the source for frontend client generation:

```text
NestJS external HTTP contract
        ↓
OpenAPI document
        ↓
@better-commerce/sdk
        ↓
storefront-core, Admin, reference storefront, merchant storefronts
```

The SDK is not a hand-maintained duplicate of backend request and response types. Client generation is deterministic. Once the SDK is consumed, CI verifies that the external contract and generated client are current.

The API does not depend on the SDK. External storefront consumption requires documented compatibility and deprecation rules, which ADR-0011 and a later focused contract decision will define.

The phrase "public contract" has two distinct scopes:

- an external platform contract is consumed over an explicitly supported boundary such as HTTP and OpenAPI;
- an internal module contract is consumed in process by another backend module.

Neither scope includes private NestJS providers, repositories, ORM entities, or implementation-only DTO classes. ADR-0003 defines internal module contracts. A later focused ADR defines the complete external contract taxonomy and compatibility policy.

## Purpose-specific packages

The repository does not contain generic `core`, `shared`, `common`, `helpers`, or `misc` packages. These names obscure ownership and tend to accumulate unrelated code.

`storefront-core` is permitted because it is a bounded external integration product for storefront consumers, not a home for backend domain logic.

An additional package is created only when all of the following are true:

1. At least two real consumers need the code, or one external consumer establishes a required distribution boundary.
2. It crosses a genuine application or repository boundary.
3. It has a specific, stable responsibility and an identifiable owner.
4. Its public API is independent of application-private implementation details.
5. Extraction does not create a circular dependency.
6. It has focused tests and explicit exports.

Narrow foundational packages may be introduced later when these criteria are met. They may provide mechanisms and primitives, but they do not own authoritative commerce policy.

Backend-wide primitives do not automatically become workspace packages. ADR-0003 decides whether a small API-internal kernel is justified and constrains its contents.

## Backend business-logic boundary

API modules own backend domain behavior and data access. Workspace packages do not become a second domain layer beneath the modular monolith.

Frontend or presentation source must not import:

- NestJS modules or providers;
- ORM entities or repositories;
- implementation-only API DTO classes;
- backend domain services;
- private API module code.

Types that cross the network are represented by the external API contract and generated client artifacts rather than by importing backend source files.

Detailed backend module ownership, sole authority over persistent state, internal contracts, kernel criteria, and cross-module dependencies are defined by ADR-0003.

## Dependency rules

Source dependencies and runtime communication are different graphs and must not be conflated.

The principal source dependency direction is:

```text
merchant storefront source
        ├── copied presentation source
        ├── @better-commerce/storefront-core
        └── @better-commerce/sdk
```

At runtime, SDK calls cross an HTTP boundary to the API. The SDK does not import the API application.

The following rules are automatically enforced where the relevant source is under platform control:

- platform applications may depend on permitted workspace packages;
- workspace packages and copied presentation source do not depend on platform applications;
- the API does not depend on Admin, the reference storefront, SDK, storefront-core, or presentation source;
- Admin and storefronts do not import API implementation code;
- storefront-core may depend on the SDK's public entry points but not API source;
- copied presentation source depends only on documented public packages, external libraries, and explicitly declared presentation dependencies;
- copied presentation source does not contain platform business rules or security-critical protocol implementations;
- the reference storefront uses the same public packages and source-ownership model offered to external storefronts;
- workspace dependencies are declared explicitly;
- packages expose explicit public entry points, including separate browser and server entry points where required;
- consumers do not deep-import private package source;
- circular workspace dependencies are prohibited and fail automated checks.

Folder placement alone is not enforcement. The implementation uses lightweight static analysis, package exports, TypeScript configuration, tests, and CI checks without introducing another monorepo framework solely for boundary enforcement.

ADR-0003 will define a precise backend dependency matrix rather than relying only on the ambiguous rule that dependencies "point inward."

## Meaning of independent

Platform applications have separate package manifests and build targets but may share one platform release. They are not microservices merely because they build independently.

Merchant storefronts have independent repositories, lockfiles, CI pipelines, and deployment artifacts because their content and presentation lifecycles differ from the platform. They remain coupled to documented platform API and package compatibility contracts.

Independent storefront deployment does not permit independent commerce rules.

## Tasks and caching

Root commands orchestrate consistent platform workspace tasks such as:

- `build`;
- `typecheck`;
- `lint`;
- `test`;
- `dev`;
- SDK generation and freshness verification when the SDK exists.

Turborepo caching is enabled only for deterministic tasks with explicitly declared inputs and outputs. Integration and end-to-end tests that depend on mutable PostgreSQL, Redis, ports, time, or external services are not cacheable unless isolation and cache correctness are demonstrated.

Local caching is sufficient initially. Remote caching is not introduced until CI duration or team coordination demonstrates a concrete need. Secrets are never cache inputs or outputs.

External storefront repositories run their own deterministic build, typecheck, lint, and test pipelines.

## Deployment and secrets

API, Admin, the reference storefront, and production merchant storefronts may produce deployable artifacts. Runtime packages and copied source do not run as independent services.

The platform publishes API/Admin container images and, when external storefronts exist, required versioned packages. A production storefront pins compatible artifact versions and deploys independently.

Store secrets are injected by the deployment environment or an approved secret-management system. They are not committed to runtime packages, examples, reusable presentation source, or merchant storefront source.

ADR-0001 remains authoritative: every deployed store has its own Docker deployment, PostgreSQL database, Redis container, secrets, media boundary, backups, and operational lifecycle.

## Incremental migration

The existing repository is migrated in small, verifiable stages:

1. Establish the pinned pnpm workspace, single lockfile, root task contract, and Turborepo configuration without changing application behavior.
2. Move the existing NestJS backend into `apps/api` and restore all development, test, seed, and Docker workflows.
3. Add the Admin application according to ADR-0010.
4. Establish the deterministic OpenAPI contract and SDK package when the first frontend consumer requires them.
5. Establish storefront-core around proven cross-store session, cart, and checkout integration rather than speculative abstractions.
6. Build the reference storefront and verify the boundary between versioned runtime packages and locally owned presentation source.
7. Define and implement the presentation-source distribution mechanism only after ADR-0012 is accepted.
8. Create the first external merchant storefront and verify content, build, and deployment independence.
9. Add package compatibility, fleet inventory, and automated upgrade reporting when the number of external storefronts makes them necessary.

Each stage leaves the repository buildable and testable. The existing npm lockfile is removed only after a clean pnpm installation and the relevant verification commands succeed.

The first implementation wave covers only steps 1 and 2. It does not create speculative Admin, storefront, SDK, storefront-core, presentation-distribution, or API-kernel implementations.

## Explicit non-goals

This decision does not introduce:

- microservices;
- separate repositories for API and Admin platform source;
- production merchant storefront source inside the platform monorepo;
- a generic runtime-configured storefront as the only supported presentation model;
- a general-purpose CMS or database-driven marketing-page builder;
- copied backend business modules or private Admin code;
- copied authentication, session, cart synchronization, or checkout protocol implementations;
- a selected presentation-source transport or CLI before ADR-0012;
- automatic overwriting of locally modified presentation source;
- independent semantic versions for every internal workspace package;
- remote build caching;
- dynamic runtime module or theme loading;
- untrusted merchant-authored JavaScript execution;
- microfrontends or module federation;
- a plugin marketplace.

## Alternatives considered

### One generic configurable storefront for every merchant

Rejected as the only model because bespoke sites require independently owned routes, page composition, static content, and presentation source. A generic storefront may remain a useful reference or optional standard offering, but it is not a constraint on merchant presentation.

### Store marketing content in the commerce database

Rejected for the current product direction. Build-time content provides direct developer control, static prerendering, ordinary code review, and merchant-specific presentation without building CMS authoring, preview, permission, and publishing systems.

### Copy an entire storefront for every merchant

Rejected because it duplicates security-sensitive integration and commerce orchestration. Merchant repositories copy or author presentation source while consuming versioned SDK and storefront-core packages.

### Distribute all storefront code through runtime packages

Rejected because merchant presentation needs local ownership and unconstrained customization. Hiding visual source in `node_modules` works against the bespoke-storefront goal.

### Distribute all storefront code as copied source

Rejected because copied source cannot reliably receive centralized security and correctness fixes. Contracts and critical integration remain versioned runtime dependencies.

### Put every merchant storefront in the platform monorepo

Rejected because unrelated merchant content and design changes would share repository history, CI coordination, and platform release workflows. Production storefront repositories are independent consumers.

### Separate repository per platform application

Rejected because coordinated API, SDK, Admin, reference-client, and tooling changes benefit from atomic platform commits. The repository boundary follows lifecycle: shared platform source stays together; bespoke merchant storefront source remains separate.

### Generic `core` or `shared` packages

Rejected because they obscure ownership and invite backend domain logic, application internals, and unrelated utilities to accumulate behind ambiguous names.

### pnpm workspaces without Turborepo

Viable for a very small repository, but not selected. Turborepo provides a consistent dependency-aware task graph and local caching across intended platform applications and generated artifacts with limited architectural commitment.

## Consequences

### Positive

- merchants receive genuinely bespoke, statically rendered storefronts;
- merchant text and design changes do not create platform commits or releases;
- backend commerce and security behavior remains authoritative and shared;
- copied presentation source is fully customizable and visible to storefront developers;
- versioned packages provide a controlled path for critical fixes;
- the reference storefront continuously validates the external consumer experience;
- API, SDK, Admin, reference-client, and tooling changes can remain atomic inside the platform monorepo.

### Negative

- multiple storefront repositories require CI, deployment, dependency, and compatibility management;
- public package releases and a future copied-source distribution process add tooling and documentation responsibilities;
- copied presentation source intentionally diverges and cannot be silently upgraded;
- platform package upgrades must be rolled through storefront repositories;
- a bespoke storefront fleet eventually requires automated version inventory and upgrade pull requests;
- avoiding a CMS means merchant content changes require a developer commit and storefront deployment;
- static pages require deliberate revalidation rules for mutable catalog data.

## Architectural invariants

An implementation complies with this decision only if:

1. The platform repository uses one pinned pnpm workspace and one `pnpm-lock.yaml`.
2. API, Admin, reference storefront, and packages have explicit build and verification targets when they exist.
3. Existing API behavior, authentication, authorization, seed, and test workflows continue to work after relocation.
4. Authoritative commerce and authorization logic remains inside API modules.
5. No frontend, copied presentation source, or package imports private API implementation code.
6. Production merchant content and bespoke storefront source can change without a platform repository commit.
7. Merchant storefronts consume versioned public contracts for security-sensitive and correctness-critical integration.
8. Copied presentation source never duplicates backend commerce policy or private protocol implementation.
9. Copied presentation source is visible and locally owned by the consumer rather than hidden inside a runtime dependency.
10. Updates never silently overwrite locally modified storefront source.
11. The reference storefront exercises the same SDK, storefront-core, and source-ownership boundary offered to external storefronts.
12. A consumed SDK is automatically checked against the current external API contract.
13. Packages expose explicit public entry points and consumers do not deep-import private source.
14. Circular workspace dependencies fail automated checks.
15. No `core`, `shared`, `common`, or equivalent dumping-ground package is introduced; storefront-core remains limited to its named external integration responsibility.
16. Cached tasks declare correct deterministic inputs and outputs; stateful integration tests are not incorrectly cached.
17. Secrets are absent from packages, reusable presentation source, examples, and committed storefront source.
18. A clean installation and root build, typecheck, lint, and test workflow succeed from the committed lockfile when those targets exist.

## Related ADRs

- ADR-0001 defines platform principles, independent store deployments, and the no-fork rule for platform business logic.
- ADR-0003 defines backend module structure, data authority, internal contracts, kernel criteria, and dependency rules.
- ADR-0009 defines authentication architecture and public session behavior.
- ADR-0010 defines the Admin application architecture.
- ADR-0011 defines storefront rendering, public package compatibility, and external storefront contracts.
- ADR-0012 defines presentation-source distribution, catalogue format, installation, provenance, and update mechanics.
- A later focused contract ADR defines the complete external and internal contract taxonomy.
- A later focused events ADR defines direct calls, domain events, integration events, transactions, and extension-point rules.
