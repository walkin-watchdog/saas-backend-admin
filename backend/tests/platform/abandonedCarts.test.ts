import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { PlatformConfigService } from '../../src/services/platformConfigService';
import { PlatformAbandonedCartService } from '../../src/services/platformAbandonedCartService';
import { PlatformAbandonedCartJob } from '../../src/jobs/platformAbandonedCartJob';
import { EmailService } from '../../src/services/emailService';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus } from '../../src/utils/platformEvents';
import crypto from 'crypto';

describe('Platform Abandoned Carts Management', () => {
  let adminToken: string;
  let adminUser: any;
  let cart: any;

  beforeAll(async () => {
    // Create permissions and role
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'abandoned_carts.read', description: 'Read abandoned carts' },
        { code: 'abandoned_carts.write', description: 'Write abandoned carts' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'cart_admin',
        name: 'Cart Admin',
        description: 'Cart management'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['abandoned_carts.read', 'abandoned_carts.write'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'cart@platform.test',
        name: 'Cart Admin',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active'
      }
    });

    await prisma.platformUserRole.create({
      data: {
        platformUserId: adminUser.id,
        platformRoleId: adminRole.id
      }
    });

    const jti = crypto.randomUUID();
    adminToken = signPlatformAccess({
      sub: adminUser.id,
      email: 'cart@platform.test',
      roles: ['cart_admin'],
      permissions: ['abandoned_carts.read', 'abandoned_carts.write']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);

    // Create test cart
    cart = await prisma.platformAbandonedCart.create({
      data: {
        sessionId: 'test-session-123',
        email: 'test@cart.example',
        planId: 'plan_123',
        status: 'open',
        utm: { source: 'google', medium: 'cpc' },
        reminderCount: 0,
        lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        currency: 'INR'
      }
    });
  });

  afterAll(async () => {
    await prisma.platformAbandonedCart.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('public signupSession stores currency', async () => {
      await request(app)
        .post('/public/signup/session')
        .send({ sessionId: 'currency-session', currency: 'INR' });
      const stored = await prisma.platformAbandonedCart.findUnique({
        where: { sessionId: 'currency-session' },
      });
      expect(stored?.currency).toBe('INR');
    });
    test('GET /api/platform/abandoned-carts filters by status/plan/email', async () => {
      // Create additional carts for filtering
      await prisma.platformAbandonedCart.createMany({
        data: [
          {
            sessionId: 'recovered-session',
            email: 'recovered@cart.example',
            planId: 'plan_456',
            status: 'recovered',
            reminderCount: 1,
            recoveredAt: new Date()
          },
          {
            sessionId: 'discarded-session',
            email: 'discarded@cart.example',
            planId: 'plan_123',
            status: 'discarded',
            reminderCount: 2
          }
        ]
      });

      // Filter by status
      const statusRes = await request(app)
        .get('/api/platform/abandoned-carts?status=open')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.carts.every((c: any) => c.status === 'open')).toBe(true);

      // Filter by email
      const emailRes = await request(app)
        .get('/api/platform/abandoned-carts?email=test@cart.example')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(emailRes.status).toBe(200);
      expect(emailRes.body.carts.some((c: any) => c.email === 'test@cart.example')).toBe(true);

      // Filter by planId
      const planRes = await request(app)
        .get('/api/platform/abandoned-carts?planId=plan_123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(planRes.status).toBe(200);
      expect(planRes.body.carts.every((c: any) => c.planId === 'plan_123')).toBe(true);
    });

    test('POST /:id/recover sends magic link and does NOT mark recovered', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const emailSpy = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue(undefined as any);
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/platform/abandoned-carts/${cart.id}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('recoveryUrl');

      // Verify cart was updated
      const updatedCart = await prisma.platformAbandonedCart.findUnique({
        where: { id: cart.id }
      });

      expect(updatedCart?.reminderCount).toBe(1);

      // Should not be marked recovered yet
      expect(updatedCart?.status).toBe('open');
      expect(updatedCart?.recoveredAt).toBeNull();

      // Verify token stored (single-use semantics deferred to consumption)
      // Verify email was sent
      expect(emailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@cart.example',
          template: 'platform-abandoned-cart',
          context: expect.objectContaining({ currency: 'INR' })
        })
      );

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'abandoned_cart.recovery_sent'
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.abandoned_cart.reminder_sent',
        expect.objectContaining({
          cartId: cart.id,
          email: 'test@cart.example',
          currency: 'INR'
        })
      );

      auditSpy.mockRestore();
      emailSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('POST /:id/recover persists single-use token with ~24h expiry', async () => {
      // fresh cart so reminderCount / status do not interfere
      const tokenCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'token-session',
          email: 'token@cart.example',
          status: 'open',
          lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        }
      });

      const cfgSpy = jest
        .spyOn(PlatformConfigService, 'setConfig')
        .mockResolvedValue(undefined as any);
      // Avoid hitting a real SMTP server
      const emailSpy = jest
        .spyOn(EmailService, 'sendEmail')
        .mockResolvedValue(undefined as any);

      const res = await request(app)
        .post(`/api/platform/abandoned-carts/${tokenCart.id}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('recoveryUrl');
      expect(res.body.recoveryUrl).toMatch(/recovery=[^&]+/);
      expect(res.body.recoveryUrl).toContain(`sessionId=${encodeURIComponent(tokenCart.sessionId)}`);

      // Verify a hashed token entry was persisted as single-use material with 24h expiry
      expect(cfgSpy).toHaveBeenCalled();
      const [key, payload, _unused, opts] = cfgSpy.mock.calls[cfgSpy.mock.calls.length - 1];
      expect(typeof key).toBe('string');
      expect(key).toMatch(/^cart_recovery_/); // hashed token key
      expect(payload).toEqual({ sessionId: tokenCart.sessionId });
      expect(opts).toBeTruthy();
      expect(opts?.scope).toBe('platform');
      expect(opts?.encrypt).toBe(true);
      expect(opts?.expiresAt).toBeInstanceOf(Date);
      // allow a small window for runtime; require ~24h TTL
      const ttlMs = (opts?.expiresAt as Date).getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(ttlMs).toBeLessThan(25 * 60 * 60 * 1000);

      cfgSpy.mockRestore();
      emailSpy.mockRestore();

      // sanity: send did not mark recovered
      const postSend = await prisma.platformAbandonedCart.findUnique({ where: { id: tokenCart.id } });
      expect(postSend?.status).toBe('open');
      expect(postSend?.recoveredAt).toBeNull();
    });

    test('GET /api/platform/abandoned-carts filters by seen window', async () => {
      const now = new Date();
      const older = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'seen-old',
          email: 'seen-old@example.com',
          status: 'open',
          lastSeenAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
        }
      });
      const newer = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'seen-new',
          email: 'seen-new@example.com',
          status: 'open',
          lastSeenAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
        }
      });

      const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // last 2 days
      const res = await request(app)
        .get(`/api/platform/abandoned-carts?seenSince=${encodeURIComponent(since)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Only "newer" should qualify in the last 2 days window
      const ids = res.body.carts.map((c: any) => c.sessionId);
      expect(ids).toContain('seen-new');
      // may contain other test carts created recently; ensure the old one is excluded
      expect(ids).not.toContain('seen-old');
    });

    test('POST /:id/discard marks cart as discarded with audit', async () => {
      const discardCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'discard-session',
          email: 'discard@cart.example',
          status: 'open'
        }
      });

      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/platform/abandoned-carts/${discardCart.id}/discard`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('discarded');

      // Verify audit event
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'abandoned_cart.discarded',
          resourceId: discardCart.id
        })
      );

      // Verify platform event
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.abandoned_cart.discarded',
        expect.objectContaining({ cartId: discardCart.id })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('markRecovered(sessionId) sets recovered status & recoveredAt and emits recovered event', async () => {
      const toRecover = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'will-recover-session',
          email: 'willrecover@cart.example',
          status: 'open',
          lastSeenAt: new Date()
        }
      });

      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const result = await PlatformAbandonedCartService.markRecovered(toRecover.sessionId);

      expect(result.status).toBe('recovered');
      // Assert recoveredAt is a valid, recent timestamp (avoid cross-realm Date issues)
      expect(result.recoveredAt).toBeTruthy();
      const recoveredAtMs = new Date(result.recoveredAt as any).getTime();
      expect(Number.isFinite(recoveredAtMs)).toBe(true);
      expect(recoveredAtMs).toBeGreaterThan(Date.now() - 60 * 1000);
      expect(recoveredAtMs).toBeLessThan(Date.now() + 5 * 1000);

      // Verify the recovered event was emitted (matches your event naming scheme)
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.abandoned_cart.recovered',
        expect.objectContaining({
          cartId: result.id,
          sessionId: toRecover.sessionId
        })
      );

      eventSpy.mockRestore();
    });

    test('job increments reminderCount and preserves UTM data', async () => {
      const emailSpy = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue(undefined as any);
      
      const jobCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'job-test-session',
          email: 'job@cart.example',
          planId: 'plan_job',
          status: 'open',
          utm: { source: 'facebook', campaign: 'signup' },
          reminderCount: 0,
          lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        }
      });

      await PlatformAbandonedCartJob.processAbandonedCarts();

      const updatedCart = await prisma.platformAbandonedCart.findUnique({
        where: { id: jobCart.id }
      });

      expect(updatedCart?.reminderCount).toBe(1);
      expect(updatedCart?.utm).toEqual({ source: 'facebook', campaign: 'signup' });

      emailSpy.mockRestore();
    });

    test('job skips carts with email=null and cleanup removes old open/discarded carts', async () => {
      const emailSpy = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue(undefined as any);

      // Create cart without email
      const noEmailCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'no-email-session',
          email: null,
          status: 'open',
          reminderCount: 0,
          lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        }
      });

      // Create old open cart for cleanup (no email so job won't touch it)
      const oldCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'old-session',
          email: null,
          status: 'open',
          lastSeenAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000) // 95 days ago
        }
      });

      // Create old discarded cart for cleanup
      const oldDiscarded = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'old-discarded',
          email: 'old-disc@cart.example',
          status: 'discarded',
          lastSeenAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000)
        }
      });

      await PlatformAbandonedCartJob.processAbandonedCarts();
      await PlatformAbandonedCartJob.cleanupOldCarts();

      // Email should not have been sent for cart without email
      expect(emailSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          to: null
        })
      );

      // Old cart should be cleaned up
      const deletedCart = await prisma.platformAbandonedCart.findUnique({
        where: { id: oldCart.id }
      });
      expect(deletedCart).toBeNull();
      const deletedDiscarded = await prisma.platformAbandonedCart.findUnique({
        where: { id: oldDiscarded.id }
      });
      expect(deletedDiscarded).toBeNull();

      // Cart without email should still exist
      const existingCart = await prisma.platformAbandonedCart.findUnique({
        where: { id: noEmailCart.id }
      });
      expect(existingCart).toBeTruthy();

      emailSpy.mockRestore();
    });

    test('GET /stats/overview returns cart statistics', async () => {
      const res = await request(app)
        .get('/api/platform/abandoned-carts/stats/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('openCarts');
      expect(res.body).toHaveProperty('recoveredCarts');
      expect(res.body).toHaveProperty('discardedCarts');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('recoveryRate');
      expect(typeof res.body.recoveryRate).toBe('number');
    });
  });

  describe('Sad Paths', () => {
    test('recover cart twice with same link returns 409', async () => {
      const recoverCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'recover-twice-session',
          email: 'twice@cart.example',
          status: 'open'
        }
      });

      // First recovery
      const emailSpy = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue(undefined as any);
      
      const first = await request(app)
        .post(`/api/platform/abandoned-carts/${recoverCart.id}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(first.status).toBe(200);

      // Mark as recovered
      await prisma.platformAbandonedCart.update({
        where: { id: recoverCart.id },
        data: { status: 'recovered', recoveredAt: new Date() }
      });

      // Second recovery should fail
      const second = await request(app)
        .post(`/api/platform/abandoned-carts/${recoverCart.id}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(second.status).toBe(409);
      expect(second.body.error).toMatch(/recovered/i);

      emailSpy.mockRestore();
    });

    test('recover cart with email=null returns 400', async () => {
      const noEmailCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'no-email-recover',
          email: null,
          status: 'open'
        }
      });

      const res = await request(app)
        .post(`/api/platform/abandoned-carts/${noEmailCart.id}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    test('recover already discarded cart returns 410', async () => {
      const discardedCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'discarded-recover',
          email: 'discarded@cart.example',
          status: 'discarded'
        }
      });

      const res = await request(app)
        .post(`/api/platform/abandoned-carts/${discardedCart.id}/recover`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(410);
      expect(res.body.error).toMatch(/discarded|gone/i);
    });

    test('operations on non-existent cart return 404', async () => {
      const recover = await request(app)
        .get('/api/platform/abandoned-carts/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(recover.status).toBe(404);

      const discard = await request(app)
        .post('/api/platform/abandoned-carts/non-existent-id/discard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(discard.status).toBe(404);
    });

    test('operations without proper permissions return 403', async () => {
      // Create user without permissions
      const noPermUser = await prisma.platformUser.create({
        data: {
          email: 'noperm@platform.test',
          name: 'No Permissions',
          status: 'active'
        }
      });

      const jti = crypto.randomUUID();
      const noPermToken = signPlatformAccess({
        sub: noPermUser.id,
        email: 'noperm@platform.test',
        roles: [],
        permissions: []
      }, jti);

      await PlatformSessionService.create(noPermUser.id, jti);

      const res = await request(app)
        .get('/api/platform/abandoned-carts')
        .set('Authorization', `Bearer ${noPermToken}`);

      expect(res.status).toBe(403);

      await prisma.platformUser.delete({ where: { id: noPermUser.id } });
    });
  });

  describe('Job Processing', () => {
    test('job processes carts at different reminder stages', async () => {
      const emailSpy = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue(undefined as any);
      
      const now = new Date();
      await prisma.platformAbandonedCart.createMany({
        data: [
          {
            sessionId: 'stage1',
            email: 'stage1@example.com',
            status: 'open',
            reminderCount: 0,
            lastSeenAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2 hours
          },
          {
            sessionId: 'stage2',
            email: 'stage2@example.com',
            status: 'open',
            reminderCount: 1,
            lastSeenAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) // 25 hours
          },
          {
            sessionId: 'stage3',
            email: 'stage3@example.com',
            status: 'open',
            reminderCount: 2,
            lastSeenAt: new Date(now.getTime() - 73 * 60 * 60 * 1000) // 73 hours
          }
        ]
      });

      await PlatformAbandonedCartJob.processAbandonedCarts();

      // In a shared DB, more than 3 carts may qualify. Assert that each stage template was sent at least once.
      const calls = emailSpy.mock.calls.map(c => c[0]);
      
      expect(calls.some(call =>
        call.template === 'platform-cart-reminder-1' &&
        call.to === 'stage1@example.com'
      )).toBe(true);

      expect(calls.some(call =>
        call.template === 'platform-cart-reminder-2' &&
        call.to === 'stage2@example.com'
      )).toBe(true);

      expect(calls.some(call =>
        call.template === 'platform-cart-reminder-3' &&
        call.to === 'stage3@example.com'
      )).toBe(true);

      emailSpy.mockRestore();
    });

    test('cleanup removes old carts over 90 days', async () => {
      const veryOldCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'very-old-session',
          email: 'old@cart.example',
          status: 'open',
          lastSeenAt: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000) // 95 days ago
        }
      });

      const recentCart = await prisma.platformAbandonedCart.create({
        data: {
          sessionId: 'recent-session',
          email: 'recent@cart.example',
          status: 'open',
          lastSeenAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
        }
      });

      await PlatformAbandonedCartJob.cleanupOldCarts();

      const oldExists = await prisma.platformAbandonedCart.findUnique({
        where: { id: veryOldCart.id }
      });
      expect(oldExists).toBeNull();

      const recentExists = await prisma.platformAbandonedCart.findUnique({
        where: { id: recentCart.id }
      });
      expect(recentExists).toBeTruthy();
    });
  });
});