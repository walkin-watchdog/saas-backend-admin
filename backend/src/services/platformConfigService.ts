import { prisma } from '../utils/prisma';
import { EncryptionService } from '../utils/encryption';
import { AuditService } from './auditService';

interface ConfigOptions {
  encrypt?: boolean;
  scope?: string;
  expiresAt?: Date | null;
}

export class PlatformConfigService {
  static async getConfigEntry(key: string, scope = 'platform') {
    // IMPORTANT: use the unscoped platform prisma client here
    return prisma.globalConfig.findFirst({
      where: { scope, key },
    });
  }

  static async getConfig<T = any>(key: string, scope = 'platform'): Promise<T | null> {
    const config = await prisma.globalConfig.findFirst({
      where: { scope, key },
    });

    if (!config) return null;

    if (config.secretData) {
      try {
        return JSON.parse(EncryptionService.decrypt(config.secretData)) as T;
      } catch {
        return null;
      }
    }
    return config.data as T;
  }

  static async setConfig<T = any>(
    key: string,
    value: T,
    platformUserId?: string,
    options: ConfigOptions = {}
  ): Promise<void> {
    const { encrypt, scope = 'platform', expiresAt = null } = options;
    const data = encrypt ? undefined : (value as any);
    const secretData = encrypt ? EncryptionService.encrypt(JSON.stringify(value)) : undefined;

    // Manual upsert using plain prisma (no tenant scoping)
    const existing = await prisma.globalConfig.findFirst({ where: { scope, key } });
    if (existing) {
      await prisma.globalConfig.update({
        where: { id: existing.id },
        data: { data, secretData, scope, key, expiresAt },
      });
    } else {
      await prisma.globalConfig.create({
        data: { key, data, secretData, scope, expiresAt },
      });
    }

    if (platformUserId) {
      await AuditService.log({
        platformUserId,
        action: 'platform.config.updated',
        resource: 'global_config',
        resourceId: key,
        changes: { key, encrypted: Boolean(encrypt) },
      });
    }
  }

  static async deleteConfig(key: string, platformUserId?: string, scope = 'platform'): Promise<boolean> {
    try {
      const existing = await prisma.globalConfig.findFirst({ where: { scope, key } });
      if (!existing) throw new Error('missing');
      await prisma.globalConfig.delete({ where: { id: existing.id } });

      if (platformUserId) {
        await AuditService.log({
          platformUserId,
          action: 'platform.config.deleted',
          resource: 'global_config',
          resourceId: key,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  static async listConfigs(scope = 'platform'): Promise<Array<{ key: string; hasValue: boolean }>> {
    const configs = await prisma.globalConfig.findMany({
      where: { scope },
      select: { key: true, data: true, secretData: true },
      orderBy: { key: 'asc' },
    });

    return configs.map(c => ({
      key: c.key,
      hasValue: c.data !== null || c.secretData !== null,
    }));
  }

  static async getMaintenanceMode(): Promise<{
    enabled: boolean;
    message?: string;
    scheduledStart?: Date;
    scheduledEnd?: Date;
  }> {
    const config = await this.getConfig<{
      enabled: boolean;
      message?: string;
      scheduledStart?: string;
      scheduledEnd?: string;
    }>('maintenance_mode', 'platform');

    if (!config) return { enabled: false };

    return {
      enabled: config.enabled,
      message: config.message,
      scheduledStart: config.scheduledStart ? new Date(config.scheduledStart) : undefined,
      scheduledEnd: config.scheduledEnd ? new Date(config.scheduledEnd) : undefined,
    };
  }

  static async setMaintenanceMode(
    enabled: boolean,
    options: { message?: string; scheduledStart?: Date; scheduledEnd?: Date } = {},
    platformUserId?: string
  ) {
    const config = {
      enabled,
      message: options.message,
      scheduledStart: options.scheduledStart?.toISOString(),
      scheduledEnd: options.scheduledEnd?.toISOString(),
    };

    await this.setConfig('maintenance_mode', config, platformUserId, { scope: 'platform' });
    return config;
  }
}