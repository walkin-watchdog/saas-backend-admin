import { prisma } from '../utils/prisma';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class PlatformSessionService {
  static async create(platformUserId: string, jti: string, ttlMs = REFRESH_TTL_MS) {
    const expiresAt = new Date(Date.now() + ttlMs);
    return prisma.platformSession.create({ data: { platformUserId, jti, expiresAt } });
  }

  static async rotate(oldJti: string, newJti: string, ttlMs = REFRESH_TTL_MS) {
    const expiresAt = new Date(Date.now() + ttlMs);
    return prisma.platformSession.update({
      where: { jti: oldJti },
      data: { jti: newJti, expiresAt },
    });
  }

  static async revoke(jti: string) {
    await prisma.platformSession.updateMany({ where: { jti }, data: { revokedAt: new Date() } });
  }

  static async revokeAllForUser(platformUserId: string) {
    await prisma.platformSession.updateMany({ where: { platformUserId }, data: { revokedAt: new Date() } });
  }

  static async isActive(jti: string): Promise<boolean> {
    if (!jti) return false;
    const session = await prisma.platformSession.findUnique({ where: { jti } });
    return !!session && !session.revokedAt && session.expiresAt > new Date();
  }

  static async cleanupExpired() {
    const now = new Date();
    return prisma.platformSession.deleteMany({ where: { OR: [ { expiresAt: { lt: now } }, { revokedAt: { lt: now } } ] } });
  }
}