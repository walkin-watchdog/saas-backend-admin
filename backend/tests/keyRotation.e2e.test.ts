import { prisma } from '../src/utils/prisma';
import { TenantConfigService } from '../src/services/tenantConfigService';
import { KeyRotationJob } from '../src/jobs/rotateKeysJob';
import { EncryptionService } from '../src/utils/encryption';
import { withAdminRls } from '../src/utils/prisma';

describe('KeyRotationJob.rotateEncryptionKeys (E2E)', () => {
  const ORIGINAL_ENV = { ...process.env };

  const makeHexKey = (seed: string) =>
    seed.repeat(64 / seed.length).slice(0, 64); // quick deterministic 32-byte hex

  beforeAll(async () => {
    // Reset EncryptionService state at the start to avoid contamination from other tests
    (EncryptionService as any).key = null;
    (EncryptionService as any).secondary = null;
  });

  afterAll(async () => {
    process.env = ORIGINAL_ENV;
    // Reset EncryptionService static state to avoid interference with other tests
    (EncryptionService as any).key = null;
    (EncryptionService as any).secondary = null;
  });

  describe('happy path — ciphertext changes, plaintext stable', () => {
    let tenantId: string;
    const oldKey = makeHexKey('1a'); // 32-bytes (64 hex chars)

    const smtpPayload = {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'u@example.com',
      pass: 's3cret',
      from: 'Brand <no-reply@example.com>',
    };

    const paypalPayload = {
      clientId: 'paypal-client-id',
      clientSecret: 'paypal-client-secret',
      mode: 'sandbox',
    };

    beforeAll(async () => {
      // start from a known key
      EncryptionService.setKey(oldKey);
      process.env.ENCRYPTION_KEY = oldKey;

      const t = await prisma.tenant.create({
        data: { name: 'Rotate Happy Co', status: 'active', dedicated: false },
      });
      tenantId = t.id;

      // create two encrypted configs
      await TenantConfigService.createConfig(tenantId, 'smtp', smtpPayload as any);
      await TenantConfigService.createConfig(tenantId, 'paypal', paypalPayload as any);
    });

    afterAll(async () => {
      // clean the tenant (with admin RLS disabled for tests)
      await withAdminRls(async (tx) => {
        await tx.tenant.delete({ where: { id: tenantId } });
      });
    });

    it('rotates DB ciphertext and updates active key without changing plaintext', async () => {
      // capture pre-rotation ciphertexts
      const before = await prisma.tenantConfig.findMany({
        where: { tenantId },
        select: { key: true, secret: true, dek: true },
        orderBy: { key: 'asc' },
      });
      const beforeMap = new Map<string, { secret: string | null; dek: string | null }>(
        before.map((r: any) => [r.key, { secret: r.secret, dek: r.dek }])
      );

      // run rotation
      await KeyRotationJob.rotateEncryptionKeys();

      // the active key must change
      expect(process.env.ENCRYPTION_KEY).toBeDefined();
      expect(process.env.ENCRYPTION_KEY).not.toEqual(oldKey);

      // ciphertext should change for encrypted rows
      const after = await prisma.tenantConfig.findMany({
        where: { tenantId },
        select: { key: true, secret: true, dek: true },
        orderBy: { key: 'asc' },
      });

      for (const row of after) {
        if (beforeMap.has(row.key)) {
          const beforeEntry = beforeMap.get(row.key);
          expect(beforeEntry).toBeDefined();
          if (beforeEntry) {
            expect(row.secret).toEqual(beforeEntry.secret);
            expect(row.dek).not.toEqual(beforeEntry.dek);
          }
        }
      }

      // plaintext readability should be preserved via service
      const smtpAfter = await TenantConfigService.getConfig<typeof smtpPayload>(tenantId, 'smtp');
      const paypalAfter = await TenantConfigService.getConfig<typeof paypalPayload>(tenantId, 'paypal', false);

      expect(smtpAfter).toEqual(smtpPayload);
      expect(paypalAfter).toEqual(paypalPayload);
    });
  });

  describe('rollback path — corrupt secret makes tenant tx fail; no key switch; no partial updates', () => {
    let tenantId: string;
    const oldKey = makeHexKey('2b');

    const smtpPayload = {
      host: 'smtp.badco.com',
      port: 465,
      secure: true,
      user: 'bad@co.com',
      pass: 'topsecret',
      from: 'BadCo <no-reply@badco.com>',
    };

    const paypalPayload = {
      clientId: 'badco-paypal-id',
      clientSecret: 'badco-paypal-secret',
      mode: 'live',
    };

    beforeAll(async () => {
      EncryptionService.setKey(oldKey);
      process.env.ENCRYPTION_KEY = oldKey;

      const t = await prisma.tenant.create({
        data: { name: 'Rotate Rollback Co', status: 'active', dedicated: false },
      });
      tenantId = t.id;

      await TenantConfigService.createConfig(tenantId, 'smtp', smtpPayload as any);
      await TenantConfigService.createConfig(tenantId, 'paypal', paypalPayload as any);

      // Corrupt one secret so decryptWithKey() throws inside the tenant transaction
      await prisma.tenantConfig.updateMany({
        where: { tenantId, key: 'paypal' },
        data: { dek: 'deadbeef' }, // invalid wrapped DEK
      });
    });

    afterAll(async () => {
      await withAdminRls(async (tx) => {
        await tx.tenant.delete({ where: { id: tenantId } });
      });
    });

    it('does not change ENCRYPTION_KEY and leaves ciphertext untouched for that tenant', async () => {
      // snapshot ciphertext before rotation attempt
      const before = await prisma.tenantConfig.findMany({
        where: { tenantId },
        select: { key: true, secret: true, dek: true },
        orderBy: { key: 'asc' },
      });
      const beforeMap = new Map<string, { secret: string | null; dek: string | null }>(
        before.map((r:any) => [r.key, { secret: r.secret, dek: r.dek }])
      );

      // run rotation; implementation logs a warning and continues (no throw) when a tenant fails
      await KeyRotationJob.rotateEncryptionKeys();

      // active key must remain unchanged because at least one tenant failed
      expect(process.env.ENCRYPTION_KEY).toEqual(oldKey);

      // verify secrets stayed exactly the same (transaction rolled back)
      const after = await prisma.tenantConfig.findMany({
        where: { tenantId },
        select: { key: true, secret: true, dek: true },
        orderBy: { key: 'asc' },
      });

      for (const row of after) {
        const beforeEntry = beforeMap.get(row.key);
        expect(beforeEntry).toBeDefined();
        if (beforeEntry) {
          expect(row.secret).toEqual(beforeEntry.secret);
          expect(row.dek).toEqual(beforeEntry.dek);
        }
      }

      // service read: valid config still decrypts; corrupted one yields null
      const smtpAfter = await TenantConfigService.getConfig<typeof smtpPayload>(tenantId, 'smtp');
      const paypalAfter = await TenantConfigService.getConfig<typeof paypalPayload>(tenantId, 'paypal');

      expect(smtpAfter).toEqual(smtpPayload);
      expect(paypalAfter).toBeNull(); // decrypt error path inside getConfig returns null
    });
  });
});