# Authorization Contract

Status: approved architecture contract  
Scope: single-merchant Better Commerce deployment  
Version: 1.0  
Approved: 2026-07-20

## 1. Purpose

This contract defines authorization for one independently deployed e-commerce website. Each deployment owns its PostgreSQL database, Redis namespace, customers, staff, roles, and initial owner.

This version does not support multiple merchants, stores, organizations, tenants, or cross-deployment identities. No authorization table or request carries a merchant, store, organization, or tenant identifier.

Authentication answers **who the user is**. Authorization answers **what that authenticated user may do to this specific resource in its current state**.

## 2. Design principles

1. Authorization is default-deny.
2. Customer access is primarily ownership-based, not role-based.
3. Staff access uses explicit permissions grouped into roles.
4. Permission checks use stable permission keys, never role-name comparisons.
5. Administrative routes require an active staff profile and explicit permissions.
6. Resource ownership and business-state invariants are enforced in application services and database queries, not only in controllers or guards.
7. Permission data is authoritative in PostgreSQL on every administrative request in this version. Permissions are not copied into the Redis session and are not cached.
8. Privilege changes invalidate existing sessions immediately through the existing `User.authVersion` mechanism.
9. Security-relevant administrative mutations and their audit event are committed in the same database transaction.
10. Authorization failures fail closed.

## 3. Identity categories

### 3.1 Customer

Every active `User` may act as a customer. A customer does not require a `customer` role.

Customer access is granted by resource policies such as:

- the address belongs to the authenticated user;
- the cart belongs to the authenticated user or anonymous session;
- the order belongs to the authenticated user;
- the review was created by the authenticated user;
- the requested operation is allowed for the resource's current state.

Customer-facing queries must scope owned-resource retrieval by both the resource identifier and authenticated user identifier. Loading by resource identifier and checking ownership afterward is not the preferred pattern.

### 3.2 Staff

A user is staff only while an associated `StaffProfile` exists with status `active` and at least one active role assignment exists.

A user may simultaneously use customer functionality and staff functionality. Suspending the staff profile removes administrative access without disabling the underlying customer account.

### 3.3 Owner

`owner` is the highest built-in role. Ownership is an authorization role, not a separate authentication method.

The system must always retain at least one active owner. Operations that could leave zero active owners are rejected atomically.

## 4. Data model

### 4.1 `staff_profiles`

| Field | Contract |
| --- | --- |
| `user_id` | UUID primary key and foreign key to `users.id`; delete restricted |
| `status` | `active` or `suspended` |
| `created_by_user_id` | Nullable UUID; null only for system bootstrap |
| `created_at` | Timestamp with time zone |
| `updated_at` | Timestamp with time zone |

There is at most one staff profile per user.

### 4.2 `permissions`

| Field | Contract |
| --- | --- |
| `key` | Stable lowercase permission key; primary key |
| `description` | Human-readable description |
| `created_at` | Timestamp with time zone |

Permission keys are defined in code and synchronized idempotently into the development database. Removed or renamed permission keys require an explicit compatibility decision; they are not silently deleted.

### 4.3 `roles`

| Field | Contract |
| --- | --- |
| `id` | UUID primary key |
| `key` | Stable lowercase unique key |
| `name` | Display name |
| `description` | Human-readable description |
| `system_managed` | Boolean |
| `created_at` | Timestamp with time zone |
| `updated_at` | Timestamp with time zone |

Version 1 exposes only system-managed roles. The schema may support custom roles later, but no custom-role management API is part of this contract.

### 4.4 `role_permissions`

Composite primary key: `(role_id, permission_key)`.

Every permission granted to a role is explicit. There is no wildcard permission and no automatic "all future permissions" behavior, including for the owner role. When a new permission is introduced, the seed contract must explicitly decide which roles receive it.

### 4.5 `staff_role_assignments`

| Field | Contract |
| --- | --- |
| `staff_user_id` | UUID foreign key to `staff_profiles.user_id` |
| `role_id` | UUID foreign key to `roles.id` |
| `assigned_by_user_id` | Nullable UUID; null only for bootstrap |
| `assigned_at` | Timestamp with time zone |

Composite primary key: `(staff_user_id, role_id)`. A staff user may have multiple roles. Effective permissions are the union of the assigned roles' permissions. Version 1 has no explicit deny permission.

### 4.6 `authorization_audit_events`

| Field | Contract |
| --- | --- |
| `id` | UUID primary key |
| `actor_user_id` | Nullable UUID; null represents bootstrap/system |
| `action` | Stable audit action key |
| `target_type` | Stable target type |
| `target_id` | String identifier |
| `request_id` | Request correlation ID; required for HTTP actions |
| `metadata` | JSON object restricted to an action-specific allowlist |
| `created_at` | Timestamp with time zone |

Application code provides insert and read operations only. It provides no update or delete operation. Audit metadata must never contain passwords, password hashes, cookies, session identifiers, CSRF tokens, verification tokens, authorization headers, Redis URLs, database URLs, or complete request bodies.

Default retention target is at least 365 days and must be configurable before production launch.

## 5. Permission catalogue

Permission keys are constants and follow `<domain>.<resource>.<action>` where practical.

### Authorization foundation

- `admin.access`
- `staff.read`
- `staff.create`
- `staff.assign_roles`
- `staff.assign_owner`
- `staff.suspend`
- `roles.read`
- `audit.read`

### Catalog and inventory

- `catalog.products.read`
- `catalog.products.write`
- `catalog.products.publish`
- `catalog.products.archive`
- `catalog.categories.read`
- `catalog.categories.write`
- `catalog.pricing.write`
- `inventory.read`
- `inventory.adjust`

### Orders and customers

- `orders.read`
- `orders.notes.write`
- `orders.fulfill`
- `orders.cancel`
- `orders.refund`
- `customers.read`
- `customers.update`

### Marketing and reporting

- `promotions.read`
- `promotions.write`
- `reports.read`

Domain permissions may be seeded before their domain endpoints exist. They grant no behavior until an endpoint and service policy explicitly consume them.

## 6. Built-in role matrix

Every role assignment below is seeded explicitly. There is no runtime wildcard.

| Role | Exact permissions |
| --- | --- |
| `owner` | Every permission currently listed in the catalogue; the seed still writes each relationship explicitly |
| `administrator` | `admin.access`, `staff.read`, `staff.create`, `staff.assign_roles`, `staff.suspend`, `roles.read`, `audit.read`, every catalog/inventory permission, every order/customer permission, every promotion/reporting permission; explicitly excludes `staff.assign_owner` |
| `catalog_manager` | `admin.access`, every catalog permission, `inventory.read`, `inventory.adjust` |
| `order_manager` | `admin.access`, every order permission, `customers.read`, `inventory.read` |
| `support_agent` | `admin.access`, `orders.read`, `orders.notes.write`, `customers.read` |
| `marketing_manager` | `admin.access`, `promotions.read`, `promotions.write`, `catalog.products.read`, `catalog.categories.read`, `reports.read` |
| `analyst` | `admin.access`, `catalog.products.read`, `catalog.categories.read`, `inventory.read`, `orders.read`, `customers.read`, `promotions.read`, `reports.read` |

`staff.assign_owner` is owner-only in version 1. Administrators may create staff and assign, replace, or remove any non-owner role, subject to the anti-escalation rules in this contract. Assigning or removing the `owner` role requires `staff.assign_owner` regardless of future role configuration.

## 7. Administrative HTTP contract

All administrative endpoints live under `/api/v1/admin`.

The first implementation includes:

| Method and route | Required permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/admin/me` | `admin.access` | Return current staff profile, roles, and effective permissions |
| `GET /api/v1/admin/staff` | `staff.read` | List staff profiles without credential or session data |
| `POST /api/v1/admin/staff` | `staff.create` and `staff.assign_roles` | Promote an existing user to staff and assign non-owner roles; assigning owner additionally requires `staff.assign_owner` |
| `PUT /api/v1/admin/staff/:userId/roles` | `staff.assign_roles` | Replace role assignments atomically; adding or removing owner additionally requires `staff.assign_owner` |
| `POST /api/v1/admin/staff/:userId/suspend` | `staff.suspend` | Suspend non-owner administrative access; targeting an owner additionally requires `staff.assign_owner` |
| `POST /api/v1/admin/staff/:userId/activate` | `staff.suspend` | Restore non-owner administrative access; targeting an owner additionally requires `staff.assign_owner` |
| `GET /api/v1/admin/roles` | `roles.read` | Return built-in roles and their permissions |
| `GET /api/v1/admin/audit-events` | `audit.read` | Paginated, filterable audit event list |

All state-changing routes retain the existing trusted-origin and CSRF requirements.

Administrative list endpoints require bounded cursor pagination. They must not return password credentials, password hashes, session identifiers, verification tokens, normalized email unless necessary, or internal security configuration.

## 8. Enforcement pipeline

For an administrative request, enforcement order is:

1. Existing session authentication validates the Redis session, absolute expiration, active `User`, email-verification policy, and `authVersion`.
2. Administrative authorization loads the active `StaffProfile`, assigned roles, and permissions from PostgreSQL.
3. `admin.access` is required for every administrative request, then the endpoint's declared permissions are checked. All declared permissions are required unless the declaration explicitly selects `any` semantics.
4. The application service enforces target-specific invariants, actor authority, ownership, and resource state.
5. The mutation and its audit event commit in one PostgreSQL transaction.
6. Privilege-changing operations increment the affected user's `authVersion` before the transaction commits.

No controller checks a role name directly. No controller trusts role or permission information supplied by a client.

Administrative controllers are marked as administrative and every handler declares permissions. An automated metadata test fails if an administrative handler lacks a permission declaration.

## 9. Authorization decisions and HTTP semantics

- Missing or invalid authentication: `401 Unauthorized`.
- Authenticated active customer without an active staff profile: `403 Forbidden` for administrative routes.
- Active staff lacking a required permission: `403 Forbidden`.
- Customer-owned resource that does not exist or belongs to another customer: normally `404 Not Found` to avoid existence disclosure.
- Staff target that does not exist, after the actor has permission to enumerate staff: `404 Not Found`.
- Business-state conflict or last-owner invariant violation: `409 Conflict`.
- Authorization database unavailable: `503 Service Unavailable`; never allow based on stale or absent authorization data.

Problem responses follow the existing problem-details response contract and include the request ID. They do not reveal the actor's missing permissions unless a development-only diagnostic mode is explicitly introduced later.

## 10. Privilege-management invariants

1. There must always be at least one active staff user assigned the `owner` role.
2. Suspending, deleting, or removing the owner role from the last active owner is rejected.
3. Owner-count-changing operations acquire the same PostgreSQL transaction-scoped advisory lock before evaluating the invariant. This prevents concurrent operations from each observing another owner and leaving zero owners.
4. An actor cannot assign a role containing any permission they do not effectively possess.
5. Adding or removing the `owner` role requires `staff.assign_owner`. The administrator role never receives this permission.
6. Suspending or activating a staff profile that holds the `owner` role also requires `staff.assign_owner`.
7. Version 1 does not allow staff to mutate built-in role definitions through HTTP.
8. A staff user cannot reactivate themselves while suspended because suspended users cannot access administrative endpoints.
9. Creating, suspending, activating, or changing roles for staff increments the target user's `authVersion` in the same transaction.
10. Suspending a staff profile invalidates all of that user's current sessions. This intentionally also signs them out of customer functionality; they may log in again as a customer, but administrative access remains denied.
11. Disabling the underlying `User` continues to block all customer and staff access through the existing authentication guard.

## 11. Initial owner bootstrap

The first owner is established out of band; there is no public or authenticated HTTP endpoint for first-owner creation.

The bootstrap command:

1. accepts the normalized email of an existing user;
2. never accepts a password as a command-line argument;
3. runs only with direct deployment/operator access;
4. creates or activates the staff profile;
5. assigns the built-in owner role;
6. increments the user's `authVersion`;
7. records a system audit event;
8. is idempotent for the same existing owner;
9. refuses ambiguous email matches or a nonexistent user;
10. prints no secrets or credential material.

For development, the ordinary account registration flow may create the user before bootstrap. Before production launch, staff access must require the project's email-verification capability to be enabled and operational.

## 12. Audit action catalogue

Initial stable actions:

- `staff.created`
- `staff.activated`
- `staff.suspended`
- `staff.roles_replaced`
- `owner.bootstrapped`
- `owner.assigned`
- `owner.removed`

Future commerce modules add actions such as:

- `catalog.product_created`
- `catalog.product_updated`
- `inventory.adjusted`
- `order.status_changed`
- `order.cancelled`
- `order.refunded`
- `promotion.created`
- `promotion.updated`

Audit metadata records safe before/after identifiers or enum values where useful. Sensitive free-form bodies are not copied into audit metadata.

Denied attempts are emitted through the existing structured security logger. They are not inserted into the transactional audit table unless a later security-retention requirement explicitly adds that behavior.

## 13. Session and freshness contract

The Redis session continues to contain identity and `authVersion`, not roles or permissions.

Administrative permissions are loaded from PostgreSQL for each administrative request. This avoids stale authorization decisions and gives immediate effect after the user logs in again following a privilege change.

Every privilege-changing mutation increments the target user's `authVersion`. Existing sessions fail on their next authenticated request and are destroyed when possible. Redis failure during session destruction does not restore authorization; authentication still fails closed because the version comparison no longer matches.

Authorization caching may be considered only after measurement demonstrates a need. A future cache must have bounded TTL, explicit invalidation, versioned keys, and fail-closed behavior. It is outside version 1.

## 14. Required security events

Structured security events include:

- administrative access attempted without staff membership;
- administrative access denied for insufficient permission;
- suspended staff attempted access;
- last-owner operation rejected;
- role-assignment escalation rejected;
- bootstrap attempted for an invalid target;
- authorization dependency unavailable.

Events include request ID, safe actor ID when known, action, and safe target identifier. They exclude raw email, tokens, cookies, passwords, request bodies, and session IDs.

## 15. Acceptance criteria

Implementation is incomplete until automated tests prove:

1. A normal authenticated customer receives `403` from every administrative route.
2. Unauthenticated requests receive `401`.
3. Suspended staff lose administrative access immediately.
4. Disabled users lose all access.
5. Multiple role permissions are unioned correctly.
6. A handler requiring multiple permissions enforces its declared `all` or `any` semantics.
7. Role names are not used as substitutes for permission checks outside the authorization domain.
8. Cross-customer order/address/cart access returns `404` and does not disclose ownership.
9. A staff user cannot assign permissions they do not possess.
10. An administrator can create staff and assign, replace, or remove non-owner roles.
11. Only an actor with `staff.assign_owner` can assign or remove owner.
12. The last active owner cannot be suspended or demoted.
13. Concurrent owner-changing transactions cannot leave zero active owners.
14. Privilege changes increment `authVersion` and invalidate previously issued sessions.
15. A newly authenticated session observes the changed permissions.
16. Authorization database errors fail closed with `503`.
17. State-changing administrative endpoints enforce trusted origin and CSRF.
18. Every successful staff mutation writes exactly one matching audit event in the same transaction.
19. A rolled-back staff mutation writes no audit event.
20. Audit events and logs contain none of the prohibited sensitive fields.
21. OpenAPI documents required permissions and `401`, `403`, `404`, `409`, and `503` responses where applicable.
22. A metadata test rejects administrative handlers without permission declarations.
23. Bootstrap is idempotent and does not expose credentials.

Full-stack tests use a dedicated test database and isolated Redis prefixes. They do not reset development data or Docker volumes.

## 16. Development and production boundary

During the current disposable-schema development stage, authorization entities may use the existing development/test schema synchronization workflow. No migration is generated for each schema iteration.

Before production launch:

- schema synchronization remains disabled in production;
- a reviewed baseline migration contains the stabilized authorization schema;
- email verification is enabled and operational for staff access;
- the initial owner bootstrap procedure is documented and tested;
- audit retention and access controls are configured;
- production uses separate least-privilege database credentials where operationally practical.

## 17. Explicit non-goals

Version 1 does not include:

- multi-merchant, multi-store, organization, or tenant scoping;
- social login, passkeys, or OTP authentication;
- custom role creation or permission editing through HTTP;
- permission caching in Redis;
- per-device session management UI;
- delegated merchant administration;
- field-level authorization rules;
- a separate administrator authentication provider;
- domain endpoints for catalog, inventory, orders, refunds, or promotions.

These capabilities require separate contracts and must not be inferred from this authorization foundation.
