import { eventBus } from './eventBus';

export const PLATFORM_EVENTS = {
  // User management
  USER_INVITED: 'platform.user.invited',
  AUTH_BRUTE_FORCE_DETECTED: 'platform.auth.bruteforce_detected',
  USER_ROLE_CHANGED: 'platform.user.role_changed',
  USER_SUSPENDED: 'platform.user.suspended',
  USER_RESTORED: 'platform.user.restored',
  
  // Coupon management
  COUPON_CREATED: 'platform.coupon.created',
  COUPON_UPDATED: 'platform.coupon.updated',
  COUPON_DEACTIVATED: 'platform.coupon.deactivated',
  COUPON_ACTIVATED: 'platform.coupon.activated',
  COUPON_REDEEMED: 'platform.coupon.redeemed',
  
  // Abandoned cart management
  CART_REMINDER_SENT: 'platform.abandoned_cart.reminder_sent',
  CART_RECOVERED: 'platform.abandoned_cart.recovered',
  CART_DISCARDED: 'platform.abandoned_cart.discarded',

  INVOICE_ISSUED: 'platform.invoice.issued',

  // Credit notes
  CREDIT_NOTE_CREATED: 'platform.credit_note.created',
  CREDIT_NOTE_APPLIED: 'platform.credit_note.applied',
  CREDIT_NOTE_CANCELLED: 'platform.credit_note.cancelled',
  
  // Request management
  REQUEST_CREATED: 'platform.request.created',
  REQUEST_ASSIGNED: 'platform.request.assigned',
  REQUEST_CONVERTED: 'platform.request.converted',
  REQUEST_REJECTED: 'platform.request.rejected',
  REQUEST_STATUS_UPDATED: 'platform.request.status_updated',
  
  // Tenant lifecycle
  TENANT_OFFBOARDING_SCHEDULED: 'platform.tenant.offboarding_scheduled',
  TENANT_OFFBOARDING_PROCESSING: 'platform.tenant.offboarding_processing',
  TENANT_OFFBOARDING_CANCELLED: 'platform.tenant.offboarding_cancelled',
  TENANT_OFFBOARDING_FAILED: 'platform.tenant.offboarding_failed',
  TENANT_OFFBOARDED: 'platform.tenant.offboarded',
  TENANT_RESTORED: 'platform.tenant.restored',
  TENANT_HARD_DELETED: 'platform.tenant.hard_deleted',
  
  // Impersonation
  IMPERSONATION_ISSUED: 'platform.impersonation.issued',
  IMPERSONATION_REVOKED: 'platform.impersonation.revoked',

  PDF_TOKEN_GRANTED: 'platform.pdf.token_granted',
  PDF_TOKEN_MISS: 'platform.pdf.token_miss',

  WEBHOOK_DELIVERY_PROCESSED: 'platform.webhook.delivery_processed',
  WEBHOOK_DELIVERY_FAILED: 'platform.webhook.delivery_failed',
  
  // Webhooks
  WEBHOOK_REPLAYED: 'platform.webhook.replayed',
  WEBHOOK_FAILED: 'platform.webhook.failed',
  WEBHOOK_RETRY_SPIKE: 'platform.webhook.retry_spike',
  
  // KYC
  KYC_SUBMITTED: 'platform.kyc.submitted',
  KYC_APPROVED: 'platform.kyc.approved',
  KYC_REJECTED: 'platform.kyc.rejected',
  
  // Configuration
  CONFIG_UPDATED: 'platform.config.updated',
  MAINTENANCE_MODE_CHANGED: 'platform.maintenance.changed',
} as const;

export type PlatformEventPayload = Record<string, unknown>;

export class PlatformEventBus {
  static publish<T extends PlatformEventPayload = PlatformEventPayload>(event: string, payload: T) {
    eventBus.emit(event, payload);
  }
  
  static subscribe(event: string, handler: (payload: any) => void) {
    eventBus.on(event, handler);
  }
  
  static unsubscribe(event: string, handler: (payload: any) => void) {
    eventBus.off(event, handler);
  }
}