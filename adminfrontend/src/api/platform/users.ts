import { platformApiRequest, generateIdempotencyKey } from './base';
import type { PaginationParams, PaginatedResponse } from './base';
import type { PlatformUserDetailed, PlatformUserSummary, UserLoginHistory } from '@/types/platform';
import type { PlatformRoleCode } from '@/constants/platformRoles';
import { PERMISSIONS } from '@/constants/permissions';

export interface UserFilters extends PaginationParams {
  status?: 'active' | 'disabled';
  role?: string;
  search?: string;
}

export interface InviteUserData {
  email: string;
  expiresInHours?: number;
  roleCodes: PlatformRoleCode[];
}

export interface CreateUserData {
  email: string;
  name: string;
  roleCodes: PlatformRoleCode[];
  ipAllowlist?: string[];
  ssoSubject?: string;
}

export interface UpdateUserData {
  status?: 'active' | 'disabled';
  name?: string;
  mfaEnabled?: boolean;
  ssoSubject?: string | null;
}

export interface PlatformRole {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface PlatformPermission {
  id: string;
  code: string;
  description: string;
}

export const usersApi = {
  // List platform users with filters
  async list(filters: UserFilters = {}): Promise<PaginatedResponse<PlatformUserSummary>> {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.append(key, value.toString());
      }
    });

    const query = params.toString();
    const res = await platformApiRequest<{
      users: PlatformUserDetailed[];
      pagination: PaginatedResponse<PlatformUserDetailed>['pagination'];
    }>(`/users${query ? `?${query}` : ''}`);

    const users = res.users.map(u => ({
      ...u,
      roles: u.roles.map(r => r.role.code as PlatformRoleCode),
    })) as PlatformUserSummary[];
    return { data: users, pagination: res.pagination };
  },

  // Get user details
  async getDetails(userId: string): Promise<PlatformUserSummary> {
    const data = await platformApiRequest<PlatformUserDetailed>(`/users/${userId}`);
    return {
      ...data,
      roles: data.roles.map(r => r.role.code as PlatformRoleCode),
    } as PlatformUserSummary;
  },

  // Invite new user
  async invite(data: InviteUserData): Promise<{ id: string; email: string; expiresAt: string; inviteUrl: string }> {
    return platformApiRequest('/users/invite', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, roleCodes: data.roleCodes, expiresInHours: data.expiresInHours }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Create platform user directly
  async create(data: CreateUserData): Promise<{ id: string; email: string; name: string; status: string }> {
    return platformApiRequest('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        name: data.name,
        roleCodes: data.roleCodes,
        ipAllowlist: data.ipAllowlist,
        ssoSubject: data.ssoSubject,
      }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Update user
  async update(
    userId: string,
    data: UpdateUserData
  ): Promise<Pick<PlatformUserSummary, 'id' | 'email' | 'name' | 'status'>> {
    return platformApiRequest(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Manage user roles
  async updateRoles(userId: string, roleCodes: PlatformRoleCode[]): Promise<void> {
    return platformApiRequest(`/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roleCodes }),
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // IP allowlist helpers
  async getIpAllowlist(userId: string): Promise<string[]> {
    const res = await platformApiRequest<{ ipAllowlist: string[] }>(`/users/${userId}/ip-allowlist`);
    return res.ipAllowlist;
  },

  async addIp(userId: string, ip: string): Promise<string[]> {
    const res = await platformApiRequest<{ ipAllowlist: string[] }>(`/users/${userId}/ip-allowlist`, {
      method: 'POST',
      body: JSON.stringify({ ip }),
      idempotencyKey: generateIdempotencyKey(),
    });
    return res.ipAllowlist;
  },

  async removeIp(userId: string, ip: string): Promise<string[]> {
    const res = await platformApiRequest<{ ipAllowlist: string[] }>(`/users/${userId}/ip-allowlist/${encodeURIComponent(ip)}`, {
      method: 'DELETE',
      idempotencyKey: generateIdempotencyKey(),
    });
    return res.ipAllowlist;
  },

  // Force MFA setup
  async requireMfa(userId: string): Promise<{ ok: boolean }> {
    return platformApiRequest(`/users/${userId}/require-mfa`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Reset MFA for user
  async resetMfa(userId: string): Promise<{ ok: boolean }> {
    return platformApiRequest(`/users/${userId}/reset-mfa`, {
      method: 'POST',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get user login history
  async getLoginHistory(
    userId: string,
    requester: { id: string; permissions: string[] }
  ): Promise<UserLoginHistory[]> {
    const hasReadPermission = requester.permissions.includes(
      PERMISSIONS.PLATFORM_USERS.READ
    );
    if (!hasReadPermission) {
      throw new Error('Insufficient permissions to view this login history');
    }
    if (
      userId !== requester.id &&
      !requester.permissions.includes(PERMISSIONS.PLATFORM_USERS.WRITE)
    ) {
      throw new Error(
        "Insufficient permissions to view others' login history"
      );
    }
    const res = await platformApiRequest<{ logs: any[] }>(`/users/${userId}/login-history`);
    return res.logs.map(log => ({
      id: log.id,
      createdAt: log.createdAt,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      action: log.action,
      reason: log.reason,
    }));
  },

  // Delete platform user
  async delete(userId: string): Promise<void> {
    return platformApiRequest(`/users/${userId}`, {
      method: 'DELETE',
      idempotencyKey: generateIdempotencyKey(),
    });
  },

  // Get permission matrix for auditing
  async getPermissionMatrix(): Promise<Array<{ role: string; permissions: string[] }>> {
    const res = await platformApiRequest<{ matrix: Array<{ role: string; permissions: string[] }> }>('/permissions/matrix');
    return res.matrix;
  },

  async listRoles(): Promise<PlatformRoleCode[]> {
    const res = await platformApiRequest<{ matrix: Array<{ role: string; permissions: string[] }> }>('/permissions/matrix');
    return res.matrix.map(r => r.role as PlatformRoleCode);
  },
};