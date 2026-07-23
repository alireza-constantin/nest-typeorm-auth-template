/**
 * Temporary ADR-0003 persistence bridge.
 *
 * TypeORM still needs Identity's entity metadata while Authorization retains
 * its pre-migration business writes. Agent 3 must remove every use of this
 * bridge from Authorization application code by replacing it with the Identity
 * Module Public Contract and must retain metadata only where a foreign key
 * requires it. This file is intentionally not exported from the data barrel.
 */
export {
  User,
  UserStatus,
} from '../../modules/identity/persistence/user.entity';
