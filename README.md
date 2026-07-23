# Better Commerce

Better Commerce is a TypeScript platform monorepo for independently deployed
commerce stores. The implemented application is currently the NestJS API in
`apps/api`, with PostgreSQL-backed identities and Redis-backed opaque sessions.
Social providers and OTP are intentionally outside the current release.

## Repository layout

```text
apps/
  api/                  NestJS modular-monolith API
docs/                   Architecture, contracts, and runbooks
docker-compose.yml      Local PostgreSQL and Redis
package.json            Root orchestration commands
pnpm-workspace.yaml     Workspace definition
turbo.json              Build and verification orchestration
```

Run ordinary development and CI commands from the repository root. Root
commands orchestrate every applicable workspace package through pnpm and
Turborepo. To run one API script directly, use
`pnpm --filter @better-commerce/api <script>`.

## Prerequisites

- Node.js 22.17.0 or newer;
- pnpm 11.9.0, matching the pinned `packageManager`;
- Docker with Docker Compose v2 for PostgreSQL, Redis, and stateful end-to-end
  tests.

On Windows, use `pnpm.cmd` if PowerShell's execution policy blocks `pnpm.ps1`.
Do not weaken the machine execution policy for this repository.

## First-time setup

From the repository root:

```bash
pnpm install --frozen-lockfile
```

Copy `.env.example` to the ignored root `.env` file:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux, use `cp .env.example .env`. The checked-in values are only
for local development. Never copy them to production; production credentials
and independent random secrets belong in the deployment secret manager.

Start the local dependencies, then the API:

```bash
pnpm db:up
pnpm start:dev
```

The API listens at `http://localhost:3000` with the example configuration.
Development OpenAPI is available at `http://localhost:3000/docs`, liveness at
`/health/live`, and dependency readiness at `/health/ready`.

## Root command contract

| Command | Purpose |
| --- | --- |
| `pnpm start:dev` | Run the API in watch mode |
| `pnpm build` | Build every applicable workspace package |
| `pnpm typecheck` | Type-check every applicable workspace package |
| `pnpm lint` | Run the non-mutating lint gate |
| `pnpm test -- --runInBand` | Run unit tests |
| `pnpm test:e2e -- --runInBand` | Run end-to-end tests; PostgreSQL and Redis must be running |
| `pnpm db:up` | Start local PostgreSQL and Redis |
| `pnpm db:down` | Stop local containers without deleting data |
| `pnpm db:logs` | Follow PostgreSQL logs |
| `pnpm db:reset` | Destroy and recreate local PostgreSQL and Redis volumes |
| `pnpm staff:bootstrap-owner -- owner@example.test` | Promote one existing account to the initial owner |

For an API-only command, filter the package explicitly. For example:

```bash
pnpm --filter @better-commerce/api test --runInBand
pnpm --filter @better-commerce/api test:watch
```

`pnpm format` and `pnpm lint:fix` modify files. The regular `lint` command does
not.

## Disposable development data

The current pre-launch development workflow intentionally has no migration
files. TypeORM synchronizes entities only in development and test. After an
entity change, reset PostgreSQL and Redis and restart the API:

```bash
pnpm db:reset
pnpm start:dev
```

`db:reset` permanently deletes both local Docker volumes, including development
users, audit data, and every Redis session. It is forbidden in production.

There is no general seed command yet. Development/test startup idempotently
synchronizes the built-in authorization permission and role catalogue. Public
registration creates a user; bootstrap the first owner separately after that
account exists. Production remains blocked until reviewed migrations and a
stable production seeding process are restored.

The stateful end-to-end suites use a dedicated `better_commerce_test` database
and isolated Redis prefixes. They do not reset the development volumes.

## Authentication behavior

- Public registration accepts email and password and creates an unverified account.
- PostgreSQL stores the identity and Argon2id credential hash.
- Redis is authoritative for sessions; the application does not fall back to memory sessions.
- Sessions have a 7-day idle lifetime and a 30-day absolute lifetime.
- Logout removes the current session. Logout-all and password changes invalidate prior sessions.
- Production public registration is blocked until email verification is required.

The versioned application API is under `/api/v1`. Authentication endpoints are
under `/api/v1/auth`: `register`, `login`, `me`, `logout`, `logout-all`,
`password/change`, and the disabled-by-default email verification request/confirm
flow.

Browser clients must include cookies. Before every state-changing request, call
`GET /api/v1/auth/csrf`, then send its `csrfToken` value in the
`x-csrf-token` header. Registration, login, and password changes rotate the
session identifier, so fetch a fresh CSRF token after any of them succeeds.

In development and test, interactive OpenAPI documentation is available at
`/docs` and the machine-readable document at `/docs/openapi.json`. Both routes
are absent in production.

## Staff authorization

Administrative endpoints are under `/api/v1/admin`. Customer access uses
resource ownership; staff access uses database-authoritative permissions grouped
into the built-in owner, administrator, catalog manager, order manager, support,
marketing, and analyst roles. Permission changes increment the affected user's
authentication version and invalidate every existing session.

Create the first owner only after that person has registered an ordinary account:

```bash
pnpm staff:bootstrap-owner -- owner@example.test
```

The command accepts exactly one existing email and never accepts or prints a
password. Administrators may create staff and manage non-owner roles. Only an
owner can add, remove, suspend, or reactivate another owner. The complete rules
are in [the authorization contract](docs/authorization-contract.md).

## Health probes

- `GET /health/live` checks that the process can serve HTTP. Dependency outages must not fail liveness.
- `GET /health/ready` checks PostgreSQL and Redis. It returns HTTP 503 if either authoritative store is unavailable.

Use liveness only to restart a stuck process. Use readiness to decide whether the instance receives traffic.

## Production operations

See [the operations runbook](docs/operations.md) for the development reset workflow, session-secret rotation, Redis incidents, and forced logout. See [the release security checklist](docs/release-security-checklist.md) before enabling production registration.
