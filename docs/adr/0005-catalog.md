# ADR-0005 — Catalog, Products, and Variants

Status: Proposed  
Date: 2026-07-23

## Context

ADR-0004 establishes Catalog as the sole authority for Products, Variants,
merchandising state, option and attribute definitions, category and collection
membership, merchant identifiers, media references, and fulfillment
classification. It also establishes that every purchasable item is a Variant
and that Pricing and Inventory remain separate authorities.

Better Commerce needs a Catalog that works for an ordinary physical-product
store now while remaining suitable for independently deployed dog-house,
clothing, bicycle, cosmetics, digital-product, and service storefronts. The
model must support bespoke storefront presentation without placing
customer-specific business logic in the platform.

Without a focused decision, Catalog tends to acquire price and stock fields,
simple Products bypass Variants, option combinations become inconsistent,
published URLs are accidentally reused, and historical records depend on
mutable merchandising data.

This ADR defines the initial Catalog aggregate model, lifecycle, publication,
options, identifiers, classification, taxonomy, media references, module
contracts, concurrency, and archival behavior. It does not implement Catalog
or define Pricing, Inventory, Orders, binary asset storage, or storefront page
content.

## Decision drivers

- A small, understandable first implementation
- One model for simple and configurable Products
- Explicit storefront publication and administrative draft workflows
- Stable references for Pricing, Inventory, Cart, Orders, and Fulfillment
- Flexible merchandising across different independent stores
- Safe URL and merchant-identifier behavior
- Protection against lost administrative updates
- Efficient PostgreSQL-backed lists and detail queries
- No dependency on a CMS, search cluster, or event platform
- Preservation of Catalog history without pretending it is Order history

## Vocabulary

- **Product:** a merchant-managed merchandising aggregate that groups
  descriptive information and one or more purchasable Variants.
- **Variant:** the concrete purchasable unit referenced by other commerce
  capabilities.
- **Default Variant:** the single Variant with no option selections belonging to
  a simple Product.
- **Option:** a dimension that distinguishes Variants, such as Size or Color.
- **Option value:** one allowed value within an Option, such as Medium or Blue.
- **Variant selection:** exactly one value chosen for each Product Option.
- **Attribute:** descriptive or filterable information that does not identify a
  purchasable Variant.
- **Category:** a hierarchical merchandising classification.
- **Collection:** an explicitly curated group of Products.
- **Slug:** a stable, human-readable storefront path identifier.
- **SKU:** an optional merchant-facing identifier for a Variant.
- **Fulfillment classification:** Catalog's description of the expected
  fulfillment kind: physical shipment, digital delivery, or service
  fulfillment.
- **Published Catalog:** the read surface available to a public storefront.
- **Administrative Catalog:** the authorized read/write surface used by staff.

## Decision

### Catalog is one business module

The API introduces one `catalog` business module when implementation begins.
Products, Variants, options, attributes, categories, collections, and Catalog
media associations remain inside that module.

Catalog alone mutates Catalog-owned tables and enforces Catalog invariants.
Other modules consume stable scalar identifiers and Catalog's Module Public
Contract. They do not import Catalog entities, repositories, or private
services.

Catalog does not own:

- prices, discounts, or currencies;
- stock levels, tracking policy, reservations, or availability;
- carts, orders, payments, or fulfillment execution;
- customer identity or authorization roles;
- storefront pages, theme composition, or merchant-specific static copy;
- binary media storage or image transformation.

### Product is the aggregate consistency boundary

A Product and its Variants, Options, Option values, Attribute assignments,
media associations, and taxonomy memberships are changed through Product
aggregate commands.

Product-level commands enforce:

- at least one Variant always exists;
- every Variant belongs to exactly one Product;
- each Variant selection is valid for the Product's current Options;
- no two Variants represent the same Option-value combination;
- a published Product satisfies all publication requirements;
- Product and Variant lifecycle transitions are valid;
- slug and SKU uniqueness rules are preserved.

Category and Collection definitions have their own Catalog-owned lifecycle.
Assigning a Product to them is still performed through Catalog commands rather
than direct join-table access.

Large batch import is not allowed to bypass these invariants. A future import
workflow may process many Product commands efficiently inside bounded
transactions, but it remains a Catalog workflow.

### Identity and timestamps

Products, Variants, Options, Option values, Attributes, Categories,
Collections, and media associations use opaque UUID identifiers. Internal IDs:

- are not derived from SKU, slug, title, or array position;
- are never changed;
- are never reused after archival;
- are the only identifiers used for cross-capability references.

Catalog records use UTC `createdAt` and `updatedAt` instants. Lifecycle records
also retain the applicable `publishedAt` and `archivedAt` instants.

Database-generated UUIDs remain consistent with the existing backend. A future
identifier ADR may change the generation strategy for newly created records
without changing identifier semantics or re-keying existing records.

### Product lifecycle

A Product has exactly one lifecycle state:

- `draft`: administratively visible and editable, but absent from the Published
  Catalog;
- `published`: eligible to appear in the Published Catalog;
- `archived`: absent from the Published Catalog and retained for references and
  history.

Allowed transitions are:

```text
draft -> published
published -> draft
draft -> archived
published -> archived
archived -> draft
```

Restoring an archived Product returns it to `draft`. It is never restored
directly to `published`, because current publication requirements must be
revalidated.

Unpublishing is distinct from archiving. Unpublishing supports ordinary
merchandising work; archiving expresses retirement.

A Product may be published only when it has:

- a non-empty title;
- a current canonical slug;
- at least one active Variant;
- a valid fulfillment classification for every active Variant;
- internally consistent Option and Variant selections;
- all other Catalog-required fields introduced by an accepted amendment.

Publication does not require a price or stock record because those facts belong
to Pricing and Inventory. Therefore `published` means Catalog-visible, not
guaranteed purchasable. Storefront availability is a composed read decision,
and checkout revalidates all authoritative capabilities.

Changing published merchandising fields does not automatically unpublish a
Product if it remains valid. A command that would make it publication-invalid
is rejected unless it explicitly unpublishes or archives the Product in the
same Catalog transaction.

### Variant lifecycle

A Variant has exactly one Catalog lifecycle state:

- `active`: eligible for Published Catalog projection when its Product is
  published;
- `archived`: retained but not publicly selectable.

Archiving a Variant does not delete its identifier or release its SKU for
reuse. An archived Variant may be restored to `active` only if its Option
selection and identifier constraints remain valid.

A Product always contains at least one Variant, but a draft or archived Product
may temporarily contain no active Variants. A published Product must contain at
least one active Variant.

Variant state says nothing about price or stock. Catalog does not add
`available`, `inStock`, `inventoryQuantity`, or similar fields.

### Simple Products and configurable Products

A simple Product has no Options and exactly one default Variant with no Option
selections. Product creation creates this default Variant atomically.

A configurable Product defines one or more ordered Options. Every Variant then
selects exactly one value from every Option. Partial selections, selections
from another Product, and duplicate combinations are invalid.

The domain does not maintain separate Simple Product and Configurable Product
entity types. Whether a Product is simple is derived from the absence of
Options.

Converting between simple and configurable forms is an explicit Catalog
workflow. It must preserve or deliberately archive stable Variant identities;
it cannot silently replace a Variant that Pricing, Inventory, Cart, or Orders
may reference.

Before first publication, Option structure may be edited while Catalog still
enforces a valid final aggregate. After first publication, ordinary commands
may rename or reorder Options and values and may add values and Variants.
Adding or removing an Option dimension requires an explicit reshape workflow
that maps every retained Variant without changing its identity. That reshape
workflow is deferred from the first implementation, which rejects such changes
after first publication rather than guessing how to remap existing Variants.

### Options and Option values

Options are Product-local definitions, not global templates. Each Option has:

- an opaque ID;
- a merchant-visible name;
- a stable display position;
- one or more allowed values.

Each Option value has:

- an opaque ID;
- a merchant-visible label;
- a stable display position.

Names and labels are presentation values and are not identities. Renaming or
reordering them does not change the Variant ID or selection identity.

Within one Product:

- Option names are unique after canonical comparison;
- Option value labels are unique within their Option after canonical
  comparison;
- Option and value positions are deterministic;
- duplicate Variant combinations are rejected.

The first implementation sets conservative limits on Option count, values per
Option, Variant count, text length, and request size. Limits are configuration
or contract constants, not database accidents. They protect administrative
mistakes and combinatorial explosion without claiming every possible
combination must exist.

### Attributes are not Options

An Option changes which Variant is purchased. An Attribute describes or
classifies a Product or Variant without creating a new purchasable identity.

The Catalog contract keeps these concepts separate. A storefront must not infer
Variant identity from an Attribute, and an administrator must not use an
Option merely to create a filter label.

The initial Product implementation may ship without a general-purpose
attribute-definition engine. It must not substitute an unbounded arbitrary
JSON/EAV field as a shortcut. When the first real filtering or specification
requirements are known, an accepted amendment defines:

- Product-level versus Variant-level scope;
- supported exact value types and validation;
- cardinality and units;
- filter and sort semantics;
- indexing;
- lifecycle of definitions and assigned values.

Until then, title, description, Options, taxonomy, identifiers, and
fulfillment classification cover the initial Catalog slice.

### Product text and merchant content

Catalog stores product merchandising content required to sell and administer a
Product, such as title, summary, and description. It does not store arbitrary
storefront pages such as About Us, campaign landing pages, or theme-specific
layout.

Product text is treated as untrusted content at rendering boundaries even when
entered by authorized staff. The initial external contract uses plain text or a
single explicitly approved portable rich-text representation. Raw executable
HTML, scripts, embedded event handlers, and storefront-specific components are
not accepted as Catalog content.

Localization is not introduced in the initial schema. One deployment has one
configured primary Catalog language. A future localization decision must define
fallback, slug behavior, indexing, and contract shape before translated fields
are added.

### Fulfillment classification

Every Variant has one fulfillment classification:

- `physical`;
- `digital`;
- `service`.

A Product may supply a default classification for administrative convenience,
but the persisted Variant value is authoritative because Variant is the
purchased unit. The initial implementation requires all Variants of one Product
to share one classification. Mixed-classification Products require an explicit
amendment because their checkout and fulfillment presentation needs are not yet
defined.

Classification is stable Catalog metadata used by checkout and future
Fulfillment contracts. It does not imply:

- whether Inventory tracks the Variant;
- how a file is protected or delivered;
- whether a service has capacity or scheduling;
- shipping eligibility;
- tax treatment;
- immediate availability.

Those policies belong to their owning capabilities.

### Slugs and storefront URLs

Every published Product has one canonical slug. Slugs are canonicalized by a
documented, deterministic rule and are unique case-insensitively within the
independent store deployment.

Slugs are mutable presentation identifiers, never cross-capability identity.
When a published Product's canonical slug changes, Catalog retains the old slug
as a historical alias so a storefront can issue a permanent redirect to the
current canonical URL.

A slug or historical alias:

- cannot resolve to more than one Product;
- remains reserved while its Product exists, including when archived;
- cannot be silently reassigned to a different Product;
- must not shadow a storefront-reserved route.

Reserved route names are supplied through store/platform configuration rather
than hard-coded for one customer. Catalog validates them at write time.

Deleting or replacing historical aliases requires a separately authorized,
explicit operation because it can break external links and SEO history.

### SKU and merchant identifiers

SKU is an optional Variant identifier. When present, it is trimmed,
canonicalized for comparison, non-empty, and unique case-insensitively across
all Variants in one store deployment, including archived Variants.

SKU is not a database identity, URL identity, or Order foreign key. Orders
snapshot the SKU used at acceptance when it is relevant to customer service and
fulfillment.

An archived Variant does not automatically release its SKU. Reuse could make
imports, fulfillment records, support searches, and historical exports
ambiguous. A future explicit identifier-reassignment workflow may be introduced
with collision and audit rules if a real merchant requires it.

Barcodes, manufacturer part numbers, and external-system IDs are not overloaded
into SKU. They receive named, constrained identifier types when integrations
require them.

### Categories

Categories are Catalog-owned hierarchical classifications. A Category has an
opaque ID, title, canonical slug, lifecycle, display position, and optional
parent Category ID. Its lifecycle is `active` or `archived`; only active
Categories appear publicly.

Category rules are:

- one Category has at most one parent;
- cycles and self-parenting are prohibited;
- hierarchy depth is bounded by a contract limit;
- sibling ordering is deterministic;
- public Category projections include only active Categories and published
  Products;
- archiving a Category does not archive its Products;
- moving or archiving a Category is an explicit Catalog command.

The initial model supports a tree, not arbitrary multi-parent taxonomy. A
Product may belong to multiple Categories.

Category URLs and redirect behavior follow the same no-reuse principle as
Product URLs when Categories are externally addressable.

### Collections

Collections are Catalog-owned curated Product groupings. The initial
implementation supports manual membership and deterministic ordering only. A
Collection lifecycle is `active` or `archived`; only active Collections appear
publicly.

Dynamic rule-based Collections, personalization, scheduled campaigns, and
automatic merchandising are deferred. They require explicit query semantics,
indexing, explainability, and scheduling rules rather than an arbitrary rule
JSON field.

Archiving a Collection does not archive member Products. Archiving a Product
removes it from public Collection projections without destroying the retained
membership record needed for restoration or administration.

### Brands

Brand is not a required initial aggregate. A merchant that needs a displayed
brand before a dedicated model exists may use an explicitly named Product
field only if its validation and query semantics are accepted during
implementation review.

A reusable Brand entity, brand page, brand slug, logo, and filtering behavior
are introduced together through an amendment when a real storefront needs
them. Brand is not represented by an arbitrary tag.

### Media references

Catalog owns the association between a Product or Variant and a media asset,
including:

- opaque asset reference;
- media role;
- deterministic position;
- safe alternative text;
- optional focal/presentation metadata defined by contract.

Catalog does not store binary files in Product tables and does not persist
short-lived signed delivery URLs. Binary object lifecycle, upload validation,
malware controls, transformation, and delivery belong to a platform asset
facility or future Media capability.

Persisted asset references are provider-independent. Public projections expose
only safe, resolved media data suitable for the consumer. Variant media may
override or supplement Product media according to an explicit projection rule;
the API does not make storefronts guess merge semantics.

The first Catalog slice may use fixture asset references while the asset
contract is undecided, but production upload cannot launch without a reviewed
asset-storage and delivery contract.

### Publication and public projections

The Published Catalog exposes only:

- published Products;
- active Variants belonging to those Products;
- active/public taxonomy and collection data;
- media references safe for public delivery;
- fields explicitly included in the public external contract.

Public reads are fail-closed. An unknown, draft, archived, or otherwise hidden
Product returns the contract's not-found behavior rather than revealing its
administrative existence.

The public Catalog may expose a Product even when Pricing or Inventory makes it
currently unavailable, but composed storefront projections must label
availability from authoritative results. No cache or static render guarantees
checkout eligibility.

Publication is immediate initially. Scheduled publication, publication
channels, customer segments, preview tokens, and approval workflows are
deferred until required.

### Administrative commands and authorization

Catalog administrative HTTP endpoints are default-deny and require explicit
permissions. The initial permission contract distinguishes at least:

- viewing the Administrative Catalog;
- creating and editing drafts;
- publishing and unpublishing;
- archiving and restoring;
- managing taxonomy and Collections.

Exact permission names are added to the accepted authorization catalogue during
implementation contract review. Owner status does not bypass Catalog
invariants.

Every mutation validates request size, text length, identifiers, lifecycle
state, and concurrency version. Logs and errors do not expose private storage
details or raw persistence errors.

### Optimistic concurrency

Product administration uses optimistic concurrency to prevent two editors or
retries from silently overwriting each other.

Every Product aggregate has a monotonically increasing version. A mutation
provides the version it was based on. If the current version differs, Catalog
rejects the command with a conflict response and makes no partial change.

Changes to Variants, Options, assignments, media order, and Product taxonomy
membership increment the owning Product version in the same transaction.
Category and Collection definitions use their own concurrency versions.

This mechanism protects lost updates; it is not an idempotency mechanism.
Bulk/import commands and retried create requests require separate idempotency
rules when they become public.

### Transactions and persistence constraints

One aggregate command is atomic in PostgreSQL. No caller observes:

- a Product without its required Variant;
- a partially replaced Option structure;
- duplicate active Option combinations;
- half-applied publication or archival state;
- a canonical slug without its required alias update;
- a Product version increment without its associated changes.

Database constraints enforce stable identity, required ownership, uniqueness,
and referential integrity wherever practical. Application invariants remain
tested even when their full meaning cannot be expressed as one constraint.

Cross-module foreign keys are not introduced merely because Pricing or
Inventory will later reference Variant IDs. Each focused ADR decides its
referential lifecycle under ADR-0003.

The current disposable development workflow uses synchronization and reset
rather than migration files. Production launch remains blocked until the
accepted persistence policy supplies baseline migrations.

### Module Public Contract

Catalog's internal Module Public Contract exposes narrowly named operations and
immutable application data, not entities or repositories.

Expected consumers require capabilities such as:

- resolve one or more Variant references for authoritative checkout validation;
- confirm Product/Variant Catalog lifecycle and fulfillment classification;
- obtain safe current merchandising facts for an Order snapshot;
- obtain Product/Variant data for composed read models.

A Variant reference includes only fields the consumer is permitted to rely on,
for example Product ID, Variant ID, current display identifiers, lifecycle, and
fulfillment classification. It contains no authoritative price, stock, or
availability.

The contract does not expose a general repository-like `find`, `save`, query
builder, TypeORM entity, or transaction manager. Transaction-aware operations
accept ADR-0003's opaque transaction context only where a real cross-module
workflow requires atomic Catalog participation.

### External HTTP contracts

Administrative and public Catalog APIs are separate contract surfaces even when
they share application queries.

The administrative surface supports lifecycle-aware commands and complete
authorized views. The public surface supports storefront list, detail, and
taxonomy projections without exposing drafts, internal concurrency mechanics
unnecessarily, storage keys, or private metadata.

Lists use bounded pagination and deterministic ordering. Stable cursor/keyset
pagination is preferred for public lists and large administrative lists;
offset pagination may be used only where bounded data and UI requirements make
its tradeoff explicit.

Filtering and sorting are allow-listed contract features. Clients cannot send
raw field names, SQL fragments, or arbitrary expression trees.

OpenAPI is generated from the external contract, and future SDKs consume that
contract rather than importing backend DTO implementations.

### Search and read models

The initial Catalog uses PostgreSQL queries and indexes for exact lookup,
prefix/basic text search, filtering, and deterministic ordering. A separate
search cluster, indexing pipeline, event bus, and CQRS projection are not
introduced.

Storefront product-card and product-detail read models may compose Catalog with
Pricing and Inventory when those modules exist. Such models are read-only and
non-authoritative. They do not allow Catalog to write price or stock, and they
do not replace checkout validation.

Search behavior must explicitly define which published fields are searchable,
normalization, pagination, and ordering before it becomes an external contract.
Relevance ranking is not promised accidentally by a generic query parameter.

### Archival, deletion, and historical facts

The initial business API uses archival rather than hard deletion for Products,
Variants, Categories, and Collections. Development database reset is not a
business deletion workflow.

Catalog archival:

- hides current merchandising state according to lifecycle rules;
- preserves stable IDs, SKU reservations, slug aliases, and administrative
  traceability;
- does not delete Pricing, Inventory, Order, Payment, or Fulfillment history;
- does not rewrite Order snapshots.

Catalog is authoritative for current descriptive facts only. Orders snapshot
the title, SKU, classification, and other commercial facts required at
acceptance. Catalog change history is not a substitute for Order snapshots.

Privacy removal and legally required retention are decided separately.
Product descriptions and media must not be used to store customer personal
information.

## Initial implementation scope

After this ADR is accepted, the first Catalog implementation includes:

- the `catalog` business module and public entry point;
- Product create, read, edit, publish, unpublish, archive, and restore;
- one automatically created default Variant per new simple Product;
- Variant create/edit/archive/restore as required for Options;
- Product Options, values, and unique complete Variant combinations;
- UUID identity, Product slug/aliases, optional Variant SKU, timestamps, and
  optimistic versions;
- Variant fulfillment classification;
- public Product list/detail and administrative list/detail contracts;
- authorization catalogue additions and default-deny administrative routes;
- PostgreSQL constraints, module-boundary checks, unit tests, and
  Docker-backed integration/end-to-end tests.

Categories, manual Collections, full media upload, rich attributes, and
configurable Product conversion may be delivered as later Catalog increments.
Their architectural rules are decided here, but empty scaffolding is not
created before a real implemented workflow.

The first vertical proof is:

1. authorized staff creates a draft simple Product;
2. Catalog atomically creates its default Variant;
3. staff edits required merchandising facts and publishes it using the current
   aggregate version;
4. a public storefront query returns the published Product and active Variant;
5. draft and archived Products remain undiscoverable publicly;
6. concurrent stale administration is rejected;
7. another module can resolve the Variant only through Catalog's public
   contract.

Pricing and Inventory are not faked with nullable Catalog columns during this
slice.

## Explicit non-goals

This decision does not introduce:

- price, discount, currency, stock, reservation, or availability fields in
  Catalog;
- a Product/Variant inheritance hierarchy;
- separate Simple Product and Configurable Product tables;
- a universal Sellable abstraction;
- tenant, merchant, store, or sales-channel columns;
- a CMS, storefront page builder, theme schema, or customer-specific logic;
- localization or translated slugs;
- arbitrary HTML or executable Product content;
- arbitrary JSON/EAV attributes;
- dynamic Collections or personalization;
- bundles, subscriptions, gift cards, rentals, or composite Products;
- multi-parent Category graphs;
- scheduled publication or approval workflow;
- external search infrastructure;
- event sourcing, CQRS, an event bus, or an outbox;
- binary media storage in PostgreSQL;
- import/export, ERP, PIM, or marketplace integration;
- permanent deletion through normal administrative APIs;
- implementation of Pricing, Inventory, Orders, or Fulfillment.

These may be introduced through focused decisions or explicit amendments when
real requirements justify them.

## Alternatives considered

### Product without a Variant for simple Products

Rejected because carts, prices, inventory, orders, and fulfillment would need
two reference models. A default Variant keeps every purchasable line
consistent.

### Price and stock columns on Variant

Rejected because ADR-0004 assigns those facts to Pricing and Inventory. Their
lifecycle and concurrency requirements differ from merchandising.

### Boolean publication and deletion flags

Rejected because draft preparation, temporary unpublication, and retirement
are materially different operations. Named lifecycle states and transitions
make them explicit.

### Hard-delete archived records

Rejected because stable references, URLs, identifiers, support workflows, and
commercial history outlive current public merchandising.

### SKU or slug as internal identity

Rejected because both are merchant-visible and may need controlled changes.
Cross-capability references require immutable opaque IDs.

### Global reusable Option definitions

Rejected initially because shared mutable definitions couple unrelated
Products and make Product publication dependent on global edits. Product-local
Options are simpler and safer.

### Generate every Option combination automatically

Rejected because merchants may sell only a subset, and combinatorial expansion
can create accidental records. Commands create the intended Variants and
enforce uniqueness.

### Arbitrary attribute JSON

Rejected because it avoids deciding types, validation, filtering, indexing, and
compatibility. Attributes are added with explicit semantics when required.

### Dynamic Collections from the beginning

Rejected because rule evaluation, indexing, scheduling, and explainability add
complexity without a current requirement. Manual Collections cover the first
curation need.

### Separate search service

Rejected at the expected scale. PostgreSQL is sufficient until measured
requirements demonstrate otherwise.

### Put all Product content in storefront repositories

Rejected because purchasable Products and merchandising state require
authoritative administrative workflows and current API data. Bespoke static
pages and theme composition remain in storefront source; transactional Catalog
content remains in Catalog.

## Consequences

### Positive

- Every purchasable item has one stable Variant identity.
- Draft work, public visibility, temporary unpublication, and retirement are
  explicit.
- Pricing and Inventory can evolve independently without Catalog schema debt.
- URLs and SKUs remain safe for historical and integration use.
- Option combinations remain internally consistent.
- Independent storefronts can present Catalog data without owning business
  truth.
- Optimistic concurrency prevents silent administrative lost updates.
- The initial implementation remains small while future taxonomy and media
  behavior have defined boundaries.

### Negative

- Even a simple Product creates both Product and Variant records.
- Product aggregate commands must coordinate several Catalog tables.
- Slug aliases and optimistic versions add persistence and API work.
- Published storefront queries eventually compose multiple modules for price
  and availability.
- Attribute flexibility is intentionally limited until concrete requirements
  exist.
- Archive-only administration may require cleanup/search affordances for
  merchants.

## Architectural invariants

An implementation complies with this decision only if:

1. Catalog alone mutates Product, Variant, Option, taxonomy, collection, and
   Catalog media-association state.
2. Every Product has at least one Variant.
3. Every purchasable reference uses Variant ID.
4. A simple Product has one default Variant with no Option selections.
5. A configurable Variant selects exactly one value for every Product Option.
6. Duplicate Variant Option combinations are rejected.
7. Product and Variant IDs are immutable, opaque, and never reused.
8. A published Product has a title, canonical slug, and at least one active
   valid Variant.
9. Draft, archived, and otherwise hidden Products are not disclosed by public
   Catalog endpoints.
10. Publication never implies price, stock, or checkout availability.
11. Catalog contains no authoritative price, stock, reservation, order,
    payment, or fulfillment-execution state.
12. Every Variant has an explicit fulfillment classification that does not
    imply Inventory policy.
13. SKU is optional, Variant-owned, and unique after canonical comparison when
    present.
14. Slugs and aliases cannot resolve to multiple Products or be silently reused.
15. Product Options and descriptive Attributes remain distinct concepts.
16. Category hierarchies contain no cycles and have bounded depth.
17. Initial Collections are manual and deterministically ordered.
18. Catalog stores provider-independent media references, not binary objects or
    temporary signed URLs.
19. Administrative mutations are authorized, validated, atomic, and protected
    by optimistic concurrency.
20. Other modules consume Catalog through its Module Public Contract and never
    through entities or repositories.
21. Public and administrative external contracts expose only fields required
    by their consumer and use bounded deterministic queries.
22. Archival preserves identifiers and does not cascade-delete commercial
    history.
23. Orders use immutable snapshots rather than live Catalog data to explain an
    accepted purchase.
24. Customer-specific storefront pages, composition, and business logic do not
    enter Catalog.

## Acceptance criteria before implementation

Before implementation begins, review and approve:

- exact lifecycle names and transitions;
- publication-required Catalog fields;
- UUID, slug, alias, and SKU rules;
- Option/Variant consistency and conversion policy;
- fulfillment-classification scope;
- first-slice inclusion or deferral of Categories, Collections, and media;
- administrative permissions;
- optimistic-concurrency wire behavior;
- public and administrative endpoint shapes;
- configured limits for Options, Variants, text, hierarchy depth, and pages;
- required unit, persistence, authorization, boundary, and end-to-end tests.

Acceptance of this ADR authorizes an implementation plan, not unreviewed
implementation. The implementation contract must identify which decided
increments are in the first slice and must not introduce placeholder modules
for deferred capabilities.

## Freeze policy

After acceptance, this ADR is frozen. Editorial corrections may clarify
wording without changing meaning. A normative change to ownership, identity,
lifecycle, publication, Option/Variant rules, identifier reuse, concurrency,
or archival requires a dated amendment or a superseding ADR.

Implementation discoveries are evidence for review; they do not silently
weaken these rules.

## Related decisions

- ADR-0001 defines platform principles and independent store deployments.
- ADR-0002 defines the platform repository and independent storefront boundary.
- ADR-0003 defines module authority, public contracts, transactions, read
  models, and dependency enforcement.
- ADR-0004 defines the commerce capability map and Variant-based purchasable
  model.
- ADR-0006 defines Orders and historical purchase state.
- ADR-0007 defines Money representation and Pricing.
- ADR-0008 defines Inventory and reservations.
- ADR-0009 defines authentication and session behavior.
