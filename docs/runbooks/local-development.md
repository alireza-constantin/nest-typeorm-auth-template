# Authentication and local data operations runbook

## Disposable development database

Run database lifecycle commands from the platform repository root. The root
`docker-compose.yml` starts only PostgreSQL and Redis; the API continues to run
through pnpm on the host.

Start or stop dependencies without deleting their volumes:

```bash
pnpm db:up
pnpm db:down
```

The current pre-launch workflow intentionally has no migration files. TypeORM
schema synchronization is enabled only when `NODE_ENV` is `development` or
`test`. After an entity change, confirm that this is the disposable local
Compose project, then reset all local database and session state:

```bash
docker compose config --services
pnpm db:reset
pnpm start:dev
```

The service list must be `postgres` and `redis`. `db:reset` runs Compose with
`down --volumes --remove-orphans` and then starts both services again. It
permanently deletes the local PostgreSQL and Redis volumes, including users,
authorization audit data, and every session.

There is currently no general seed command. Development/test startup
idempotently synchronizes the built-in authorization permission and role
catalogue. Public registration creates ordinary development users. If the reset
removed the initial owner, register that user again and bootstrap the existing
account:

```bash
pnpm staff:bootstrap-owner -- owner@example.test
```

The bootstrap command accepts exactly one existing normalized email, never a
password, and invalidates that user's existing sessions when it changes their
authorization.

Stateful end-to-end tests require the local dependencies:

```bash
pnpm db:up
pnpm test:e2e -- --runInBand
```

Those suites create/use the dedicated `better_commerce_test` database and
isolated Redis prefixes. They truncate only test data; they do not run
`db:reset`.

This workflow must never be used for production. `synchronize` is disabled in
production, and production deployment remains blocked until reviewed,
backward-compatible migrations and their rollback procedure are restored.

## Session signing-secret rotation

`SESSION_SECRETS` is an ordered comma-separated list. The first value signs new cookies; later values verify cookies issued during a previous deployment. Secrets must be independent random values of at least 32 characters and must come from the production secret manager.

1. Generate a new secret with the approved cryptographic secret generator.
2. Deploy `SESSION_SECRETS=new,current` to every instance.
3. Confirm login and existing-session canaries succeed across multiple instances.
4. Keep the old secret for at least the maximum absolute session lifetime (30 days), unless the rotation is responding to compromise.
5. Deploy `SESSION_SECRETS=new` and delete the retired secret from the secret manager after the overlap window.

For a compromised secret, skip the overlap: deploy only the new secret and follow the forced-logout procedure. This intentionally logs out every customer.

## Redis outage

Redis is the authoritative session store. During an outage, authenticated traffic must fail closed; the service must not create process-local sessions.

1. Confirm `/health/live` is 200 and `/health/ready` is 503 with Redis reported `down`.
2. Remove affected instances from traffic through readiness, not liveness restarts.
3. Check Redis availability, ACL/TLS errors, memory pressure, and `maxmemory-policy`. Session Redis should use `noeviction`.
4. Restore Redis or fail over through the managed Redis control plane.
5. Confirm Redis `PING`, then readiness, login, and cross-instance session canaries.

If Redis data was lost, existing sessions are invalid and customers must log in again. Do not restore stale session keys from an untrusted backup. Alert on sustained readiness failures, Redis connection failures, and unexpected drops in active sessions; do not log cookie values or Redis session keys.

## Forced logout

For one account, use the audited administrative path that atomically increments the user's `auth_version`. The next request made with any older session will fail authentication. Do not directly edit individual Redis keys as the primary revocation mechanism.

For every account after a system-wide session incident:

1. Rotate the cookie-signing secret without retaining the old value.
2. Change the Redis session key prefix, or delete only the dedicated application session-key namespace after verifying the target Redis database and prefix.
3. Deploy all instances with the same new secret and prefix.
4. Confirm old cookies fail and new login sessions work across instances.

Never use a broad Redis flush when Redis is shared with another workload.

## Minimum telemetry

Record structured, redacted events for login success/failure, registration, logout-all, password change, and email-verification lifecycle. Include a request correlation ID and stable user ID when known. Never record passwords, password hashes, verification tokens, session IDs, cookies, authorization headers, or Redis URLs with credentials.
