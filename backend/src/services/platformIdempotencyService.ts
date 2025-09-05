import { prisma } from '../utils/prisma';

export class PlatformIdempotencyService {
  static async findKey(key: string) {
    return prisma.platformIdempotencyKey.findUnique({ where: { key } });
  }

  static async createKey(data: { key: string; method: string; endpoint: string; status: number; response: any }) {
    return prisma.platformIdempotencyKey.create({ data });
  }
}
