# Better Commerce Documentation

This directory separates decisions, the current system description, behavioral
contracts, contributor practices, operational runbooks, and temporary plans.
Each layer has a different owner and update lifecycle.

## Documentation map

### Architecture Decision Records

ADRs explain why a durable architectural decision was made, the alternatives
considered, its consequences, and the invariants implementation must preserve.
Accepted ADRs are historical records. Change them only through an explicit
amendment or a superseding ADR.

- [ADR-0001 — Platform Architecture Principles](adr/0001-platform-principles.md)
- [ADR-0002 — Repository and Workspace Boundaries](adr/0002-monorepo.md)
- [ADR-0003 — Backend Module Architecture](adr/0003-backend.md)
- [ADR-0004 — Commerce Domain Model](adr/0004-commerce-model.md)
- [ADR-0005 — Catalog, Products, and Variants](adr/0005-catalog.md)

### Living architecture

Architecture documents explain how the currently implemented system fits
together. They are updated when code structure, dependency direction, runtime
flow, or deployment topology changes.

- [Backend module map](architecture/module-map.md)

### Behavioral contracts

Contracts define observable or security-sensitive behavior that implementations
and tests must preserve. A contract changes through explicit review and, where
external consumers exist, a compatibility/versioning decision.

- [Authorization contract](contracts/authorization.md)
- [Catalog contract](contracts/catalog.md)

### Contributor handbook

The handbook explains how contributors work in this repository. Handbook rules
should match executable scripts and automated checks rather than describing an
idealized process.

- [Contributor workflow](handbook/contributor-workflow.md)

### Operational runbooks

Runbooks contain commands and procedures for operating or recovering the
system. Commands must be checked whenever scripts, deployment topology, or
environment requirements change.

- [Local development and authentication operations](runbooks/local-development.md)
- [Production registration security gate](runbooks/release-security-checklist.md)

### Plans and handoffs

Plans describe bounded implementation work and may become obsolete after
completion. Mark completed plans clearly; do not treat them as architectural
authority.

- [Current continuation brief](plans/continuation.md)
- [Proposed ADR-0005 Catalog implementation plan](plans/adr-0005-implementation.md)
- [Completed ADR-0003 implementation plan](plans/adr-0003-implementation.md)

## Authority and conflicts

- An accepted ADR is authoritative for the architectural decision it owns.
- A behavioral contract is authoritative for its observable behavior.
- Living architecture must describe the implementation accurately without
  silently changing an ADR or contract.
- Handbook and runbook instructions must match repository scripts and deployed
  behavior.
- A plan cannot override an ADR or contract.

If two authoritative documents conflict, stop implementation and resolve the
conflict through an amendment, superseding decision, or contract revision.

## Current decision sequence

ADR-0001 through ADR-0005 and the Catalog behavioral contract are accepted.
The ADR-0005 implementation plan is proposed and awaiting review.

## Maintenance rules

When a change:

- alters a durable architectural decision, amend or supersede its ADR;
- changes module/runtime topology, update the living architecture;
- changes observable security or API behavior, update the relevant contract and
  tests;
- changes contributor commands, update the handbook and root README;
- changes operational commands or failure recovery, update the runbook;
- completes a plan, mark it completed and refresh the continuation brief.

Prefer links to the owning document over duplicating its rules in several
places. Embed a Mermaid diagram in the document that owns it unless the same
asset has multiple real consumers.
