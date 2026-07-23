# ADR-0004 — Commerce Domain Model

Status: Accepted  
Date: 2026-07-23  
Accepted: 2026-07-23

## Context

Better Commerce must support ordinary physical products now while leaving a
credible path for digital products, services, and later commerce models. It is
a modular monolith deployed independently for each merchant store, not a
multi-tenant marketplace.

ADR-0001 establishes exact money, historical order facts, concurrency-safe
inventory, independent store deployments, and API-authoritative commerce
rules. ADR-0003 establishes capability ownership, Module Public Contracts,
direct in-process communication, explicit cross-module transactions, and the
rule that a module alone mutates its persistent state.

The commerce model now needs durable boundaries before Product, Order, Pricing,
and Inventory decisions are written or implemented. Without those boundaries,
Product tends to accumulate price and stock fields, Orders depend on live
catalog records, payment and fulfillment become one overloaded status, and
checkout becomes an untestable service that writes every table.

This ADR defines the commerce capability map, the meaning of Product and
Variant, mutable intent versus historical fact, cross-capability references,
checkout orchestration, and the rules that future focused ADRs must preserve.
It does not define complete schemas or APIs for each capability.

## Decision drivers

- Correct behavior for physical products today
- A credible path for digital products and services
- Historical explainability of every accepted order
- Exact pricing and totals
- Concurrency-safe inventory and reservations
- Clear ownership without microservice ceremony
- Simple operation by a solo developer
- No tenant abstractions in a separately deployed store
- Incremental implementation through focused ADRs
- Efficient storefront and administrative queries
- Idempotent and recoverable checkout/payment workflows

## Vocabulary

- **Product:** a merchant-managed catalog grouping used to describe and present
  something offered for purchase.
- **Variant:** the concrete purchasable unit selected on a cart or order line.
  A Product has at least one Variant, including a simple product with no visible
  options.
- **Merchandising data:** current descriptive catalog information such as title,
  description, options, category membership, and media references.
- **Money:** an exact amount paired with an explicit currency.
- **Cart:** mutable purchase intent. It is not a price, stock, tax, or order
  guarantee.
- **Checkout:** the application workflow that validates current facts and
  converts purchase intent into an order.
- **Order:** the store's durable historical record of an accepted purchase and
  the obligations created by it.
- **Order line snapshot:** the immutable commercial facts captured for one
  purchased Variant at order acceptance.
- **Inventory reservation:** a time-bounded claim on tracked stock for a
  checkout or order.
- **Payment attempt:** one idempotent attempt to authorize, capture, refund, or
  otherwise move money through a payment provider.
- **Fulfillment:** execution of an order obligation, such as shipment, digital
  delivery, or delivery of a service.
- **Authoritative state:** the module-owned current state used to enforce a
  business invariant.
- **Projection:** a read-only query shape composed from multiple capabilities.

## Decision

### Commerce capability map

The platform uses focused capabilities rather than one large Commerce module.

| Capability | Authority |
| --- | --- |
| Catalog | Products, Variants, merchandising state, option/attribute definitions, category/collection membership, merchant identifiers, and fulfillment classification |
| Pricing | Current exact prices, price-selection rules, price lists when needed, and authoritative price results |
| Inventory | Whether a Variant is stock-tracked, stock state, reservations, releases, and adjustments |
| Cart | Mutable line intent and cart ownership when a persistent cart is introduced |
| Checkout | Cross-capability validation and order-submission orchestration; not automatically a persistent aggregate |
| Orders | Accepted order records, order-line snapshots, order lifecycle, commercial totals, and customer-service history |
| Payments | Provider-neutral payment attempts, provider references, idempotency, authorization/capture/refund state, and payment failure history |
| Fulfillment | Shipments, digital deliveries, service execution, and their operational state |
| Promotions | Promotion definitions and eligibility when promotion behavior is introduced |
| Tax | Tax calculation inputs/results and provider integration when tax behavior is introduced |
| Customers | Commerce-specific customer profile and address data when those concepts exceed Identity's authentication responsibility |

Only capabilities with real behavior and data are created. This map does not
authorize empty module directories or speculative service interfaces.

Catalog, Pricing, Inventory, and Orders are the immediate subjects of
ADR-0005 through ADR-0008. Cart, Checkout, Payments, Fulfillment, Promotions,
Tax, and Customers receive focused decisions when their first real workflows
are designed.

Identity remains responsible for authentication identity. Authorization remains
responsible for staff authority. Neither module becomes the owner of commerce
data merely because an order or customer record references a user ID.

### Catalog owns Product and Variant

Catalog is the capability name. A separate top-level Products capability is not
created.

A Product groups merchandising information and purchasable choices. A Variant
is the unit referenced by:

- a cart line;
- a price record or quote;
- inventory tracking;
- an order line;
- payment or fulfillment allocation when required.

Every purchasable Product has at least one Variant. A simple product receives a
default Variant even if the storefront does not display options. This avoids
special cases where some lines reference Products and others reference
Variants.

Catalog owns current descriptive and classification facts. It does not own:

- sale price or price lists;
- stock counts or reservations;
- tax results;
- cart quantity;
- payment state;
- order history;
- shipment, download, or appointment execution.

Catalog may expose a safe Variant reference containing only facts consumers
need, such as stable ID, current title/SKU identifiers, status, and fulfillment
classification. It does not expose entities or permit another module to mutate
Catalog state.

ADR-0005 defines Product/Variant schemas, lifecycle, options, identifiers,
categories, collections, media references, and publication rules.

### Product kinds are capabilities, not inheritance trees

The initial model supports these broad fulfillment classifications:

- physical shipment;
- digital delivery;
- service fulfillment.

The model does not create separate Product entity inheritance hierarchies such
as `PhysicalProduct`, `DigitalProduct`, and `ServiceProduct`. Shared catalog
facts remain Product/Variant facts. Specialized operational behavior belongs to
the capability that owns it:

- Inventory decides whether a Variant is stock-tracked.
- Fulfillment owns shipment and delivery execution.
- Digital fulfillment owns protected delivery or license issuance when needed.
- Service fulfillment owns scheduling, capacity, or completion when needed.

A physical Variant may be made to order and therefore not stock-tracked. A
digital Variant may later have a finite license pool. A service may later have
capacity constraints. Fulfillment classification therefore does not silently
determine Inventory policy.

Bundles, subscriptions, gift cards, rentals, marketplaces, and configurable
composite products are future commerce capabilities. They are not anticipated
through a universal `Sellable` table or speculative inheritance hierarchy.

### Stable identifiers and cross-capability references

Modules reference other capabilities through stable scalar identifiers and
Module Public Contracts.

- Variant ID is the normal reference for a purchasable line.
- Product ID may be retained for grouping, search, or traceability.
- Order ID and order-line ID identify historical obligations.
- Identity user ID may associate an authenticated buyer or actor.
- Human-facing order number, SKU, slug, email, and provider reference are not
  substitutes for internal identity.

Identifiers are never reused. Human-facing identifiers may change according to
their owning capability's rules, so historical records snapshot the values
needed for explanation.

Deliberate cross-module foreign keys may protect referential integrity under
ADR-0003. They do not grant write authority and do not permit ORM traversal or
cascading business changes.

### Pricing is not a Product field

Catalog does not contain an authoritative `price` column. Pricing owns current
commercial prices and price selection.

All monetary values:

- are exact;
- include an explicit currency;
- never use binary floating-point arithmetic;
- reject arithmetic across different currencies unless an explicit conversion
  operation exists;
- use one currency consistently within an accepted order.

This ADR defines Money's semantics but does not yet select the storage and wire
representation. ADR-0007 defines exact amount representation, rounding,
currency scale, price lists, sale pricing, discount interaction, and quote
contracts.

The store may initially operate in one configured currency. That operational
choice does not permit currency to be omitted from persisted or external
commercial facts.

### Inventory is not a Product quantity

Catalog does not own `stock`, `quantityOnHand`, or reservation state.
Inventory references a Variant ID and decides whether that Variant is tracked.

Inventory owns:

- authoritative stock state;
- adjustments and reasons;
- reservations and expiration;
- releases;
- consumption/commitment;
- concurrency controls;
- location-aware stock only when a real multi-location requirement exists.

A Product or Variant being active does not mean it is in stock. A Variant being
untracked does not mean it has a fake infinite quantity. It means Inventory is
not currently an eligibility constraint for that Variant.

ADR-0008 defines the initial stock model, reservation lifecycle, locking,
oversell policy, adjustment ledger, and concurrency tests.

### Availability is a composed decision

There is no universal mutable `isAvailable` field shared across modules.

Purchase eligibility may depend on:

- Catalog publication and Variant status;
- a valid Pricing result;
- Inventory policy and reservable quantity;
- promotion or customer eligibility;
- shipping, digital-delivery, or service constraints;
- store configuration and legal restrictions.

Storefront projections may present a derived availability label. Checkout must
re-evaluate authoritative module state before accepting the order. A cached or
statically rendered product page never guarantees price, stock, or checkout
eligibility.

### Cart is mutable intent

A cart line contains, at minimum:

- a Variant ID;
- a positive quantity;
- selected customer-provided configuration that Catalog explicitly permits;
- safe display hints only where useful.

Cart data does not become authoritative for:

- current Product or Variant status;
- price;
- discount;
- tax;
- stock;
- fulfillment eligibility.

Cart responses may include calculated display information, but checkout
revalidates it. Adding an item to a cart does not reserve stock unless a focused
decision explicitly introduces cart reservations.

Initial quantities are positive integers. Fractional commerce requires a later
exact Quantity decision covering units, scale, pricing, inventory, and order
snapshots; it is not simulated with floating-point quantities.

Cart ownership may later support authenticated users and anonymous sessions.
The first Cart ADR decides merge, expiry, ownership, and concurrency rules.
Guest checkout is not implicitly enabled by this ADR.

### Checkout is an orchestrated use case

Checkout is a named application workflow, not a module that may write every
commerce table.

A checkout implementation coordinates owner contracts to:

1. validate cart/request input;
2. load authoritative Catalog facts;
3. obtain exact Pricing, Promotion, and Tax results that apply;
4. verify fulfillment constraints;
5. reserve tracked Inventory;
6. create an Order with complete snapshots and totals;
7. initiate payment according to the accepted payment/order workflow.

Each capability performs its own reads and writes. The orchestrator does not
access another module's repository.

Where Inventory reservation and Order creation must be atomic in the shared
PostgreSQL database, checkout uses ADR-0003's opaque transaction mechanism and
transaction-aware Module Public Contracts. A failed transaction rolls back all
participating database writes.

External payment, tax-provider, email, shipping, or digital-delivery network
calls are not held inside the PostgreSQL transaction. Such interactions require
idempotency and explicit retry/recovery behavior. An outbox or durable worker is
introduced only when a designed workflow demonstrates the need.

Order submission accepts an idempotency key before it becomes externally
available. Retrying the same accepted submission must not create a second
order, duplicate inventory commitment, or duplicate payment attempt.

The detailed order/payment sequence is decided with ADR-0006 and the later
Payments decision. This ADR does not require payment-before-order or
order-before-payment as the universal policy.

### Orders preserve historical facts

An Order is not a live view over Catalog, Pricing, Identity, or Customer tables.

At acceptance, Orders captures the facts required to explain the purchase,
including as applicable:

- Product and Variant IDs for traceability;
- product/variant title and merchant identifier snapshots;
- quantity;
- exact unit and extended amounts;
- currency;
- discounts and their attribution;
- tax components;
- shipping or service charges;
- buyer contact and address snapshots required for the transaction;
- fulfillment classification and selected delivery facts;
- totals and rounding results;
- terms or policy versions when legally required.

Changing or archiving a Product, changing a price, adjusting inventory, changing
a user's email, or deleting a current address must not rewrite historical order
facts.

Historical snapshots are owned by Orders. They are not copied Catalog entities,
and they are not used to mutate Catalog. Snapshot fields are immutable after
acceptance except through an explicit correction/audit workflow defined by
ADR-0006.

Order records containing personal information require deliberate retention,
access, export, and redaction policies. Identity deletion does not cascade-delete
commercial history. A later privacy decision defines legally required
anonymization without falsifying financial or operational records.

### Order, payment, and fulfillment state are separate dimensions

The platform does not use one overloaded status to represent every aspect of an
order.

At minimum, the domain distinguishes:

- order lifecycle;
- payment lifecycle;
- fulfillment lifecycle.

For example, an order may be accepted, partially paid, and partially fulfilled
without inventing one ambiguous combined status. Payments is authoritative for
payment attempts and provider outcomes. Fulfillment is authoritative for
shipment, digital delivery, or service execution. Orders owns the historical
purchase lifecycle and may retain explicit summaries or references needed for
customer service.

State changes occur through named transitions with invariants. They are not
arbitrary status assignments. Cancellation, refund, inventory release, and
fulfillment reversal are coordinated workflows; one module does not update all
participating tables.

ADR-0006 defines the initial Order state machine, snapshots, numbering,
idempotency, cancellation, and the exact relationship to payment and
fulfillment.

### Customer identity and order history are distinct

An authenticated buyer may be referenced by Identity user ID. Orders also
snapshot the contact and delivery facts required for the accepted transaction.

Identity remains authoritative for login and current account status. Orders
remains authoritative for historical buyer/order facts. A future Customers
capability may own reusable commerce profiles, addresses, preferences, and
segments; these do not belong in Identity by default.

Customer-facing order access is ownership-based under the existing
authorization contract. Queries scope by both Order ID and authenticated user
ID where applicable. Staff access uses explicit permissions.

### Storefront and administrative read models

Efficient product lists and dashboards may use read-only projections composed
from multiple capabilities.

Examples include:

- Catalog title/media plus current price and inventory availability;
- Order snapshot plus payment and fulfillment summaries;
- customer-service order lists with safe buyer contact information.

These projections:

- do not become sources of truth;
- do not mutate capability-owned tables;
- do not replace checkout validation;
- do not expose ORM entities;
- document freshness if materialized;
- follow ADR-0003's read-model and authorization rules.

At the expected scale, direct PostgreSQL projection queries are acceptable.
CQRS, event-fed projections, a separate search cluster, and a reporting
database are not introduced without demonstrated need.

### Deletion and archival

Mutable commerce definitions are normally archived rather than hard-deleted
after they participate in transactions.

- Catalog decides Product and Variant archival rules.
- Pricing decides price-record lifecycle.
- Inventory retains the adjustment history required for accountability.
- Orders, payment attempts, refunds, and fulfillment records use controlled
  retention and correction policies.

No cross-module cascade deletes commercial history. Data-erasure requirements
use an explicit privacy workflow rather than ad hoc cascades.

### Time and schedules

Commerce instants are stored as UTC timestamps.

- reservation expiration, order acceptance, payment events, and fulfillment
  events are instants;
- merchant time zones use explicit IANA identifiers;
- service dates, appointment times, store hours, and delivery windows retain
  their local/calendar semantics and are not reduced blindly to UTC without the
  associated zone or meaning.

Detailed scheduling belongs to the future Service Fulfillment capability.

## Commerce dependency rules

ADR-0003 remains authoritative. The commerce-specific dependency intent is:

```text
Storefront/Admin read model
        ├── Catalog
        ├── Pricing
        └── Inventory

Checkout orchestrator
        ├── Catalog
        ├── Pricing
        ├── Inventory
        ├── Orders
        └── Payments/Fulfillment when introduced
```

Catalog does not depend on Pricing or Inventory merely because a storefront
shows all three. Orders does not import Catalog entities. Inventory and Pricing
reference Variant IDs but do not mutate Catalog.

Payments and Fulfillment may reference Order and order-line IDs. Their workflow
dependencies must be oriented to avoid cycles. When two capabilities would
otherwise call each other, a named application orchestrator or a later factual
event contract owns the coordination; private services are not mutually
imported.

## Initial implementation sequence

The focused ADRs are reviewed before their modules are implemented:

1. ADR-0005 — Catalog and Products
2. ADR-0006 — Orders
3. ADR-0007 — Pricing
4. ADR-0008 — Inventory

Implementation order may differ when a vertical slice demonstrates a better
dependency order, but no module invents another module's authoritative data to
avoid waiting for its contract.

The first executable commerce slice should be narrow and complete enough to
prove:

- one Product with one or more Variants;
- an exact current price;
- optional stock tracking;
- a read model combining those facts;
- an accepted Order containing immutable line snapshots;
- idempotent submission;
- no reliance on live Catalog/Pricing data to explain that Order.

Cart, payment-provider, shipment, digital-delivery, service-scheduling, tax, and
promotion complexity are added only after their focused contracts are accepted.

## Explicit non-goals

This decision does not introduce:

- a multi-tenant or marketplace commerce model;
- merchant/store/tenant columns;
- a universal `Sellable` or `CommerceObject` table;
- Product subclasses for every fulfillment kind;
- one giant Commerce module;
- price or stock columns owned by Catalog;
- one combined order/payment/fulfillment status;
- live Catalog joins as historical order truth;
- guest checkout;
- subscriptions, bundles, gift cards, rentals, auctions, or marketplaces;
- multi-location inventory;
- multi-currency conversion;
- fractional quantities;
- tax-provider or payment-provider selection;
- a promotion engine;
- CQRS, event sourcing, an event bus, or an outbox;
- distributed transactions;
- a CMS or database-driven storefront page builder;
- implementation of any commerce module merely by accepting this ADR.

These capabilities may be added through focused decisions when requirements
justify them.

## Alternatives considered

### One Commerce module

Rejected because Catalog, Pricing, Inventory, Orders, Payments, and Fulfillment
have different state, invariants, rates of change, and operational workflows.
A single module would make ownership and transactions implicit.

### Product owns price and stock

Rejected because price selection and inventory reservation are independent
business capabilities. Embedding both on Product prevents price lists,
reservations, adjustment history, and non-stock-tracked offerings from evolving
cleanly.

### Cart references Product for simple items and Variant for configurable items

Rejected because it creates two line models throughout pricing, inventory,
orders, and fulfillment. Every purchasable Product has a Variant.

### Universal Sellable abstraction

Rejected because products, subscriptions, gift cards, rentals, and services do
not yet share enough implemented behavior to justify one persistent universal
base model.

### Order reads current Product and price data

Rejected because historical orders would change meaning when merchandising,
price, tax, or customer data changes.

### One order status

Rejected because order, payment, and fulfillment progress independently and may
be partial.

### Reserve inventory when adding to cart

Rejected as a default because abandoned carts would hold stock and introduce
expiry/recovery behavior before checkout requirements are defined.

### Event-driven communication from the beginning

Rejected because direct in-process calls and explicit shared-database
transactions are simpler and more observable at the current scale. Events are
introduced only with defined delivery and failure semantics.

## Consequences

### Positive

- Product, price, stock, and history have clear owners.
- Simple and configurable products share one Variant-based line model.
- Physical, digital, and service offerings can share Catalog without forcing
  the same inventory or fulfillment behavior.
- Historical orders remain explainable after current data changes.
- Checkout can be atomic where database invariants require it without treating
  external provider calls as transactional.
- Storefront read performance can use projections without weakening authority.
- Future focused ADRs have explicit boundaries and acceptance constraints.

### Negative

- A product page composes data from multiple capabilities.
- Checkout requires explicit orchestration and idempotency.
- Order snapshots intentionally duplicate selected catalog, buyer, price, and
  tax facts.
- Cross-capability workflows require carefully designed transactions and
  failure recovery.
- Supporting additional commerce models still requires new schemas and focused
  decisions; the model does not pretend otherwise.

## Architectural invariants

An implementation complies with this decision only if:

1. Catalog owns Products, Variants, and merchandising state.
2. Every purchasable Product has at least one Variant.
3. Cart, Pricing, Inventory, and Orders reference the purchasable Variant ID.
4. Catalog does not own authoritative price, stock, reservation, payment,
   order, or fulfillment state.
5. Pricing owns current exact price selection.
6. Every monetary fact includes a currency and uses no binary floating-point
   arithmetic.
7. Inventory alone mutates stock, reservation, release, and adjustment state.
8. Fulfillment classification does not automatically imply inventory tracking.
9. No shared mutable `isAvailable` field replaces composed eligibility.
10. A cart is mutable intent and does not guarantee price, stock, tax, or
    checkout eligibility.
11. Checkout revalidates authoritative state before order acceptance.
12. A module performs only its own writes, including inside cross-module
    transactions.
13. External network calls are not held inside PostgreSQL transactions.
14. Order submission is idempotent before public use.
15. Orders preserve immutable commercial and buyer snapshots required to
    explain the accepted purchase.
16. Current Catalog, Pricing, Identity, Customer, or address changes do not
    rewrite historical Order facts.
17. Order, payment, and fulfillment state are modeled as separate dimensions.
18. Cross-module references are scalar identifiers and do not authorize ORM
    traversal or cascading business changes.
19. Read models are non-authoritative and cannot replace checkout validation.
20. Commercial history is not deleted through cross-module cascades.
21. Commerce instants use UTC; local service/calendar meaning retains its zone
    and semantics.
22. No future commerce capability is created until it has real behavior,
    ownership, and a focused contract.

## Acceptance criteria for focused ADRs

ADR-0005 through ADR-0008 must collectively define and test:

- Product and Variant lifecycle and publication;
- exact Money representation and rounding;
- price selection and quote behavior;
- stock tracking and reservation concurrency;
- Order identity, numbering, snapshots, totals, and state transitions;
- idempotent order submission;
- atomic Order/Inventory behavior where required;
- explicit payment and fulfillment boundaries;
- read models that do not become sources of truth;
- archival and historical retention behavior.

An implementation plan is not approved until the focused ADR relevant to that
module is accepted.

## Related decisions

- ADR-0001 defines platform philosophy, independent store deployments, exact
  commerce facts, and modular-monolith constraints.
- ADR-0002 defines the platform repository and independent storefront
  boundaries.
- ADR-0003 defines backend module authority, Module Public Contracts,
  transactions, projections, and dependency enforcement.
- ADR-0005 defines Catalog, Products, and Variants.
- ADR-0006 defines Orders and historical purchase state.
- ADR-0007 defines Money representation and Pricing.
- ADR-0008 defines Inventory and reservations.
- ADR-0009 defines authentication and session behavior.
- ADR-0010 and ADR-0011 define Admin and storefront consumers.
