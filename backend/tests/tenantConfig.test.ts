import { PrismaClient } from '@prisma/client';
import { TenantConfigService } from '../src/services/tenantConfigService';
import { CacheService } from '../src/utils/cache';
import { EncryptionService } from '../src/utils/encryption';
import { TenantService } from '../src/services/tenantService';
import {
  BrandingKey,
  IntegrationKey,
  SMTPConfig,
  BrandingConfig,
  CacheEventData
} from '../src/types/tenantConfig';

describe('TenantConfig Service', () => {
  let prisma: PrismaClient;
  let tenant1: any;
  let tenant2: any;
  let tenantMissing: any;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } }
    });

    // Create test tenants
    tenant1 = await prisma.tenant.create({
      data: {
        name: 'Config Test Tenant 1',
        status: 'active',
        dedicated: false
      }
    });

    tenant2 = await prisma.tenant.create({
      data: {
        name: 'Config Test Tenant 2', 
        status: 'active',
        dedicated: false
      }
    });

    tenantMissing = await prisma.tenant.create({
      data: {
        name: 'Config Test Tenant (Missing)',
        status: 'active',
        dedicated: false
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.tenantConfig.deleteMany({
      where: {
        tenantId: { in: [tenant1.id, tenant2.id, tenantMissing.id] }
      }
    });
    
    await prisma.tenant.deleteMany({
      where: {
        id: { in: [tenant1.id, tenant2.id, tenantMissing.id] }
      }
    });
    
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Clear cache before each test
    CacheService.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('Happy Paths', () => {
    it('should create and retrieve branding config', async () => {
      const brandingConfig: BrandingConfig = {
        companyName: 'Test Company',
        companyEmail: 'test@company.com',
        companyPhone: '+1-555-0123',
        companyAddress: '123 Test St, Test City'
      };

      await TenantService.withTenantContext(tenant1, async () => {
        // Create branding config
        await TenantConfigService.createConfig(tenant1.id, 'companyName', brandingConfig.companyName!);
        await TenantConfigService.createConfig(tenant1.id, 'companyEmail', brandingConfig.companyEmail!);
        await TenantConfigService.createConfig(tenant1.id, 'companyPhone', brandingConfig.companyPhone!);
        await TenantConfigService.createConfig(tenant1.id, 'companyAddress', brandingConfig.companyAddress!);

        // Retrieve branding config
        const retrieved = await TenantConfigService.getBrandingConfig(tenant1.id);
        
        expect(retrieved.companyName).toBe(brandingConfig.companyName);
        expect(retrieved.companyEmail).toBe(brandingConfig.companyEmail);
        expect(retrieved.companyPhone).toBe(brandingConfig.companyPhone);
        expect(retrieved.companyAddress).toBe(brandingConfig.companyAddress);
      });
    });

    it('should create and retrieve encrypted integration config', async () => {
      const smtpConfig: SMTPConfig = {
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        user: 'test@test.com',
        pass: 'testpassword',
        from: 'Test Company <noreply@test.com>'
      };

      await TenantService.withTenantContext(tenant1, async () => {
        // Create SMTP config
        await TenantConfigService.createConfig(tenant1.id, 'smtp', smtpConfig);

        // Retrieve SMTP config
        const retrieved = await TenantConfigService.getConfig<SMTPConfig>(tenant1.id, 'smtp');
        
        expect(retrieved).not.toBeNull();
        expect(retrieved!.host).toBe(smtpConfig.host);
        expect(retrieved!.port).toBe(smtpConfig.port);
        expect(retrieved!.user).toBe(smtpConfig.user);
        expect(retrieved!.pass).toBe(smtpConfig.pass);
      });
    });

    it('should maintain tenant isolation', async () => {
      const config1 = { companyName: 'Company 1' };
      const config2 = { companyName: 'Company 2' };

      await TenantService.withTenantContext(tenant1, async () => {
        await TenantConfigService.createConfig(tenant1.id, 'companyName', config1.companyName);
      });

      await TenantService.withTenantContext(tenant2, async () => {
        await TenantConfigService.createConfig(tenant2.id, 'companyName', config2.companyName);
      });

      // Verify isolation
      await TenantService.withTenantContext(tenant1, async () => {
        const retrieved = await TenantConfigService.getConfig(tenant1.id, 'companyName');
        expect(retrieved).toBe(config1.companyName);
      });

      await TenantService.withTenantContext(tenant2, async () => {
        const retrieved = await TenantConfigService.getConfig(tenant2.id, 'companyName');
        expect(retrieved).toBe(config2.companyName);
      });
    });

    it('should cache configs and invalidate on update', async () => {
      const companyName = 'Cached Company';
      const updatedName = 'Updated Company';

      await TenantService.withTenantContext(tenant1, async () => {
        // Create config
        await TenantConfigService.createConfig(tenant1.id, 'companyName', companyName);

        // First read should hit DB and populate cache
        const firstRead = await TenantConfigService.getConfig(tenant1.id, 'companyName');
        expect(firstRead).toBe(companyName);

        // Second read should hit cache
        const cachedRead = CacheService.getTenantConfig(tenant1.id, 'companyName');
        expect(cachedRead).toBe(companyName);

        // Update config
        await TenantConfigService.updateConfig(tenant1.id, 'companyName', updatedName);

        // Cache should be updated
        const updatedRead = await TenantConfigService.getConfig(tenant1.id, 'companyName');
        expect(updatedRead).toBe(updatedName);
      });
    });

    it('should handle encryption/decryption correctly', async () => {
      const sensitiveData = {
        keyId: 'test_key_123',
        keySecret: 'super_secret_value',
        webhookSecret: 'webhook_secret_456'
      };

      await TenantService.withTenantContext(tenant1, async () => {
        // Create encrypted config
        await TenantConfigService.createConfig(tenant1.id, 'razorpay', sensitiveData);

        // Retrieve and verify decryption
        const retrieved = await TenantConfigService.getConfig(tenant1.id, 'razorpay');
        
        expect(retrieved).toEqual(sensitiveData);
      });
    });
  });

  describe('Sad Paths', () => {
    it('should throw error when config is missing', async () => {
      await TenantService.withTenantContext(tenantMissing, async () => {
        await expect(TenantConfigService.getBrandingConfig(tenantMissing.id)).rejects.toThrow('Branding configuration missing');
      });
    });

    it('should handle cache failures gracefully', async () => {
      const companyName = 'Fallback Test Company';
      
      await TenantService.withTenantContext(tenant1, async () => {
        // Create config
        await TenantConfigService.createConfig(tenant1.id, 'companyName', companyName);

        // Clear cache to simulate failure
        CacheService.clear();

        // Should fallback to database
        const retrieved = await TenantConfigService.getConfig(tenant1.id, 'companyName', false);
        expect(retrieved).toBe(companyName);
      });
    });

    it('should prevent cross-tenant access', async () => {
      const secretConfig = {
        host: 'secret.smtp.com',
        port: 587,
        secure: true,
        user: 'secret@company.com',
        pass: 'secret_password',
        from: 'Secret Company <noreply@secret.com>'
      };

      await TenantService.withTenantContext(tenant1, async () => {
        await TenantConfigService.createConfig(tenant1.id, 'smtp', secretConfig);
      });

      // Try to access tenant1's config from tenant2's context
      await TenantService.withTenantContext(tenant2, async () => {
        const crossTenantAccess = await TenantConfigService.getConfig(tenant1.id, 'smtp');
        expect(crossTenantAccess).toBeNull();
      });
    });

    it('should handle invalid config keys', async () => {
      const invalidKey = 'invalid_key';
      
      const isValid = await TenantConfigService.validateConfigKey(invalidKey);
      expect(isValid).toBe(false);
    });

    it('should handle encryption failures gracefully', async () => {
      // Mock encryption failure (ensure no leakage to other tests)
      const encryptSpy = jest
        .spyOn(EncryptionService, 'encrypt')
        .mockImplementation(() => { throw new Error('Encryption failed'); });
      try {
        await TenantService.withTenantContext(tenant1, async () => {
          await expect(
            TenantConfigService.createConfig(tenant1.id, 'smtp', {
              host: 'test.com',
              port: 587,
              secure: false,
              user: 'test',
              pass: 'test',
              from: 'test@test.com'
            })
          ).rejects.toThrow('Failed to create configuration');
        });
      } finally {
        encryptSpy.mockRestore();
      }
    });

    it('should throw error when configs missing for template rendering', async () => {
      await TenantService.withTenantContext(tenantMissing, async () => {
        // Should throw error when no configs exist
        await expect(TenantConfigService.getBrandingConfig(tenantMissing.id)).rejects.toThrow('Branding configuration missing');
      });
    });

    it('should handle missing rows (no crash, returns null)', async () => {
      await TenantService.withTenantContext(tenantMissing, async () => {
        const config = await TenantConfigService.getConfig(tenantMissing.id, 'companyName', false);
        expect(config).toBeNull();
      });
    });
  });

  describe('CRUD Operations', () => {
    it('should create, read, update, and delete configs', async () => {
      const initialName = 'Initial Company';
      const updatedName = 'Updated Company';

      await TenantService.withTenantContext(tenant1, async () => {
        // Create
        await TenantConfigService.createConfig(tenant1.id, 'companyName', initialName);
        
        // Read
        const retrieved = await TenantConfigService.getConfig(tenant1.id, 'companyName');
        expect(retrieved).toBe(initialName);
        
        // Update
        await TenantConfigService.updateConfig(tenant1.id, 'companyName', updatedName);
        const updated = await TenantConfigService.getConfig(tenant1.id, 'companyName');
        expect(updated).toBe(updatedName);
        
        // Delete
        const deleted = await TenantConfigService.deleteConfig(tenant1.id, 'companyName');
        expect(deleted).toBe(true);
        
        // Verify deletion
        const afterDelete = await TenantConfigService.getConfig(tenant1.id, 'companyName');
        expect(afterDelete).toBeNull();
      });
    });

    it('should list all configs for a tenant', async () => {
      await prisma.tenantConfig.deleteMany({ where: { tenantId: tenant1.id } });

      await TenantService.withTenantContext(tenant1, async () => {
        // Create multiple configs
        await TenantConfigService.createConfig(tenant1.id, 'companyName', 'Test Company');
        await TenantConfigService.createConfig(tenant1.id, 'companyEmail', 'test@company.com');
        await TenantConfigService.createConfig(tenant1.id, 'smtp', {
          host: 'smtp.test.com',
          port: 587,
          secure: false,
          user: 'test',
          pass: 'test',
          from: 'test@test.com'
        });

        // List configs
        const configs = await TenantConfigService.listConfigs(tenant1.id);
        
        expect(configs).toHaveLength(3);
        expect(configs.find(c => c.key === 'companyName')).toBeDefined();
        expect(configs.find(c => c.key === 'companyEmail')).toBeDefined();
        expect(configs.find(c => c.key === 'smtp')).toBeDefined();
        
        // Verify encryption flags
        const smtpConfig = configs.find(c => c.key === 'smtp');
        const brandingConfig = configs.find(c => c.key === 'companyName');
        
        expect(smtpConfig?.isEncrypted).toBe(true);
        expect(brandingConfig?.isEncrypted).toBe(false);
      });
    });
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt sensitive data', () => {
      const testData = 'sensitive-api-key-12345';
      
      const encrypted = EncryptionService.encrypt(testData);
      expect(encrypted).not.toBe(testData);
      expect(encrypted.length).toBeGreaterThan(testData.length);
      
      const decrypted = EncryptionService.decrypt(encrypted);
      expect(decrypted).toBe(testData);
    });

    it('should handle encryption validation', async () => {
      const isValid = await import('../src/jobs/rotateKeysJob').then(m => 
        m.KeyRotationJob.validateEncryption()
      );
      expect(isValid).toBe(true);
    });

    it('should fail gracefully on invalid encrypted data', () => {
      expect(() => {
        EncryptionService.decrypt('invalid-encrypted-data');
      }).toThrow('Decryption failed');
    });
  });

  describe('Cache Behavior', () => {
    it('should warm up cache on initialization', async () => {
      await TenantService.withTenantContext(tenant1, async () => {
        // Create config
        await TenantConfigService.createConfig(tenant1.id, 'companyName', 'Warm Up Test');

        // Force a DB read to establish the expected value
        const fromDb = await TenantConfigService.getConfig(tenant1.id, 'companyName', false);
        
        // Clear cache
        CacheService.clear();
        
        // Warm up cache
        await TenantConfigService.warmUpCache(tenant1.id);
        
        // Should be able to retrieve from cache
        const cached = CacheService.getTenantConfig(tenant1.id, 'companyName');
        expect(cached).toBe(fromDb);
      });
    });

    it('should handle cache invalidation events', async () => {
      const eventData: CacheEventData[] = [];
      
      // Subscribe to cache events
      CacheService.on('tenant:*:config-updated', (data: CacheEventData) => {
        eventData.push(data);
      });

      await TenantService.withTenantContext(tenant1, async () => {
        // Update config should trigger event
        await TenantConfigService.createConfig(tenant1.id, 'companyName', 'Event Test');
        
        // Verify event was emitted
        expect(eventData.length).toBeGreaterThan(0);
        expect(eventData[0].tenantId).toBe(tenant1.id);
        expect(eventData[0].key).toBe('companyName');
      });
    });
  });

  describe('Integration with Services', () => {
    it('should provide configs for email service', async () => {
      await TenantService.withTenantContext(tenant1, async () => {
        // Create SMTP config
        const smtpConfig: SMTPConfig = {
          host: 'smtp.tenant1.com',
          port: 587,
          secure: false,
          user: 'tenant1@test.com',
          pass: 'tenant1pass',
          from: 'Tenant 1 <noreply@tenant1.com>'
        };
        
        await TenantConfigService.createConfig(tenant1.id, 'smtp', smtpConfig);
        
        // Retrieve for email service
        const retrieved = await TenantConfigService.getConfig<SMTPConfig>(tenant1.id, 'smtp');
        
        expect(retrieved).toEqual(smtpConfig);
      });
    });

    it('should provide branding for template rendering', async () => {
      await TenantService.withTenantContext(tenant1, async () => {
        // Create branding config
        await TenantConfigService.createConfig(tenant1.id, 'companyName', 'Template Test Company');
        await TenantConfigService.createConfig(tenant1.id, 'companyEmail', 'template@test.com');

        // Get branding for templates
        const branding = await TenantConfigService.getBrandingConfig(tenant1.id);

        expect(branding.companyName).toBe('Template Test Company');
        expect(branding.companyEmail).toBe('template@test.com');
        expect(branding.defaultsUsed).toBeFalsy(); // No defaults used since configs exist
      });
    });
  });

  describe('Validation and Security', () => {
    it('masks secrets in multi-key fetch but decrypts on single-key fetch', async () => {
      await TenantService.withTenantContext(tenant1, async () => {
        // save an encrypted config
        await TenantConfigService.createConfig(tenant1.id, 'smtp', {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          user: 'test@example.com',
          pass: 'supersecret',
          from: 'Acme <no-reply@acme.com>'
        });

        // multi-get: masked (no plaintext)
        const multi = await TenantConfigService.getMultipleConfigs(
          tenant1.id,
          ['smtp', 'companyName'] as any
        );
        expect(multi.smtp).toBeDefined();
        expect(typeof multi.smtp).toBe('object');
        expect((multi as any).smtp.secretSet).toBe(true);
        // should NOT contain decrypted fields here
        expect((multi as any).smtp.host).toBeUndefined();
        expect((multi as any).smtp.user).toBeUndefined();

        // single-get: decrypted (plaintext)
        const single = await TenantConfigService.getConfig<any>(tenant1.id, 'smtp');
        expect(single).toBeDefined();
        expect(single.host).toBe('smtp.example.com');
        expect(single.user).toBe('test@example.com');
      });
    });
    it('should validate config keys', async () => {
      expect(await TenantConfigService.validateConfigKey('companyName')).toBe(true);
      expect(await TenantConfigService.validateConfigKey('smtp')).toBe(true);
      expect(await TenantConfigService.validateConfigKey('invalid_key')).toBe(false);
    });

    it('should identify encrypted vs non-encrypted keys', () => {
      expect(TenantConfigService.isEncryptedKey('smtp')).toBe(true);
      expect(TenantConfigService.isEncryptedKey('razorpay')).toBe(true);
      expect(TenantConfigService.isEncryptedKey('companyName')).toBe(false);
      expect(TenantConfigService.isEncryptedKey('companyEmail')).toBe(false);
    });

    it('should identify branding keys', () => {
      expect(TenantConfigService.isBrandingKey('companyName')).toBe(true);
      expect(TenantConfigService.isBrandingKey('companyEmail')).toBe(true);
      expect(TenantConfigService.isBrandingKey('smtp')).toBe(false);
      expect(TenantConfigService.isBrandingKey('razorpay')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle partial config updates gracefully', async () => {
      await TenantService.withTenantContext(tenant1, async () => {
        // Create some configs
        await TenantConfigService.createConfig(tenant1.id, 'companyName', 'Test Company');
        
        // Try to get multiple configs with some missing
        const configs = await TenantConfigService.getMultipleConfigs(tenant1.id, [
          'companyName',
          'companyEmail',
          'companyPhone'
        ]);
        
        expect(configs.companyName).toBe('Test Company');
        expect(configs.defaultsUsed).toBe(true);
        // Missing configs should use defaults
        expect(configs.companyEmail).toBeDefined();
        expect(configs.companyPhone).toBeDefined();
      });
    });

    it('should handle database errors during config retrieval', async () => {
      // Mock database error by using invalid tenant ID
      const config = await TenantConfigService.getConfig('invalid-tenant-id', 'companyName');
      expect(config).toBeNull();
    });
  });
});