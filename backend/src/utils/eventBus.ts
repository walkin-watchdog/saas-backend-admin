import { EventEmitter } from 'events';
export type EventPayload = Record<string, unknown>;

class EventBus extends EventEmitter {
  publish<T extends EventPayload = EventPayload>(event: string, payload: T) {
    this.emit(event, payload);
  }
}

export const TENANT_EVENTS = {
  DATASOURCE_CHANGED: 'tenant.datasource_changed',
  CLIENT_EVICTED:     'tenant.client_evicted',
} as const;

export const eventBus = new EventBus();

export const AUTH_EVENTS = {
  LOGIN_FAILED: 'auth.login_failed',
  LOCKOUT_ENGAGED: 'auth.lockout_engaged',
  LOCKOUT_CLEARED: 'auth.lockout_cleared',
  BRUTE_FORCE_DETECTED: 'auth.bruteforce_detected',
} as const;

export const BILLING_EVENTS = {
  SUBSCRIPTION_STATE_CHANGED: 'subscription.state_changed',
  PAYMENT_METHOD_ATTACHED: 'payment_method.attached',
  PAYMENT_METHOD_SET_DEFAULT: 'payment_method.set_default',
  PAYMENT_METHOD_DETACHED: 'payment_method.detached',
  USAGE_RECORDED: 'usage.recorded',
  DUNNING_NOTICE_SENT: 'subscription.dunning_notice',
} as const;

export const PUBLIC_EVENTS = {
  TENANT_SIGNUP_COMPLETED: 'tenant.signup_completed',
  USER_SIGNUP_COMPLETED: 'user.signup_completed',
  REQUEST_CREATED: 'request.created',
  ABANDONED_CART_OPENED: 'abandoned_cart.opened',
  ABANDONED_CART_UPDATED: 'abandoned_cart.updated',
} as const;