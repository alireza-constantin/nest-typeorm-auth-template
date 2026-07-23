# Catalog Contract

Status: Approved architecture contract
Scope: initial Catalog implementation for one independent store deployment
Version: 1.0
Date: 2026-07-23
Approved: 2026-07-23
Authority: `docs/adr/0005-catalog.md`

## 1. Purpose

This contract turns accepted ADR-0005 into exact implementation behavior for
the first Catalog slice. It defines Product and Variant fields, commands,
permissions, HTTP behavior, concurrency, limits, internal module operations,
errors, and required verification.

This contract does not authorize Pricing, Inventory, Orders, Categories,
Collections, media upload, typed Attributes, or customer-specific storefront
code. Those are separate increments even where ADR-0005 already defines their
architectural boundaries.

## 2. Initial scope

Version 1 implements:

- one Catalog business module;
- draft Product creation with one default Variant;
- Product merchandising edits;
- simple and configurable Products;
- Product Options, Option values, and complete Variant combinations;
- Product and Variant lifecycle;
- Product slug history and resolution;
- optional Variant SKU;
- Variant fulfillment classification;
- optimistic aggregate concurrency;
- authorized administrative list/detail and mutations;
- public published Product list and slug detail;
- a narrow Catalog Module Public Contract for Variant resolution;
- PostgreSQL constraints and complete risk-based tests.

Version 1 does not implement Categories, Collections, media associations,
general Attributes, search relevance, bulk import/export, scheduled
publication, localization, or Product-type conversion after first publication.

## 3. Logical data contract

The persistence implementation may choose names and internal mappings that fit
the module, but it must preserve this logical model and expose no persistence
entity as a public contract.

### 3.1 Product

| Field | Contract |
| --- | --- |
| `id` | Opaque UUID; immutable and never reused |
| `version` | Positive, monotonically increasing aggregate version |
| `status` | `draft`, `published`, or `archived` |
| `title` | Required trimmed text |
| `summary` | Optional trimmed plain text |
| `description` | Optional plain text; no executable HTML |
| `slug` | Current normalized canonical slug |
| `everPublished` | Durable fact used to enforce post-publication Option rules |
| `publishedAt` | Nullable UTC instant; set to the latest successful publication |
| `archivedAt` | Nullable UTC instant |
| `createdAt` | UTC instant |
| `updatedAt` | UTC instant |

`everPublished` never returns to false. Unpublishing or archiving does not erase
the fact that external consumers may reference this Product.

### 3.2 Product slug alias

| Field | Contract |
| --- | --- |
| `productId` | Owning Product UUID |
| `slug` | Normalized historical slug |
| `createdAt` | UTC instant when the alias became reserved |

The current canonical slug and every historical alias share one
case-insensitive uniqueness namespace. A slug cannot identify or alias two
Products.

Changing the canonical slug retains the previous canonical value as an alias in
the same transaction. Restoring an old alias as canonical is allowed only for
the same Product and does not remove the remaining alias history.

### 3.3 Variant

| Field | Contract |
| --- | --- |
| `id` | Opaque UUID; immutable and never reused |
| `productId` | Owning Product UUID |
| `status` | `active` or `archived` |
| `title` | Optional merchant-visible override/label |
| `sku` | Optional merchant-visible identifier |
| `normalizedSku` | Private canonical comparison value |
| `fulfillmentClassification` | `physical`, `digital`, or `service` |
| `position` | Non-negative deterministic display position |
| `createdAt` | UTC instant |
| `updatedAt` | UTC instant |

SKU uniqueness includes archived Variants. Empty or whitespace-only SKU input
is stored as absent, not as a shared empty identifier.

Version 1 requires every Variant of one Product to use the same fulfillment
classification.

### 3.4 Product Option

| Field | Contract |
| --- | --- |
| `id` | Opaque UUID |
| `productId` | Owning Product UUID |
| `name` | Trimmed merchant-visible name |
| `position` | Unique deterministic position within the Product |

Option names are unique within a Product after canonical comparison.

### 3.5 Option value

| Field | Contract |
| --- | --- |
| `id` | Opaque UUID |
| `optionId` | Owning Option UUID |
| `label` | Trimmed merchant-visible value |
| `position` | Unique deterministic position within the Option |

Labels are unique within one Option after canonical comparison.

### 3.6 Variant selection

A Variant selection links one Variant to one value of one Product Option.

For a configurable Product:

- each Variant has exactly one selection for every Product Option;
- a Variant cannot select two values from one Option;
- every selected value belongs to the same Product;
- no two Variants have the same complete combination.

For a simple Product:

- there are no Options;
- there is exactly one default Variant;
- the default Variant has no selections.

The implementation persists a deterministic combination key or an equivalent
database-enforced representation so concurrent commands cannot create duplicate
combinations.

## 4. Normalization and limits

Normalization is centralized in Catalog domain/application code and covered by
table-driven tests. Database comparison columns or indexes must enforce the
same result.

### 4.1 Slug

A slug:

- is normalized with Unicode NFKC;
- is lower-cased using one documented locale-independent algorithm;
- contains Unicode letters or digits separated by single ASCII hyphens;
- has no leading or trailing hyphen;
- contains no slash, dot segment, query marker, fragment marker, control
  character, or whitespace after normalization;
- is between 1 and 160 Unicode code points;
- does not match a configured reserved storefront route after normalization.

If a supplied slug is invalid, the API rejects it. Version 1 does not silently
transliterate or derive a slug from the title.

Reserved routes are deployment configuration and include platform-required
paths such as administrative, authentication, API, asset, cart, and checkout
entry points. Configuration validation fails at startup if its values cannot be
normalized unambiguously.

### 4.2 SKU

A SKU:

- preserves the trimmed merchant-visible spelling;
- compares by Unicode NFKC plus locale-independent lower-casing;
- is at most 100 Unicode code points;
- contains no control character;
- is unique across all current and archived Variants.

Version 1 does not automatically generate SKU values.

### 4.3 Text and aggregate limits

| Item | Limit |
| --- | ---: |
| Product title | 200 Unicode code points |
| Product summary | 500 Unicode code points |
| Product description | 50,000 Unicode code points |
| Variant title | 200 Unicode code points |
| Option name | 100 Unicode code points |
| Option value label | 100 Unicode code points |
| Options per Product | 5 |
| Values per Option | 100 |
| Total Variants per Product | 500 |
| Public/admin page size default | 20 |
| Public/admin page size maximum | 100 |

Limits count decoded logical content, not transport bytes. The platform's
global request-body limit remains an additional protection.

## 5. Product lifecycle

Allowed transitions are:

```text
draft -> published
published -> draft
draft -> archived
published -> archived
archived -> draft
```

All other transitions fail with `409 catalog.invalid_product_transition`.

### 5.1 Publish

Publishing requires:

- the caller's expected aggregate version matches;
- a non-empty valid title;
- a valid canonical slug;
- at least one active Variant;
- valid Option/value/Variant-selection consistency;
- the same fulfillment classification across all Variants in version 1.

Price and Inventory are not publication requirements.

On success:

- status becomes `published`;
- `publishedAt` becomes the current UTC instant;
- `everPublished` becomes true;
- the Product aggregate version increments once.

Publishing an already published Product is not treated as success; it is an
invalid transition.

### 5.2 Unpublish

Unpublishing transitions `published` to `draft`, clears no slug, Variant,
identifier, or historical field, and increments the aggregate version once.

### 5.3 Archive

Archiving transitions `draft` or `published` to `archived`, records
`archivedAt`, preserves identifiers and child records, and increments the
aggregate version once.

### 5.4 Restore

Restoring transitions `archived` to `draft`, clears `archivedAt`, revalidates
identifier constraints, and increments the aggregate version once. It never
publishes automatically.

## 6. Variant and configuration behavior

### 6.1 Product creation

Product creation atomically creates:

- one draft Product;
- its canonical slug reservation;
- one active default Variant;
- no Options or selections.

The create request supplies Product title, slug, optional summary/description,
optional default Variant title/SKU, and fulfillment classification.

The Product and default Variant either both commit or neither commits.

### 6.2 Product edits

An ordinary Product edit may change:

- title;
- summary;
- description;
- canonical slug.

Changing slug retains the prior slug as an alias atomically.

An edit that would make a published Product invalid fails. The caller must
unpublish or archive explicitly rather than hiding a lifecycle transition
inside an ordinary edit.

### 6.3 Configuration replacement

One atomic configuration command supplies the desired Options, Option values,
Variants, selections, SKU values, titles, positions, lifecycle values, and
fulfillment classification together with the expected Product version.

Before first publication, this command may reshape the Product freely while
retaining any supplied existing IDs that still represent the same records.

After first publication, version 1 permits:

- renaming or reordering existing Options and values;
- adding Option values;
- adding Variants using the existing Option dimensions;
- editing Variant title, SKU, position, and status;
- restoring an archived Variant when all constraints pass.

After first publication, version 1 rejects:

- adding or removing an Option dimension;
- removing an Option value still referenced by any retained Variant;
- changing an existing Variant's selected combination;
- deleting or replacing a stable Variant ID;
- converting between simple and configurable forms.

Those operations require the future explicit reshape workflow from ADR-0005.

The command rejects a final state with no Variant, duplicate combinations,
partial selections, invalid foreign selections, or a published Product with no
active Variant.

## 7. Optimistic concurrency

Every Product aggregate mutation requires `expectedVersion` as a positive
integer in the request body. The version comparison and mutation occur in one
database transaction.

If the current version differs:

- the command performs no write;
- the API returns `409 Conflict`;
- the problem code is `catalog.version_conflict`;
- the response may include the current numeric version for an authorized
  administrative caller;
- the client reloads and deliberately reapplies or discards its changes.

Each successful command increments the Product version exactly once regardless
of the number of Catalog rows changed.

Create has no expected version. Version 1 does not promise idempotent Product
creation; the unique slug and optional SKU prevent common duplicate retries,
and the Admin client must disable duplicate submission. A future bulk/import
contract must define idempotency before exposure.

## 8. Authorization contract

Every administrative Catalog route also requires `admin.access` through the
existing fail-closed administrative enforcement pipeline.

Version 1 adds these stable permissions:

| Permission | Authority |
| --- | --- |
| `catalog.products.read` | List and inspect administrative Product state |
| `catalog.products.write` | Create and edit Product/Variant configuration |
| `catalog.products.publish` | Publish and unpublish Products |
| `catalog.products.archive` | Archive and restore Products or Variants |

Role assignment:

- `owner`: receives every permission explicitly;
- `administrator`: receives every Catalog permission explicitly;
- `catalog_manager`: receives every Catalog permission explicitly;
- `marketing_manager`: retains `catalog.products.read` only;
- other built-in roles receive no new Catalog permission unless explicitly
  amended.

The existing authorization contract and code-owned permission catalogue must be
updated in the same implementation change. No role-name check appears in
Catalog.

Variant archive/restore requires `catalog.products.archive`. Configuration
edits that only activate a newly created Variant require
`catalog.products.write`; restoring an existing archived identity requires the
archive permission.

## 9. Administrative HTTP contract

All routes below are under `/api/v1/admin/catalog`.

| Method and route | Permission | Purpose |
| --- | --- | --- |
| `POST /products` | `catalog.products.write` | Create draft Product and default Variant |
| `GET /products` | `catalog.products.read` | Bounded administrative Product list |
| `GET /products/:productId` | `catalog.products.read` | Complete administrative aggregate view |
| `PATCH /products/:productId` | `catalog.products.write` | Edit Product merchandising fields |
| `PUT /products/:productId/configuration` | `catalog.products.write`; archive permission additionally when restoring/archiving existing Variants | Atomically replace allowed Product configuration |
| `POST /products/:productId/publish` | `catalog.products.publish` | Publish Product |
| `POST /products/:productId/unpublish` | `catalog.products.publish` | Return published Product to draft |
| `POST /products/:productId/archive` | `catalog.products.archive` | Archive Product |
| `POST /products/:productId/restore` | `catalog.products.archive` | Restore Product to draft |

Every state-changing route retains trusted-origin and CSRF protection.

The list supports only allow-listed filters:

- `status`;
- exact normalized `sku`;
- title/slug prefix query `q`;
- opaque pagination cursor;
- `limit`.

Default ordering is `updatedAt DESC, id DESC`. Cursor semantics preserve that
ordering. Unsupported filters or sort fields return validation failure rather
than being ignored.

Administrative responses never expose normalized comparison columns,
persistence relation objects, database constraint names, or storage
credentials.

## 10. Public HTTP contract

Public routes are intentionally read-only:

| Method and route | Purpose |
| --- | --- |
| `GET /api/v1/catalog/products` | Bounded list of published Products |
| `GET /api/v1/catalog/products/:slug` | Resolve canonical or historical Product slug |

The public list initially supports:

- opaque cursor;
- `limit`;
- title/slug prefix query `q`.

Default ordering is `publishedAt DESC, id DESC`. Only published Products with
at least one active Variant appear.

The public detail route:

- returns the Product when the slug is canonical;
- resolves an alias to the same Product;
- includes `canonicalSlug` and `requestedSlugIsCanonical`;
- allows the storefront to issue a permanent redirect for an alias;
- returns `404` for draft, archived, unknown, or invalidly published state
  without revealing which case occurred.

Public Product responses include:

- Product ID, title, summary, description, canonical slug, and timestamps safe
  for display;
- active Variant IDs, titles, SKU when deliberately public, fulfillment
  classification, and deterministic order;
- Options, values, and selections needed to choose a Variant.

They do not include:

- price, currency, stock, reservation, or `isAvailable`;
- draft/archived records;
- historical aliases other than canonical-resolution metadata;
- aggregate version;
- normalized comparison fields;
- staff actor data or internal persistence metadata.

Catalog public reads may use conditional response validators. Version 1 does
not promise a shared CDN TTL or instant static-site regeneration. A storefront
that prerenders Catalog data must define its own revalidation and accept that
checkout later revalidates current authoritative facts.

## 11. Catalog Module Public Contract

Catalog exports immutable application types and narrowly named operations
through `modules/catalog/index.ts`.

The first consumer-facing operations are:

```text
resolvePurchasableVariants(variantIds)
getVariantSnapshotFacts(variantIds)
```

`resolvePurchasableVariants`:

- accepts a bounded, deduplicated list of Variant UUIDs;
- returns one result per requested ID without relying on request order;
- reports current Product and Variant Catalog eligibility;
- returns Product ID, Variant ID, current display title/SKU,
  fulfillment classification, and lifecycle facts;
- returns no Pricing or Inventory data.

`getVariantSnapshotFacts` returns the current Catalog-owned descriptive facts an
authorized future checkout/order workflow may snapshot. Calling it does not
reserve, publish, price, or mutate anything.

The exact TypeScript shapes are implementation details until another module
consumes them, but contract tests must lock their semantics before that
consumer ships.

No Module Public Contract operation exposes TypeORM, repositories, entities,
query builders, or a general-purpose find/save API.

## 12. Errors and HTTP semantics

Problem responses use the existing problem-details envelope and request ID.

| Condition | Status | Stable problem code |
| --- | ---: | --- |
| Invalid input or aggregate limit | `400` | `catalog.validation_failed` |
| Missing/invalid authentication on Admin | `401` | Existing authentication code |
| Authenticated caller lacks Admin permission | `403` | Existing authorization code |
| Product/Variant not visible to that surface | `404` | `catalog.not_found` |
| Duplicate slug or reserved route | `409` | `catalog.slug_conflict` |
| Duplicate SKU | `409` | `catalog.sku_conflict` |
| Stale aggregate version | `409` | `catalog.version_conflict` |
| Invalid lifecycle transition | `409` | `catalog.invalid_product_transition` |
| Invalid Option/Variant structure | `409` | `catalog.configuration_conflict` |
| Catalog database unavailable | `503` | Existing dependency-unavailable contract |

Public not-found responses do not distinguish unknown, draft, archived, or
otherwise hidden Products. Raw PostgreSQL/TypeORM errors, constraint names, SQL,
and stack traces never enter production responses.

Concurrent uniqueness conflicts are translated to the same stable problem code
as prevalidated conflicts.

## 13. Transactions and side effects

Each Catalog command owns one PostgreSQL transaction. The transaction contains
all Product aggregate writes and its version increment.

No external network request, media upload, storefront build hook, cache purge,
or notification occurs inside the transaction.

Version 1 introduces no Catalog event bus or outbox. Successful Catalog
mutations emit safe structured operational logs after commit. If later
storefront regeneration requires durable delivery, that workflow receives a
focused delivery/idempotency decision instead of assuming an in-memory event is
reliable.

## 14. Security and content handling

- Administrative mutations are session-authenticated, CSRF-protected,
  trusted-origin checked, and permission checked.
- Public reads expose only an allow-listed published projection.
- Product text is returned as data, never executed by the API.
- Storefront renderers escape plain text by default.
- Control characters are rejected where identifiers or display fields cannot
  safely use them.
- Query filters are allow-listed and parameterized.
- Pagination limits are enforced server-side.
- Error messages do not disclose existence across public visibility boundaries.
- Logs exclude cookies, session IDs, CSRF values, authorization headers, full
  request bodies, database URLs, and storage credentials.

## 15. Required tests

Implementation is incomplete until automated tests prove:

1. Product creation atomically creates exactly one default Variant.
2. A failed create leaves neither Product nor Variant.
3. Product and Variant IDs remain stable through edits and lifecycle changes.
4. Simple Products have no Options or selections.
5. Configurable Variants select exactly one value for every Option.
6. Duplicate or partial combinations are rejected, including concurrent
   attempts.
7. Slug and alias uniqueness survives concurrent writes.
8. Changing slug preserves old-slug resolution to the canonical Product.
9. A slug/alias cannot be reassigned to another Product, including after
   archival.
10. SKU normalization and uniqueness include archived Variants and concurrent
    writes.
11. Publishing fails without every Catalog publication requirement.
12. Publishing does not require price or Inventory state.
13. Public reads expose published Products and active Variants only.
14. Public not-found behavior does not distinguish hidden lifecycle states.
15. Every allowed Product and Variant lifecycle transition succeeds.
16. Every forbidden transition fails without a partial write.
17. Restore returns an archived Product to draft, never directly to published.
18. A stale `expectedVersion` returns `409` and changes nothing.
19. Every successful aggregate command increments version exactly once.
20. Post-publication configuration changes obey the reshape restrictions.
21. Mixed Variant fulfillment classifications are rejected in version 1.
22. A normal customer cannot access any administrative Catalog endpoint.
23. Each administrative endpoint requires its exact permission and
    `admin.access`.
24. Catalog permissions are assigned to built-in roles exactly as contracted.
25. State-changing routes enforce CSRF and trusted-origin protections.
26. Catalog's public entry point exports no entities, repositories, or TypeORM
    types.
27. Automated module-boundary checks reject private Catalog deep imports.
28. Module Public Contract resolution returns Catalog facts but no price,
    stock, or availability.
29. Pagination is bounded, deterministic, and does not duplicate/skip stable
    rows within its documented consistency assumptions.
30. Errors translate database conflicts without exposing persistence details.
31. Logs and responses contain none of the prohibited sensitive fields.
32. OpenAPI documents validation, lifecycle, permission, concurrency, and
    problem responses.

Pure domain rules receive unit tests. PostgreSQL constraints, transactions,
normalization uniqueness, concurrency, and rollback receive Docker-backed
tests. HTTP visibility, authentication, authorization, CSRF, OpenAPI, and error
translation receive end-to-end tests with isolated test state.

## 16. Implementation sequencing

After this contract is approved, work proceeds in reviewable waves:

1. Domain rules, normalization, logical persistence, and PostgreSQL constraints.
2. Application commands, aggregate transactions, and Module Public Contract.
3. Authorization catalogue changes and administrative HTTP endpoints.
4. Public projections, slug resolution, pagination, and OpenAPI.
5. Boundary, concurrency, rollback, security, and full-stack verification.
6. Independent review only if unresolved risk remains after complete evidence.

No wave creates Pricing, Inventory, Orders, Category, Collection, Media,
Attribute, search-service, event, or storefront implementations.

## 17. Production boundary

During current pre-launch development:

- schema synchronization may create Catalog tables in development/test;
- entity changes may require the documented local database reset;
- migration files are not generated for every schema change.

Before production launch:

- synchronization remains disabled in production;
- a reviewed baseline migration includes the stabilized Catalog schema and
  constraints;
- production asset storage/delivery is decided before Product media upload;
- backup/restore and destructive Catalog operations are tested;
- configured reserved routes and limits are reviewed per deployment;
- public caching and storefront revalidation behavior are documented by the
  consuming storefront.

## 18. Explicit non-goals

Version 1 does not include:

- Categories or Collections endpoints;
- typed/filterable Attributes;
- Product media upload or binary storage;
- Pricing or Inventory projections;
- Cart, Checkout, Orders, Payments, or Fulfillment execution;
- customer reviews, wishlists, recommendations, or recently viewed Products;
- localization, sales channels, scheduled publication, or preview tokens;
- bulk import/export or idempotent create;
- barcode, manufacturer-part, ERP, PIM, or marketplace identifiers;
- advanced search, faceting, relevance tuning, or external search services;
- permanent Product/Variant deletion;
- dynamic Variant Option reshaping after first publication;
- Catalog events, outbox, workers, or storefront build hooks;
- merchant-specific pages, components, or business rules.

These require explicit follow-up contracts and must not be inferred from the
initial Catalog module.
