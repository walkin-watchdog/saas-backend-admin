import { platformApiRequest, generateIdempotencyKey } from './base';

export interface TotpSetupData {
  password: string;
}

export interface TotpSetupResponse {
  secret: string;
  qr: string;
}

export interface TotpEnableData {
  totp: string;
}

export interface TotpEnableResponse {
  recoveryCodes: string[];
}

export type TotpDisableData =
  | { password: string; totp: string; recoveryCode?: string }
  | { password: string; recoveryCode: string; totp?: string };

export type TotpReauthData =
  | { totp: string; recoveryCode?: string }
  | { recoveryCode: string; totp?: string };

export interface TotpReauthResponse {
  ok: boolean;
  ttlSec: number;
}

export const totpApi = {
  // Generate new 2FA secret and QR code
  async setup(data: TotpSetupData): Promise<TotpSetupResponse> {
    return platformApiRequest('/auth/2fa/setup', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Enable 2FA with TOTP verification
  async enable(data: TotpEnableData): Promise<TotpEnableResponse> {
    return platformApiRequest('/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Disable 2FA with password and TOTP/recovery code
  async disable(data: TotpDisableData): Promise<{ ok: boolean }> {
    return platformApiRequest('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Step-up reauth for sensitive operations
  async reauth(data: TotpReauthData): Promise<TotpReauthResponse> {
    return platformApiRequest('/auth/2fa/reauth', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },
};