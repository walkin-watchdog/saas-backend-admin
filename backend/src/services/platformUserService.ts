import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { PlatformEventBus, PLATFORM_EVENTS } from '../utils/platformEvents';

type TxClient = Prisma.TransactionClient | PrismaClient;

export class PlatformUserService {
  static async findUserById(id: string, _opts: { includePassword?: boolean } = {}) {
    return prisma.platformUser.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  static async findUserByEmail(email: string, _opts: { includePassword?: boolean } = {}) {
    return prisma.platformUser.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  static async findUserBySsoSubject(subject: string) {
    return prisma.platformUser.findFirst({ where: { ssoSubject: subject } });
  }

  static async createUser(
    data: {
      email: string;
      name: string;
      passwordHash?: string;
      roleCodes?: string[];
      ipAllowlist?: string[];
      ssoSubject?: string;
    },
    tx: TxClient = prisma,
  ) {
    const { roleCodes = [], ...userData } = data;

    const user = await tx.platformUser.create({
      data: {
        ...userData,
        passwordUpdatedAt: userData.passwordHash ? new Date() : null,
      }
    });

    // Assign roles if provided
    if (roleCodes.length > 0) {
      await this.assignRoles(user.id, roleCodes, tx);
    }

    return user;
  }

  static async updateUser(id: string, data: {
    name?: string;
    status?: 'active' | 'disabled';
    ipAllowlist?: string[];
    passwordHash?: string;
    mfaEnabled?: boolean;
    twoFaSecret?: string | null;
    twoFaRecoveryCodes?: string[];
    ssoSubject?: string | null;
  }) {
    const updateData: any = { ...data };
    if (data.passwordHash) {
      updateData.passwordUpdatedAt = new Date();
    }

    return prisma.platformUser.update({
      where: { id },
      data: updateData
    });
  }

  static async assignRoles(userId: string, roleCodes: string[], tx: TxClient = prisma) {
    // Find roles by codes first
    const roles = await tx.platformRole.findMany({
      where: { code: { in: roleCodes } }
    });

    // Ensure every requested code exists
    const foundCodes = new Set(roles.map(r => r.code));
    const missing = roleCodes.filter(c => !foundCodes.has(c));
    if (missing.length) {
      const err: any = new Error(`Unknown role code(s): ${missing.join(', ')}`);
      err.status = 422;
      throw err;
    }

    // Atomically replace roles
    await tx.platformUserRole.deleteMany({ where: { platformUserId: userId } });
    await tx.platformUserRole.createMany({
      data: roles.map(role => ({
        platformUserId: userId,
        platformRoleId: role.id,
      })),
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.USER_ROLE_CHANGED, {
      userId,
      roleCodes,
    });
  }

  static async touchLastLogin(id: string) {
    return prisma.platformUser.update({ where: { id }, data: { lastLoginAt: new Date() }});
  }

  static async getUserRolesAndPermissions(userId: string): Promise<{
    roles: string[];
    permissions: string[];
  }> {
    const user = await this.findUserById(userId);
    if (!user) {
      return { roles: [], permissions: [] };
    }

    const roles = user.roles.map(ur => ur.role.code);
    const permissions = new Set<string>();
    
    user.roles.forEach(ur => {
      ur.role.permissions.forEach(rp => {
        permissions.add(rp.permission.code);
      });
    });

    return {
      roles,
      permissions: Array.from(permissions)
    };
  }

  static async sanitize(user: any) {
    if (!user) return null;
    const { passwordHash, twoFaSecret, twoFaRecoveryCodes, ...rest } = user;
    const { permissions } = await this.getUserRolesAndPermissions(user.id);
    return {
      ...rest,
      roles: user.roles.map((r: any) => ({
        role: {
          code: r.role.code,
          name: r.role.name,
          description: r.role.description,
        },
      })),
      permissions,
    };
  }

  static async findManyUsers(filters: {
    status?: 'active' | 'disabled';
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};
    
    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.role) {
      where.roles = {
        some: {
          role: {
            code: filters.role
          }
        }
      };
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const take = filters.limit ?? 50;
    const skip = filters.offset ?? 0;
    return prisma.platformUser.findMany({
      where,
      include: {
        roles: {
          include: {
            role: true
          }
        }
      },
      take,
      skip,
      orderBy: { createdAt: 'desc' }
    });
  }

  static async deleteUser(id: string) {
    return prisma.platformUser.delete({
      where: { id }
    });
  }

  static async createInvite(data: {
    email: string;
    invitedById: string;
    roleCodes: string[];
    expiresAt: Date;
  }) {
    const token = crypto.randomBytes(32).toString('hex');
    const invite = await prisma.platformInvite.create({
      data: {
        ...data,
        token
      }
    });

    PlatformEventBus.publish(PLATFORM_EVENTS.USER_INVITED, {
      email: data.email,
      invitedById: data.invitedById,
      roleCodes: data.roleCodes,
      inviteId: invite.id,
    });

    return invite;
  }

  static async findInviteByToken(token: string) {
    return prisma.platformInvite.findUnique({
      where: { token },
      include: {
        invitedBy: true
      }
    });
  }

  static async acceptInvite(token: string, userData: {
    name: string;
    passwordHash: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const invite = await tx.platformInvite.findUnique({ where: { token } });
      if (!invite) {
        const e: any = new Error('Invalid invite token');
        e.status = 401; // Unauthorized
        throw e;
      }
      if (invite.acceptedAt) {
        const e: any = new Error('Invite already used');
        e.status = 409; // Conflict
        throw e;
      }
      if (invite.expiresAt < new Date()) {
        const e: any = new Error('Invite expired');
        e.status = 410; // Gone
        throw e;
      }

      const user = await this.createUser(
        {
          email: invite.email,
          name: userData.name,
          passwordHash: userData.passwordHash,
          roleCodes: invite.roleCodes,
        },
        tx,
      );

      await tx.platformInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return user;
    });
  }

  static async createImpersonationGrant(data: {
    issuedById: string;
    tenantId: string;
    reason: string;
    scope: 'read_only' | 'billing_support' | 'full_tenant_admin';
    durationMinutes?: number;
  }) {
    const durationMs = (data.durationMinutes || 120) * 60 * 1000; // default 2 hours
    const expiresAt = new Date(Date.now() + durationMs);
    const jti = crypto.randomUUID();

    return prisma.impersonationGrant.create({
      data: {
        issuedById: data.issuedById,
        tenantId: data.tenantId,
        reason: data.reason,
        scope: data.scope,
        jti,
        expiresAt
      }
    });
  }

  static async findImpersonationGrant(id: string) {
    return prisma.impersonationGrant.findUnique({
      where: { id }
    });
  }

  static async revokeImpersonationGrant(id: string) {
    return prisma.impersonationGrant.update({
      where: { id },
      data: { revokedAt: new Date() }
    });
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}