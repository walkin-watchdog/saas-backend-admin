import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PlatformCurrentUser } from '@/types/platform';

export interface AcceptInviteData {
  token: string;
  name: string;
  password: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export type CurrentUserResponse = PlatformCurrentUser;

export const authApi = {
  // Get current authenticated user
  async getCurrentUser(): Promise<CurrentUserResponse> {
    const data = await platformApiRequest<
      CurrentUserResponse & { passwordHash?: string }
    >('/auth/me');
    // Ensure no sensitive fields leak through
    const { passwordHash: _ph, ...user } = data as any;
    return user;
  },

  // Revoke all sessions for current user
  async revokeMySessions(): Promise<void> {
    return platformApiRequest('/auth/revoke-sessions', {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Accept platform invite
  async acceptInvite(data: AcceptInviteData): Promise<{ message: string; user: { id: string; email: string; name: string } }> {
    return platformApiRequest('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Change password
  async changePassword(data: ChangePasswordData): Promise<{ message: string }> {
    return platformApiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },
};
