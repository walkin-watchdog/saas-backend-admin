export const PERMISSIONS = {
  SUBSCRIBERS: {
    READ: 'subscribers.read',
    WRITE: 'subscribers.write',
    SUSPEND: 'subscribers.suspend',
    BILLING: 'subscribers.billing',
  },
  REQUESTS: {
    READ: 'requests.read',
    WRITE: 'requests.write',
    ASSIGN: 'requests.assign',
    CONVERT: 'requests.convert',
  },
  PLATFORM_USERS: {
    READ: 'platform.users.read',
    WRITE: 'platform.users.write',
    INVITE: 'platform.users.invite',
    DELETE: 'platform.users.delete',
  },
  COUPONS: {
    READ: 'coupons.read',
    WRITE: 'coupons.write',
    REDEEM: 'coupons.redeem',
  },
  ORDERS: {
    READ: 'orders.read',
    REFUND: 'orders.refund',
    ADJUST: 'orders.adjust',
  },
  INVOICES: {
    READ: 'invoices.read',
    WRITE: 'invoices.write',
    EXPORT: 'invoices.export',
  },
  ABANDONED_CARTS: {
    READ: 'abandoned_carts.read',
    WRITE: 'abandoned_carts.write',
  },
  AUDIT: {
    READ: 'audit.read',
    EXPORT: 'audit.export',
  },
  KYC: {
    READ: 'kyc.read',
    REVIEW: 'kyc.review',
    WRITE: 'kyc.write',
  },
  IMPERSONATION: {
    READ: 'impersonation.read',
    ISSUE: 'impersonation.issue',
    REVOKE: 'impersonation.revoke',
  },
  PLANS: {
    READ: 'plans.read',
    WRITE: 'plans.write',
  },
  WEBHOOKS: {
    READ: 'webhooks.read',
    REPLAY: 'webhooks.replay',
  },
  CREDIT_NOTES: {
    READ: 'credit_notes.read',
    ISSUE: 'credit_notes.issue',
  },
  TENANTS: {
    READ: 'tenants.read',
    OFFBOARD: 'tenants.offboard',
    RESTORE: 'tenants.restore',
    HARD_DELETE: 'tenants.hard_delete',
    MANAGE: 'tenants.manage',
  },
  CONFIG: {
    READ: 'config.read',
    WRITE: 'config.write',
  },
  METRICS: {
    READ: 'metrics.read',
  },
  PERMISSIONS: {
    READ: 'platform.permissions.read',
  },
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS][keyof typeof PERMISSIONS[keyof typeof PERMISSIONS]];
