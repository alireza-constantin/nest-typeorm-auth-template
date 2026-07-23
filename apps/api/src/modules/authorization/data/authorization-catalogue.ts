/**
 * Code-owned permission and role definitions for one Better Commerce
 * installation. Do not derive permissions from role names at runtime.
 */
export const PermissionKey = {
  ADMIN_ACCESS: 'admin.access',
  STAFF_READ: 'staff.read',
  STAFF_CREATE: 'staff.create',
  STAFF_ASSIGN_ROLES: 'staff.assign_roles',
  STAFF_ASSIGN_OWNER: 'staff.assign_owner',
  STAFF_SUSPEND: 'staff.suspend',
  ROLES_READ: 'roles.read',
  AUDIT_READ: 'audit.read',
  CATALOG_PRODUCTS_READ: 'catalog.products.read',
  CATALOG_PRODUCTS_WRITE: 'catalog.products.write',
  CATALOG_PRODUCTS_PUBLISH: 'catalog.products.publish',
  CATALOG_PRODUCTS_ARCHIVE: 'catalog.products.archive',
  CATALOG_CATEGORIES_READ: 'catalog.categories.read',
  CATALOG_CATEGORIES_WRITE: 'catalog.categories.write',
  CATALOG_PRICING_WRITE: 'catalog.pricing.write',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_ADJUST: 'inventory.adjust',
  ORDERS_READ: 'orders.read',
  ORDERS_NOTES_WRITE: 'orders.notes.write',
  ORDERS_FULFILL: 'orders.fulfill',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_REFUND: 'orders.refund',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_UPDATE: 'customers.update',
  PROMOTIONS_READ: 'promotions.read',
  PROMOTIONS_WRITE: 'promotions.write',
  REPORTS_READ: 'reports.read',
} as const;

export type PermissionKey = (typeof PermissionKey)[keyof typeof PermissionKey];

export interface PermissionDefinition {
  readonly key: PermissionKey;
  readonly description: string;
}

export const PERMISSION_CATALOGUE: readonly PermissionDefinition[] =
  Object.freeze([
    {
      key: PermissionKey.ADMIN_ACCESS,
      description: 'Access administrative APIs.',
    },
    { key: PermissionKey.STAFF_READ, description: 'View staff profiles.' },
    { key: PermissionKey.STAFF_CREATE, description: 'Create staff profiles.' },
    {
      key: PermissionKey.STAFF_ASSIGN_ROLES,
      description: 'Assign non-owner staff roles.',
    },
    {
      key: PermissionKey.STAFF_ASSIGN_OWNER,
      description: 'Assign or remove the owner role.',
    },
    {
      key: PermissionKey.STAFF_SUSPEND,
      description: 'Suspend or activate staff profiles.',
    },
    {
      key: PermissionKey.ROLES_READ,
      description: 'View built-in roles and permissions.',
    },
    {
      key: PermissionKey.AUDIT_READ,
      description: 'View authorization audit events.',
    },
    {
      key: PermissionKey.CATALOG_PRODUCTS_READ,
      description: 'View catalog products.',
    },
    {
      key: PermissionKey.CATALOG_PRODUCTS_WRITE,
      description: 'Create or update catalog products.',
    },
    {
      key: PermissionKey.CATALOG_PRODUCTS_PUBLISH,
      description: 'Publish or unpublish catalog products.',
    },
    {
      key: PermissionKey.CATALOG_PRODUCTS_ARCHIVE,
      description: 'Archive or restore catalog products and variants.',
    },
    {
      key: PermissionKey.CATALOG_CATEGORIES_READ,
      description: 'View catalog categories.',
    },
    {
      key: PermissionKey.CATALOG_CATEGORIES_WRITE,
      description: 'Create or update catalog categories.',
    },
    {
      key: PermissionKey.CATALOG_PRICING_WRITE,
      description: 'Change catalog pricing.',
    },
    { key: PermissionKey.INVENTORY_READ, description: 'View inventory.' },
    { key: PermissionKey.INVENTORY_ADJUST, description: 'Adjust inventory.' },
    { key: PermissionKey.ORDERS_READ, description: 'View orders.' },
    {
      key: PermissionKey.ORDERS_NOTES_WRITE,
      description: 'Write order notes.',
    },
    { key: PermissionKey.ORDERS_FULFILL, description: 'Fulfill orders.' },
    { key: PermissionKey.ORDERS_CANCEL, description: 'Cancel orders.' },
    { key: PermissionKey.ORDERS_REFUND, description: 'Refund orders.' },
    { key: PermissionKey.CUSTOMERS_READ, description: 'View customers.' },
    { key: PermissionKey.CUSTOMERS_UPDATE, description: 'Update customers.' },
    { key: PermissionKey.PROMOTIONS_READ, description: 'View promotions.' },
    {
      key: PermissionKey.PROMOTIONS_WRITE,
      description: 'Create or update promotions.',
    },
    { key: PermissionKey.REPORTS_READ, description: 'View reports.' },
  ]);

export const RoleKey = {
  OWNER: 'owner',
  ADMINISTRATOR: 'administrator',
  CATALOG_MANAGER: 'catalog_manager',
  ORDER_MANAGER: 'order_manager',
  SUPPORT_AGENT: 'support_agent',
  MARKETING_MANAGER: 'marketing_manager',
  ANALYST: 'analyst',
} as const;

export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export interface BuiltInRoleDefinition {
  readonly key: RoleKey;
  readonly name: string;
  readonly description: string;
  readonly permissionKeys: readonly PermissionKey[];
}

const catalogPermissions = [
  PermissionKey.CATALOG_PRODUCTS_READ,
  PermissionKey.CATALOG_PRODUCTS_WRITE,
  PermissionKey.CATALOG_PRODUCTS_PUBLISH,
  PermissionKey.CATALOG_PRODUCTS_ARCHIVE,
  PermissionKey.CATALOG_CATEGORIES_READ,
  PermissionKey.CATALOG_CATEGORIES_WRITE,
  PermissionKey.CATALOG_PRICING_WRITE,
] as const;
const inventoryPermissions = [
  PermissionKey.INVENTORY_READ,
  PermissionKey.INVENTORY_ADJUST,
] as const;
const orderPermissions = [
  PermissionKey.ORDERS_READ,
  PermissionKey.ORDERS_NOTES_WRITE,
  PermissionKey.ORDERS_FULFILL,
  PermissionKey.ORDERS_CANCEL,
  PermissionKey.ORDERS_REFUND,
] as const;
const customerPermissions = [
  PermissionKey.CUSTOMERS_READ,
  PermissionKey.CUSTOMERS_UPDATE,
] as const;
const marketingReportingPermissions = [
  PermissionKey.PROMOTIONS_READ,
  PermissionKey.PROMOTIONS_WRITE,
  PermissionKey.REPORTS_READ,
] as const;

const allPermissionKeys = PERMISSION_CATALOGUE.map(({ key }) => key);

export const BUILT_IN_ROLE_CATALOGUE: readonly BuiltInRoleDefinition[] =
  Object.freeze([
    {
      key: RoleKey.OWNER,
      name: 'Owner',
      description: 'Full installation access, including owner assignment.',
      permissionKeys: Object.freeze([...allPermissionKeys]),
    },
    {
      key: RoleKey.ADMINISTRATOR,
      name: 'Administrator',
      description:
        'Store operations access without owner assignment authority.',
      permissionKeys: Object.freeze([
        PermissionKey.ADMIN_ACCESS,
        PermissionKey.STAFF_READ,
        PermissionKey.STAFF_CREATE,
        PermissionKey.STAFF_ASSIGN_ROLES,
        PermissionKey.STAFF_SUSPEND,
        PermissionKey.ROLES_READ,
        PermissionKey.AUDIT_READ,
        ...catalogPermissions,
        ...inventoryPermissions,
        ...orderPermissions,
        ...customerPermissions,
        ...marketingReportingPermissions,
      ]),
    },
    {
      key: RoleKey.CATALOG_MANAGER,
      name: 'Catalog manager',
      description: 'Catalog and inventory management access.',
      permissionKeys: Object.freeze([
        PermissionKey.ADMIN_ACCESS,
        ...catalogPermissions,
        ...inventoryPermissions,
      ]),
    },
    {
      key: RoleKey.ORDER_MANAGER,
      name: 'Order manager',
      description: 'Order operations access.',
      permissionKeys: Object.freeze([
        PermissionKey.ADMIN_ACCESS,
        ...orderPermissions,
        PermissionKey.CUSTOMERS_READ,
        PermissionKey.INVENTORY_READ,
      ]),
    },
    {
      key: RoleKey.SUPPORT_AGENT,
      name: 'Support agent',
      description: 'Customer support read and note-writing access.',
      permissionKeys: Object.freeze([
        PermissionKey.ADMIN_ACCESS,
        PermissionKey.ORDERS_READ,
        PermissionKey.ORDERS_NOTES_WRITE,
        PermissionKey.CUSTOMERS_READ,
      ]),
    },
    {
      key: RoleKey.MARKETING_MANAGER,
      name: 'Marketing manager',
      description: 'Promotions and marketing reporting access.',
      permissionKeys: Object.freeze([
        PermissionKey.ADMIN_ACCESS,
        PermissionKey.PROMOTIONS_READ,
        PermissionKey.PROMOTIONS_WRITE,
        PermissionKey.CATALOG_PRODUCTS_READ,
        PermissionKey.CATALOG_CATEGORIES_READ,
        PermissionKey.REPORTS_READ,
      ]),
    },
    {
      key: RoleKey.ANALYST,
      name: 'Analyst',
      description: 'Read-only operations reporting access.',
      permissionKeys: Object.freeze([
        PermissionKey.ADMIN_ACCESS,
        PermissionKey.CATALOG_PRODUCTS_READ,
        PermissionKey.CATALOG_CATEGORIES_READ,
        PermissionKey.INVENTORY_READ,
        PermissionKey.ORDERS_READ,
        PermissionKey.CUSTOMERS_READ,
        PermissionKey.PROMOTIONS_READ,
        PermissionKey.REPORTS_READ,
      ]),
    },
  ]);

export const isPermissionKey = (value: string): value is PermissionKey =>
  PERMISSION_CATALOGUE.some(({ key }) => key === value);

export const isRoleKey = (value: string): value is RoleKey =>
  BUILT_IN_ROLE_CATALOGUE.some(({ key }) => key === value);
