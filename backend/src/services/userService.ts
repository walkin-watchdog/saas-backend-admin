import { PrismaClient, UserRole, User } from '@prisma/client';
import { getTenantPrisma, getTenantId, getCurrentTenant } from '../middleware/tenantMiddleware';
import { withPlatformRole } from '../utils/prisma';

type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'createdAt' | 'tokenVersion' | 'platformAdmin'>;
type UserWithPassword = PublicUser & { password: string };


export class UserService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  static async findUserByEmail(email: string) {
    const prisma = this.getPrisma();
    return prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true,
        tokenVersion: true,
        platformAdmin: true,
        failedLoginCount: true,
        lockoutUntil: true,
        twoFaEnabled: true,
        twoFaSecret: true,
        twoFaRecoveryCodes: true,
        resetToken: true,
        resetTokenExpiry: true,
        createdAt: true,
        emailVerified: true,
      }
    });
  }

  static async findUserAcrossTenants(email: string) {
    return withPlatformRole(tx =>
      tx.user.findFirst({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          password: true,
          tokenVersion: true,
          platformAdmin: true,
          failedLoginCount: true,
          lockoutUntil: true,
          twoFaEnabled: true,
          twoFaSecret: true,
          twoFaRecoveryCodes: true,
          resetToken: true,
          resetTokenExpiry: true,
          createdAt: true,
          emailVerified: true,
          tenantId: true,
        },
      })
    );
  }

  static async findUserById(id: string): Promise<PublicUser | null>;
  static async findUserById(id: string, opts: { includePassword?: false }): Promise<PublicUser | null>;
  static async findUserById(id: string, opts: { includePassword: true }): Promise<UserWithPassword | null>;
  static async findUserById(
    id: string,
    opts: { includePassword?: boolean } = {}
  ): Promise<PublicUser | UserWithPassword | null> {

    const prisma = this.getPrisma();
    return prisma.user.findFirst({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        tokenVersion: true,
        platformAdmin: true,
        ...(opts.includePassword ? { password: true } : {})
      }
    }) as any;
  }

  static async createUser(data: {
    email: string;
    password: string;
    name: string;
    role?: UserRole | string;
  }) {
    const prisma = this.getPrisma();

    let role: UserRole | undefined;
    if (typeof data.role === 'string') {
      const normalized = data.role.trim().toUpperCase();
      if (normalized in UserRole) {
        role = UserRole[normalized as keyof typeof UserRole];
      } else {
        throw new Error(`Invalid role "${data.role}". Allowed: ${Object.keys(UserRole).join(', ')}`);
      }
    } else {
      role = data.role;
    }
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        name: data.name,
        ...(role ? { role } : {}),
        tenantId: getTenantId(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });
  }

  static async updateUser(id: string, data: any, bumpTokenVersion = false) {
    const prisma = this.getPrisma();
    const shouldBump =
      bumpTokenVersion ||
      'password' in data ||
      'role' in data ||
      (('twoFaEnabled' in data) && data.twoFaEnabled === true);
    const updateData = {
      ...data,
      ...(shouldBump ? { tokenVersion: { increment: 1 } } : {}),
    };
    return prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        tokenVersion: true,
      },
    });
  }

  /**
   * Perform an update that MUST be visible immediately to subsequent requests
   * (e.g., enabling 2FA, changing password). This opens a short, independent
   * transaction on the appropriate Prisma client (shared or dedicated),
   * sets the tenant GUC locally inside that transaction, applies the update,
   * and commits right away.
   */
  static async updateUserCommitted(
    id: string,
    data: any,
    bumpTokenVersion = false
  ) {
    const { prisma: sharedPrisma, getDedicatedPrisma } = await import('../utils/prisma');
    const { id: tenantId, dedicated, datasourceUrl } = getCurrentTenant();
    const client =
      dedicated && datasourceUrl ? getDedicatedPrisma(datasourceUrl) : sharedPrisma;

    const shouldBump =
      bumpTokenVersion ||
      'password' in data ||
      'role' in data ||
      (('twoFaEnabled' in data) && data.twoFaEnabled === true);

    const updateData = {
      ...data,
      ...(shouldBump ? { tokenVersion: { increment: 1 } } : {}),
    };

    return client.$transaction(async (tx) => {
      // Scope this short transaction to the current tenant (for RLS policies)
      await (tx as any).$executeRaw`SELECT set_config('app.tenantId', ${tenantId}, true)`;

      try {
        return await tx.user.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            tokenVersion: true,
          },
        });
      } catch (e: any) {
        // Not found / not owned (RLS may surface as P2025)
        if (e?.code === 'P2025') {
          const err = new Error('User not found'); (err as any).code = 'P2025';
          throw err;
        }
        // Unique constraint (e.g., email taken)
        if (e?.code === 'P2002') {
          const err = new Error('Email already exists'); (err as any).status = 409;
          throw err;
        }
        throw e;
      }
    });
  }
  static async deleteUser(id: string) {
    const prisma = this.getPrisma();
    return prisma.user.delete({
      where: { id }
    });
  }

  static async findManyUsers(where?: any) {
    const prisma = this.getPrisma();
    return prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async countUsers(where?: any) {
    const prisma = this.getPrisma();
    return prisma.user.count({ where });
  }

  static async setResetToken(userId: string, resetToken: string, resetTokenExpiry: Date) {
    const prisma = this.getPrisma();
    return prisma.user.update({
      where: { id: userId },
      data: { resetToken, resetTokenExpiry }
    });
  }

  static async findUserByResetToken(hashedToken: string) {
    const prisma = this.getPrisma();
    return prisma.user.findFirst({
      where: { resetToken: hashedToken, resetTokenExpiry: { gt: new Date() } }
    });
  }

  static async findUserByResetTokenAcrossTenants(hashedToken: string) {
    return withPlatformRole(tx =>
      tx.user.findFirst({
        where: { resetToken: hashedToken, resetTokenExpiry: { gt: new Date() } },
        select: { id: true, tenantId: true },
      })
  );
  }

  static async clearResetTokenAndSetPassword(userId: string, hashedPassword: string) {
    const prisma = this.getPrisma();
    return prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 },
      },
    });
  }
}