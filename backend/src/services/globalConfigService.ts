import { EncryptionService } from '../utils/encryption';
import { prisma } from '../utils/prisma';

interface ConfigSetOptions {
  encrypt?: boolean;
  scope?: string;
  expiresAt?: Date | null;
}

export class GlobalConfigService {
  static async get<T = any>(key: string, scope = 'global'): Promise<T | null> {
    const row = await prisma.globalConfig.findUnique({ where: { scope_key: { scope, key } } });
    if (!row) return null;
    if (row.secretData) {
      try {
        const decrypted = EncryptionService.decrypt(row.secretData);
        return JSON.parse(decrypted) as T;
      } catch {
        return null;
      }
    }
    return (row.data as T) ?? null;
  }

  static async set<T = any>(key: string, value: T, options: ConfigSetOptions = {}): Promise<void> {
    const { encrypt, scope = 'global', expiresAt = null } = options;
    const data = encrypt ? undefined : (value as any);
    const secretData = encrypt ? EncryptionService.encrypt(JSON.stringify(value)) : undefined;

    await prisma.globalConfig.upsert({
      where: { scope_key: { scope, key } },
      create: { key, data, secretData, scope, expiresAt },
      update: { data, secretData, scope, expiresAt },
    });
  }

  static async delete(key: string, scope = 'global'): Promise<void> {
    await prisma.globalConfig.delete({ where: { scope_key: { scope, key } } });
  }
}