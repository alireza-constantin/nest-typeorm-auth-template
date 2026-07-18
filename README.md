# Better Commerce API

NestJS commerce API with local email/password authentication, PostgreSQL-backed identities, and Redis-backed opaque sessions. Social providers and OTP are intentionally outside the current release.

## Local development

Requirements: Node.js, npm, and Docker Compose.

```bash
npm install
docker compose up -d
npm run start:dev
```

Copy `.env.example` to `.env` before starting. Values in `.env.example` are development-only; production secrets belong in a secret manager.

The current development database is disposable. TypeORM synchronizes entities
only in development/test. After an entity change, reset PostgreSQL and Redis and
start the API so the schema is recreated:

```bash
npm run db:reset
npm run start:dev
```

There is no seed data yet; public registration creates development users. This
reset workflow is forbidden for production. Production migrations must be
restored before launch.

Run verification with:

```bash
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

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

## Health probes

- `GET /health/live` checks that the process can serve HTTP. Dependency outages must not fail liveness.
- `GET /health/ready` checks PostgreSQL and Redis. It returns HTTP 503 if either authoritative store is unavailable.

Use liveness only to restart a stuck process. Use readiness to decide whether the instance receives traffic.

## Production operations

See [the operations runbook](docs/operations.md) for the development reset workflow, session-secret rotation, Redis incidents, and forced logout. See [the release security checklist](docs/release-security-checklist.md) before enabling production registration.
