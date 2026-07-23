/**
 * Persistence-only ADR-0003 exception.
 *
 * TypeORM requires referenced entity metadata to create Authorization's
 * deliberate PostgreSQL foreign keys during disposable-schema synchronization.
 * Authorization never exports, loads, traverses, cascades, or mutates this
 * Identity persistence type. Production migrations will eventually become the
 * authoritative representation of these constraints.
 */
export { User as IdentityUserForeignKey } from '../../identity/persistence/user.entity';
