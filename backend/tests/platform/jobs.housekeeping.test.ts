import { prisma } from '../../src/utils/prisma';
import { TokenCleanupJob } from '../../src/jobs/tokenCleanupJob';
import { KeyRotationJob } from '../../src/jobs/rotateKeysJob';
import { EncryptionService } from '../../src/utils/encryption';
import { logger } from '../../src/utils/logger';

describe('Background jobs & housekeeping', () => {
  // Store original env to restore after tests
  const ORIGINAL_ENV = { ...process.env };
  
  beforeAll(async () => {
    // Reset EncryptionService state at the start to avoid contamination from other tests
    (EncryptionService as any).key = null;
    (EncryptionService as any).secondary = null;
  });
  
  beforeEach(async () => {
    await prisma.globalConfig.deleteMany({});
    await prisma.platformSession.deleteMany({});
    await prisma.offboardingJob.deleteMany({});
    await prisma.impersonationGrant.deleteMany({});
    await prisma.creditNote.deleteMany({});
    await prisma.platformCoupon.deleteMany({});
    await prisma.platformUser.deleteMany({});
  });
  
  afterAll(async () => {
    // Restore original environment and reset EncryptionService state
    process.env = ORIGINAL_ENV;
    (EncryptionService as any).key = null;
    (EncryptionService as any).secondary = null;
  });

  test('TokenCleanupJob removes expired tokens and keeps valid ones', async () => {
    const now = new Date();
    await prisma.globalConfig.createMany({
      data: [
        { scope: 'global',   key: 'invoice_access_old', expiresAt: new Date(now.getTime() - 1000) },
        { scope: 'platform', key: 'cart_recovery_old',  expiresAt: new Date(now.getTime() - 1000) },
        { scope: 'global',   key: 'invoice_pdf_valid',  expiresAt: new Date(now.getTime() + 1000000) }
      ]
    });
    // Sessions require an existing platform user and a required "jti"
    const user = await prisma.platformUser.create({
      data: { id: 'u1', email: 'u1@example.com', name: 'User1', passwordHash: 'hash', status: 'active' }
    });
    await prisma.platformSession.createMany({
      data: [
        { id: 's1', platformUserId: user.id, jti: 'jti1', expiresAt: new Date(now.getTime() - 1000) },
        { id: 's2', platformUserId: user.id, jti: 'jti2', expiresAt: new Date(now.getTime() + 1000000) }
      ]
    });

    await TokenCleanupJob.cleanupExpiredTokens();

    const configs = await prisma.globalConfig.findMany();
    expect(configs.map(c => c.key).sort()).toEqual(['invoice_pdf_valid']);

    const sessions = await prisma.platformSession.findMany();
    expect(sessions.map(s => s.id)).toEqual(['s2']);
  });

  test('TokenCleanupJob handles large dataset efficiently', async () => {
    const now = new Date();
    // Use prefixes that TokenCleanupJob actually targets:
    // invoice_access_, cart_recovery_, invoice_pdf_
    const expiredConfigs = Array.from({ length: 250 }, (_, i) => ({
      scope: 'global',
      key: `invoice_access_expired_${i}`,
      expiresAt: new Date(now.getTime() - 1000)
    }));
    const validConfigs = Array.from({ length: 10 }, (_, i) => ({
      scope: 'global',
      key: `invoice_access_valid_${i}`,
      expiresAt: new Date(now.getTime() + 1000000)
    }));
    await prisma.globalConfig.createMany({ data: [...expiredConfigs, ...validConfigs] });
    const user = await prisma.platformUser.create({
      data: { id: 'u1', email: 'u1@example.com', name: 'User1', passwordHash: 'hash', status: 'active' }
    });

    const expiredSessions = Array.from({ length: 250 }, (_, i) => ({
      id: `es_${i}`,
      platformUserId: user.id,
      jti: `j_${i}`,
      expiresAt: new Date(now.getTime() - 1000)
    }));
    const validSessions = Array.from({ length: 5 }, (_, i) => ({
      id: `vs_${i}`,
      platformUserId: user.id,
      jti: `jv_${i}`,
      expiresAt: new Date(now.getTime() + 1000000)
    }));
    await prisma.platformSession.createMany({ data: [...expiredSessions, ...validSessions] });

    const start = Date.now();
    await TokenCleanupJob.cleanupExpiredTokens();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000); // should complete quickly via chunking
    expect(await prisma.globalConfig.count()).toBe(validConfigs.length);
    expect(await prisma.platformSession.count()).toBe(validSessions.length);
  });

  test('KeyRotationJob rotates encryption key, updates active kid (if supported), and preserves old-cipher decryption during grace', async () => {
    const original = EncryptionService.generateKey();
    EncryptionService.setKey(original);
    process.env.ENCRYPTION_KEY = original;
    const getKid = (EncryptionService as any).getActiveKeyId;
    const kidBefore = typeof getKid === 'function' ? getKid() : undefined;
    const legacyCipher = EncryptionService.encrypt('legacy');
    const user = await prisma.platformUser.create({
      data: {
        email: 'u@example.com',
        name: 'User',
        passwordHash: 'hash',
        status: 'active',
        twoFaSecret: EncryptionService.encrypt('secret')
      }
    });

    await KeyRotationJob.rotateEncryptionKeys();

    expect(process.env.ENCRYPTION_KEY).not.toBe(original);
    const updated = await prisma.platformUser.findUnique({ where: { id: user.id } });
    const decrypted = EncryptionService.decrypt(updated!.twoFaSecret!);
    expect(decrypted).toBe('secret');
    expect(EncryptionService.decrypt(legacyCipher)).toBe('legacy');
    const kidAfter = typeof getKid === 'function' ? getKid() : undefined;
    if (kidBefore !== undefined && kidAfter !== undefined) {
      expect(kidAfter).not.toBe(kidBefore);
    }
  });

  test('KeyRotationJob logs error and preserves state when store unavailable', async () => {
    const original = process.env.ENCRYPTION_KEY || EncryptionService.generateKey();
    process.env.ENCRYPTION_KEY = original;
    EncryptionService.setKey(original);
    const spy = jest.spyOn(prisma.platformUser, 'findMany').mockRejectedValue(new Error('db down'));
    const errSpy = jest.spyOn(logger, 'error').mockImplementation();
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    
    // The job is designed to log and continue (not throw) when a pass fails.
    await KeyRotationJob.rotateEncryptionKeys();
    // Active key should not have changed because errors occurred.
    expect(process.env.ENCRYPTION_KEY).toBe(original);
    // Should log an error for the failed pass and a warn summary.
    expect(errSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    
    spy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});