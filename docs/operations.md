# Authentication operations runbook

## Disposable development database

The current pre-launch workflow intentionally has no migration files. TypeORM
schema synchronization is enabled only when `NODE_ENV` is `development` or
`test`. After an entity change, reset all local database and session state:

```bash
npm run db:reset
npm run start:dev
```

`db:reset` deletes both Docker volumes, including every local user and Redis
session. No seed records are currently required because public registration is
enabled.

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
