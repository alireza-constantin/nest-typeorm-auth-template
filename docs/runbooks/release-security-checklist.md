# Production registration security gate

Unverified public registration is allowed only for development and staging. Production must refuse to start when public registration is enabled but email verification is not required.

Before launch, all of the following must be true:

- `NODE_ENV=production`.
- `PUBLIC_REGISTRATION=true` only when `REQUIRE_EMAIL_VERIFICATION=true`.
- A transactional email provider is connected through the verification delivery interface; Gmail/social-login providers are not required.
- Verification tokens are random, stored only as hashes, single-use, expiring, rate-limited, and invalidated when the account email changes.
- Verification request responses do not reveal whether an email is registered.
- Registration, login, verification request, and verification confirmation have distributed abuse limits.
- Password reset is either fully implemented with the same token controls or clearly unavailable; support staff never set or disclose customer passwords.
- Existing pre-launch unverified accounts have an explicit transition policy: verify them, require verification on next login, or delete test-only accounts.
- Production cookie checks confirm `__Host-bc.sid`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain` attribute.
- CSRF and exact-origin checks cover every state-changing cookie-authenticated route.
- PostgreSQL and Redis use private networking, encryption in transit, least-privilege credentials, backups where required, and monitored availability.
- Production database migrations have been restored; Redis outage, signing-secret rotation, forced-logout, and rollback drills have passed in staging.

Release evidence should include successful build/unit/e2e runs, production migration output, health-probe results, cross-instance session tests, an email-delivery canary, rate-limit tests, and security-log redaction checks.
