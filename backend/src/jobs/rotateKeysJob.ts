import { EncryptionService } from '../utils/encryption';
import { TenantConfigService } from '../services/tenantConfigService';
import { TenantService } from '../services/tenantService';
import { logger } from '../utils/logger';
import { CacheService } from '../utils/cache';
import type { Prisma } from '@prisma/client';
import { prisma as rootPrisma } from '../utils/prisma';

export class KeyRotationJob {
  static async rotateEncryptionKeys(): Promise<void> {
    const prisma = rootPrisma;
    
    try {
      logger.info('Starting encryption key rotation');
      
      // Generate new encryption key
      const newKeyHex = EncryptionService.generateKey();
      const oldKeyHex = process.env.ENCRYPTION_KEY;
      
      if (!oldKeyHex) {
        throw new Error('Current encryption key not found in environment');
      }

      // Primary (active) remains the OLD key; stage the NEW key as secondary so reads of rewrapped rows succeed.
      EncryptionService.setSecondaryKey(newKeyHex);

      //
      // ---- PLATFORM SCOPE (KEK-encrypted fields) ----
      //
      // 1) Platform users: twoFaSecret is KEK-encrypted directly (not envelope); must decrypt(old) → encrypt(new)
      let rotatedCount = 0;
      let errorCount = 0;
      try {
        const platformUsers = await prisma.platformUser.findMany({
          where: { twoFaSecret: { not: null } },
          select: { id: true, twoFaSecret: true },
        });
        for (const u of platformUsers) {
          if (!u.twoFaSecret) continue;
          try {
            const rotated = EncryptionService.rewrapCiphertext(u.twoFaSecret, oldKeyHex, newKeyHex);
            await prisma.platformUser.update({
              where: { id: u.id },
              data: { twoFaSecret: rotated, updatedAt: new Date() } as any,
            });
            rotatedCount++;
          } catch (eOld) {
            try {
              EncryptionService.decryptWithKey(u.twoFaSecret, newKeyHex);
              // already rotated; no-op
              continue;
            } catch {
              logger.error('KeyRotation: failed to rewrap PlatformUser.twoFaSecret', { platformUserId: u.id, error: eOld });
              errorCount++;
            }
          }
        }
      } catch (e: any) {
        // If the model doesn't exist in this schema, Prisma throws a validation error.
        if (e?.name === 'PrismaClientValidationError') {
          logger.info('KeyRotation: no platform user model found (skipping)', { error: e });
        } else {
          logger.error('KeyRotation: platform users pass failed', { error: e });
          errorCount++;
        }
      }

      // 2) Global/platform configs that store KEK-encrypted blobs (e.g., GlobalConfig.secretEncrypted)
      //    We probe for either model name to stay compatible with your schema.
      {
        const globalCfgModel =
          (prisma as any).globalConfig || (prisma as any).platformConfig || null;
        if (!globalCfgModel) {
          logger.info('KeyRotation: no global/platform config model found (skipping)');
        } else {
          try {
            const rows = await globalCfgModel.findMany({
              where: { secretEncrypted: { not: null } },
              select: { id: true, secretEncrypted: true },
            });
            for (const row of rows) {
              if (!row.secretEncrypted) continue;
              try {
                const rotated = EncryptionService.rewrapCiphertext(row.secretEncrypted, oldKeyHex, newKeyHex);
                await globalCfgModel.update({
                  where: { id: row.id },
                  data: { secretEncrypted: rotated, updatedAt: new Date() },
                });
                rotatedCount++;
              } catch (e) {
                logger.error('KeyRotation: failed to rewrap GlobalConfig.secretEncrypted', { id: row.id, error: e });
                errorCount++;
              }
            }
          } catch (e: any) {
            // Field or shape not present in this deployment: treat as a skip, not a failure.
            if (e?.name === 'PrismaClientValidationError') {
              logger.info('KeyRotation: no compatible global/platform config fields found (skipping)', { error: e });
            } else {
              logger.error('KeyRotation: global/platform config pass failed', { error: e });
              errorCount++;
            }
          }
        }
      }

      // Get all tenants
      const tenants = await prisma.tenant.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          name: true,
          status: true,
          dedicated: true,
          datasourceUrl: true,
          dbName: true,
        }
      });

      // Rotate keys for each tenant
      for (const tenant of tenants) {
        try {
          CacheService.clearTenantConfigs(tenant.id);
          await TenantService.withTenantContext(tenant, async (tenantPrisma) => {
            // type guard: does the client expose $transaction?
            const hasTransaction = (
              client: unknown
            ): client is { $transaction: <T>(
                fn: (tx: Prisma.TransactionClient) => Promise<T>
              ) => Promise<T> } => typeof (client as any)?.$transaction === 'function';

            const run = async (tx: Prisma.TransactionClient) => {
              const encryptedConfigs = await tx.tenantConfig.findMany({
                where: { tenantId: tenant.id, dek: { not: null } },
                select: { id: true, key: true, dek: true }
              });
              for (const cfg of encryptedConfigs) {
                if (!cfg.dek) continue;
                const newDek = EncryptionService.rewrapDek(cfg.dek, oldKeyHex, newKeyHex);
                await tx.tenantConfig.update({
                  where: { id: cfg.id },
                  data: { dek: newDek, updatedAt: new Date() }
                });
                rotatedCount++;
                CacheService.deleteTenantConfig(tenant.id, cfg.key as any);
              }
            };

            if (hasTransaction(tenantPrisma)) {
              // We have a PrismaClient — use an interactive transaction
              await tenantPrisma.$transaction(run);
            } else {
              // We already have a TransactionClient — just run directly
              await run(tenantPrisma as unknown as Prisma.TransactionClient);
            }
          });
        } catch (error) {
          CacheService.clearTenantConfigs(tenant.id);
          logger.error('Failed to rotate keys for tenant', {
            tenantId: tenant.id,
            error
          });
          errorCount++;
        }
      }

      // Update the encryption key in service
      if (errorCount === 0) {
        // Flip primary to NEW; keep OLD as secondary briefly so late readers still succeed
        await EncryptionService.rotateKey(oldKeyHex, newKeyHex);
        EncryptionService.setSecondaryKey(oldKeyHex);
        const graceMs = Number(process.env.KEY_ROTATION_GRACE_MS || 120000);
        setTimeout(() => EncryptionService.setSecondaryKey(null), graceMs).unref?.();
        logger.info('Encryption key rotation completed successfully', {
          rotatedConfigs: rotatedCount,
          tenantsProcessed: tenants.length
        });
      } else {
        logger.warn('Encryption key rotation completed with errors', {
          rotatedConfigs: rotatedCount,
          errors: errorCount,
          tenantsProcessed: tenants.length
        });
      }

    } catch (error) {
      logger.error('Encryption key rotation failed', { error });
      throw new Error('Key rotation failed');
    }
  }

  static async validateEncryption(): Promise<boolean> {
    try {
      const candidate =
        (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim().length === 64)
          ? process.env.ENCRYPTION_KEY.trim()
          : EncryptionService.generateKey();
      const testData  = 'test-encryption-data';
      const encrypted = EncryptionService.encryptWithKey(testData, candidate);
      const decrypted = EncryptionService.decryptWithKey(encrypted, candidate);
      return testData === decrypted;
    } catch (error) {
      logger.error('Encryption validation failed', { error });
      return false;
    }
  }

  static async cleanupExpiredKeys(): Promise<void> {
    try {
      // Support multiple env var formats/names for backward compatibility
      const candidates = [
        process.env.KEY_ROTATION_OLD_KEYS,     // preferred JSON: [{key, expiresAt}]
        process.env.ENCRYPTION_KEY_PREVIOUS,   // CSV: key[@iso],key[@iso]
        process.env.OLD_ENCRYPTION_KEYS        // legacy CSV
      ].filter(Boolean) as string[];

      const now = Date.now();
      const currentKey = process.env.ENCRYPTION_KEY || '';

      type Entry = { key: string; expiresAt?: string };
      let entries: Entry[] = [];

      const parseCsv = (csv: string): Entry[] =>
        csv.split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(token => {
            const [k, at] = token.split('@');
            return { key: k, expiresAt: at };
          });

      if (candidates.length > 0) {
        const raw = candidates[0];
        try {
          // Try JSON first
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            entries = arr
              .map((o: any) => ({ key: String(o.key || ''), expiresAt: o.expiresAt ? String(o.expiresAt) : undefined }))
              .filter(e => e.key);
          }
        } catch {
          // Fallback to CSV parsing
          entries = parseCsv(raw);
        }
      }

      if (entries.length === 0) {
        logger.info('KeyRotation: no old keys found to clean up');
        return;
      }

      const before = entries.length;
      // Normalize & filter:
      //  - drop invalid keys
      //  - drop any equal to current key
      //  - drop expired ones
      const remaining = entries.filter(e => {
        if (!e.key || e.key === currentKey) return false;
        if (!e.expiresAt) return true; // keep if no expiry defined
        const t = Date.parse(e.expiresAt);
        return !Number.isNaN(t) && t > now;
      });

      // Persist back in a canonical JSON env var
      if (remaining.length > 0) {
        process.env.KEY_ROTATION_OLD_KEYS = JSON.stringify(remaining);
      } else {
        delete process.env.KEY_ROTATION_OLD_KEYS;
      }
      // Clear legacy holders to avoid confusion
      delete process.env.ENCRYPTION_KEY_PREVIOUS;
      delete process.env.OLD_ENCRYPTION_KEYS;

      logger.info('KeyRotation: cleanup of expired encryption keys completed', {
        before,
        removed: before - remaining.length,
        remaining: remaining.length
      });
    } catch (error) {
      logger.error('KeyRotation: cleanupExpiredKeys failed', { error });
    }
  }
}