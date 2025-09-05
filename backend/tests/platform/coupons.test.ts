import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { signPlatformAccess } from '../../src/utils/platformJwt';
import { PlatformSessionService } from '../../src/services/platformSessionService';
import { PlatformCouponService } from '../../src/services/platformCouponService';
import { AuditService } from '../../src/services/auditService';
import { PlatformEventBus } from '../../src/utils/platformEvents';
import crypto from 'crypto';

describe('Platform Coupons & Discounts', () => {
  let adminToken: string;
  let adminUser: any;
  let plan: any;

  beforeAll(async () => {
    // Create permissions and role
    const permissions = await prisma.platformPermission.createMany({
      data: [
        { code: 'coupons.read', description: 'Read coupons' },
        { code: 'coupons.write', description: 'Write coupons' },
        { code: 'coupons.redeem', description: 'Redeem coupons' }
      ]
    });

    const adminRole = await prisma.platformRole.create({
      data: {
        code: 'coupon_admin',
        name: 'Coupon Admin',
        description: 'Coupon management'
      }
    });

    const perms = await prisma.platformPermission.findMany({
      where: { code: { in: ['coupons.read', 'coupons.write', 'coupons.redeem'] } }
    });

    await prisma.platformRolePermission.createMany({
      data: perms.map(p => ({
        platformRoleId: adminRole.id,
        permissionId: p.id
      }))
    });

    adminUser = await prisma.platformUser.create({
      data: {
        email: 'coupon@platform.test',
        name: 'Coupon Admin',
        passwordHash: await require('bcrypt').hash('password123', 12),
        status: 'active',
        mfaEnabled: true
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
      email: 'coupon@platform.test',
      roles: ['coupon_admin'],
      permissions: ['coupons.read', 'coupons.write', 'coupons.redeem']
    }, jti);

    await PlatformSessionService.create(adminUser.id, jti);
    
    // Create test plan with prices
    plan = await prisma.plan.create({
      data: {
        code: 'coupon_plan',
        billingFrequency: 'monthly',
        marketingName: 'Coupon Plan',
        marketingDescription: 'Plan for coupon testing',
        featureHighlights: [],
        public: true,
        active: true,
        prices: {
          create: [
            { currency: 'USD', period: 'monthly', amountInt: 1000 },
            { currency: 'USD', period: 'yearly', amountInt: 10000 },
            { currency: 'INR', period: 'monthly', amountInt: 80000 },
            { currency: 'INR', period: 'yearly', amountInt: 800000 }
          ]
        }
      },
      include: { prices: true }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.couponRedemption.deleteMany();
    await prisma.couponEntitlement.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.platformCoupon.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.platformUserRole.deleteMany();
    await prisma.platformRolePermission.deleteMany();
    await prisma.platformUser.deleteMany();
    await prisma.platformRole.deleteMany();
    await prisma.platformPermission.deleteMany();
  });

  describe('Happy Paths', () => {
    test('CRUD operations on coupons work correctly', async () => {
      const auditSpy = jest.spyOn(AuditService, 'log').mockResolvedValue();
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      // Create coupon
      const couponData = {
        code: 'SAVE20',
        type: 'percent' as const,
        amount: 20,
        duration: 'once' as const,
        appliesToPlanIds: [plan.id],
        maxRedemptions: 100,
        redeemBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const createRes = await request(app)
        .post('/api/platform/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(couponData);

      expect(createRes.status).toBe(201);
      expect(createRes.body.code).toBe('SAVE20');
      expect(eventSpy).toHaveBeenCalledWith(
        'platform.coupon.created',
        expect.objectContaining({ couponId: createRes.body.id })
      );

      const couponId = createRes.body.id;

      // Read coupon
      const readRes = await request(app)
        .get('/api/platform/coupons')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.coupons).toContainEqual(
        expect.objectContaining({ code: 'SAVE20' })
      );

      // Update coupon
      const updateRes = await request(app)
        .put(`/api/platform/coupons/${couponId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 25,
          maxRedemptions: 50
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.amount).toBe(25);

      // Deactivate coupon
      const deactivateRes = await request(app)
        .post(`/api/platform/coupons/${couponId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deactivateRes.status).toBe(200);

      const activateRes = await request(app)
        .post(`/api/platform/coupons/${couponId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(activateRes.status).toBe(200);
      expect(activateRes.body.active).toBe(true);
      expect(deactivateRes.body.active).toBe(false);

      // Reactivate toggles availability back on
      const reactivateRes = await request(app)
        .put(`/api/platform/coupons/${couponId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: true });
      expect(reactivateRes.status).toBe(200);

      const validAgain = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'SAVE20', planId: plan.id });
      expect(validAgain.status).toBe(200);
      expect(validAgain.body.valid).toBe(true);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'coupon.created'
        })
      );

      auditSpy.mockRestore();
      eventSpy.mockRestore();
    });

    test('coupon validation and preview work correctly', async () => {
      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'PREVIEW10',
          type: 'percent',
          amount: 10,
          duration: 'once',
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id
        }
      });

      // Validate coupon
      const validateRes = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'PREVIEW10',
          planId: plan.id
        });

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.valid).toBe(true);
      expect(validateRes.body.coupon.code).toBe('PREVIEW10');

      // Preview discount
      const previewRes = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'PREVIEW10',
          planId: plan.id,
          amount: 1000
        });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.valid).toBe(true);
      expect(previewRes.body.discount).toBe(100); // 10% of 1000
      expect(previewRes.body.finalAmount).toBe(900);

      // Repeating coupon preview requires subscriptionId and computes discount correctly
      const tenantR = await prisma.tenant.create({ data: { name: 'Preview Repeating T', status: 'active' } });
      const subR = await prisma.subscription.create({ data: { tenantId: tenantR.id, planId: plan.id, status: 'active' } });
      const repeat = await prisma.platformCoupon.create({
        data: {
          code: 'REP15',
          type: 'percent',
          amount: 15,
          duration: 'repeating',
          durationInMonths: 3,
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id
        }
      });
      const repeatingPreview = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'REP15', planId: plan.id, amount: 2000, subscriptionId: subR.id });
      expect(repeatingPreview.status).toBe(200);
      expect(repeatingPreview.body.discount).toBe(300);
      expect(repeatingPreview.body.finalAmount).toBe(1700);

      // Forever coupon preview requires subscriptionId
      await prisma.platformCoupon.create({
        data: {
          code: 'FOREVER5',
          type: 'percent',
          amount: 5,
          duration: 'forever',
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id
        }
      });
      const foreverMissing = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'FOREVER5', planId: plan.id, amount: 1000 });
      expect(foreverMissing.status).toBe(400);
      const foreverPreview = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'FOREVER5', planId: plan.id, amount: 1000, subscriptionId: subR.id });
      expect(foreverPreview.status).toBe(200);
      expect(foreverPreview.body.discount).toBe(50);

      // Fixed + forever preview (requires subscriptionId)
      await prisma.platformCoupon.create({
        data: {
          code: 'FOREVER200FIX',
          type: 'fixed',
          amount: 200,
          amountUsd: 200,
          amountInr: 100,
          duration: 'forever',
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id
        }
      });
      const fixedForeverMissing = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'FOREVER200FIX', planId: plan.id, amount: 1000 });
      expect(fixedForeverMissing.status).toBe(400);
      const fixedForeverPreview = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'FOREVER200FIX', planId: plan.id, amount: 1000, subscriptionId: subR.id });
      expect(fixedForeverPreview.status).toBe(200);
      expect(fixedForeverPreview.body.discount).toBe(200);

      // Cleanup
      await prisma.subscription.delete({ where: { id: subR.id } });
      await prisma.tenant.delete({ where: { id: tenantR.id } });
    });

    test('coupon redemption with idempotency key', async () => {
      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'REDEEM50',
          type: 'fixed',
          amount: 50,
          amountUsd: 50,
          amountInr: 50,
          duration: 'once',
          maxRedemptions: 10,
          active: true,
          createdById: adminUser.id
        }
      });

      const tenant = await prisma.tenant.create({
        data: { name: 'Redeem Test', status: 'active' }
      });

      const subscription = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'active'
        }
      });

      const redeemData = {
        couponCode: 'REDEEM50',
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        amountApplied: 50,
        currency: 'USD'
      };

      // First redemption
      const res1 = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'redeem-123')
        .send(redeemData);

      expect(res1.status).toBe(200);

      // Second redemption with same key should be idempotent
      const res2 = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'redeem-123')
        .send(redeemData);

      expect(res2.status).toBe(200);
      expect(res2.body.redemptionKey).toBe('redeem-123');

      // Verify only one redemption was created
      const redemptions = await prisma.couponRedemption.findMany({
        where: { couponId: coupon.id }
      });

      expect(redemptions).toHaveLength(1);

      // Cleanup
      await prisma.subscription.delete({ where: { id: subscription.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('apply restricted coupon when plan matches → redemption recorded', async () => {
      const restricted = await prisma.platformCoupon.create({
        data: {
          code: 'MATCHONLY',
          type: 'fixed',
          amount: 100,
          amountUsd: 100,
          amountInr: 100,
          duration: 'once',
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id
        }
      });
      const tenant = await prisma.tenant.create({ data: { name: 'Match Tenant', status: 'active' } });
      const subscription = await prisma.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: 'active' }
      });
      const res = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'MATCHONLY',
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          amountApplied: 100,
          currency: 'USD'
        });
      expect(res.status).toBe(200);
      const redemptionCount = await prisma.couponRedemption.count({ where: { couponId: restricted.id } });
      expect(redemptionCount).toBe(1);
      await prisma.subscription.delete({ where: { id: subscription.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('apply honors subscription currency even if request currency differs', async () => {
      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'CURRMISMATCH',
          type: 'fixed',
          amount: 100,
          amountUsd: 100,
          amountInr: 1000,
          duration: 'once',
          active: true,
          createdById: adminUser.id,
        },
      });

      const tenant = await prisma.tenant.create({ data: { name: 'CurrMismatch', status: 'active' } });
      const subscription = await prisma.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: 'active', currency: 'USD' },
      });

      const res = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'CURRMISMATCH',
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          amountApplied: 100,
          currency: 'INR',
        });

      expect(res.status).toBe(200);

      const redemption = await prisma.couponRedemption.findUnique({ where: { id: res.body.id } });
      expect(redemption?.currency).toBe('USD');
      expect(redemption?.amountApplied).toBe(100);

      await prisma.couponRedemption.delete({ where: { id: res.body.id } });
      await prisma.subscription.delete({ where: { id: subscription.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
      await prisma.platformCoupon.delete({ where: { id: coupon.id } });
    });

    test('GET /api/platform/coupons/:id/usage shows redemption history', async () => {
      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'USAGE_TEST',
          type: 'percent',
          amount: 15,
          duration: 'once',
          active: true,
          createdById: adminUser.id
        }
      });

      const tenant = await prisma.tenant.create({
        data: { name: 'Usage Test', status: 'active' }
      });

      // Create a redemption
      await prisma.couponRedemption.create({
        data: {
          couponId: coupon.id,
          tenantId: tenant.id,
          amountApplied: 150,
          redemptionKey: 'usage-key-1'
        }
      });

      const res = await request(app)
        .get(`/api/platform/coupons/${coupon.id}/usage`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].amountApplied).toBe(150);

      // Cleanup
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('repeating coupon creates entitlement and decrements on invoice', async () => {
      // Create tenant and subscription
      const tenant = await prisma.tenant.create({ data: { name: 'EntTenant' } });
      const subscription = await prisma.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: 'active' },
      });

      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'REPEAT50',
          type: 'percent',
          amount: 50,
          duration: 'repeating',
          durationInMonths: 2,
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id,
        },
      });

      // Apply coupon to subscription
      await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'REPEAT50',
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          amountApplied: 0,
          planId: plan.id,
          currency: 'USD',
        })
        .expect(200);

      let entitlement = await prisma.couponEntitlement.findUnique({
        where: {
          subscriptionId_couponId: { subscriptionId: subscription.id, couponId: coupon.id },
        },
      });
      expect(entitlement?.remainingPeriods).toBe(2);

      // Simulate invoice generation applying discount
      const getPrice = (currency: string, period: string) =>
        plan.prices.find(p => p.currency === currency && p.period === period)?.amountInt ?? 0;
      const baseAmount = getPrice('USD', 'monthly'); // in cents
      const discount = Math.round((baseAmount * 50) / 100);
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          amount: baseAmount - discount,
          status: 'paid',
          number: 'INV-ENT-1',
          priceSnapshot: {
            currency: 'USD',
            monthly: getPrice('USD', 'monthly'),
            yearly: getPrice('USD', 'yearly'),
          },
          taxSnapshot: { percent: 0, amount: 0 },
          taxPercent: 0,
          taxAmount: 0,
          planVersion: plan.version,
          usageAmount: 0,
        },
      });

      await prisma.couponRedemption.create({
        data: {
          couponId: coupon.id,
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          amountApplied: discount / 100,
          currency: 'USD',
          redemptionKey: 'inv-ent-1',
        },
      });
      await prisma.couponEntitlement.update({
        where: { id: entitlement!.id },
        data: { remainingPeriods: { decrement: 1 } },
      });

      entitlement = await prisma.couponEntitlement.findUnique({
        where: {
          subscriptionId_couponId: { subscriptionId: subscription.id, couponId: coupon.id },
        },
      });
      expect(entitlement?.remainingPeriods).toBe(1);

      const validation = await PlatformCouponService.validateCoupon(
        'REPEAT50',
        plan.id,
        subscription.id,
      );
      expect(validation.valid).toBe(false);
    });
  });

  describe('Sad Paths', () => {
    test('validate/apply unknown coupon return 404', async () => {
      const v = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'NOPE123', planId: plan.id });
      expect(v.status).toBe(404);
      expect(v.body.valid).toBe(false);
      expect(v.body.error).toBe('Coupon not found');

      const a = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'NOPE123', tenantId: 't-unknown', amountApplied: 0, planId: plan.id, currency: 'USD' });
      expect(a.status).toBe(404);
      expect(a.body.error).toBe('Coupon not found');
    });
    test('create rejects percent > 100', async () => {
      const res = await request(app)
        .post('/api/platform/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'BADPCT',
          type: 'percent',
          amount: 150,
          duration: 'once'
        });
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body?.issues)).toBe(true);
      expect(res.body.issues.some((i: any) => /percent.*≤\s*100/i.test(i.message))).toBe(true);
    });

    test('create rejects fixed without currency', async () => {
      const res = await request(app)
        .post('/api/platform/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'FIXNOCURR',
          type: 'fixed',
          amount: 200,
          duration: 'once'
        });
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body?.issues)).toBe(true);
      expect(res.body.issues.some((i: any) => /amountUsd.*amountInr.*required/i.test(i.message))).toBe(true);
    });

    test('activate non-existent coupon returns 404', async () => {
      const res = await request(app)
        .post('/api/platform/coupons/nonexistent/activate')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
    test('exceeded max redemptions returns 409', async () => {
      const limitedCoupon = await prisma.platformCoupon.create({
        data: {
          code: 'LIMITED1',
          type: 'fixed',
          amount: 10,
          amountUsd: 10,
          amountInr: 10,
          duration: 'once',
          maxRedemptions: 1,
          active: true,
          createdById: adminUser.id
        }
      });

      const tenant = await prisma.tenant.create({
        data: { name: 'Limited Test', status: 'active' }
      });

      // Use up the single redemption
      await prisma.couponRedemption.create({
        data: {
          couponId: limitedCoupon.id,
          tenantId: tenant.id,
          amountApplied: 10,
          redemptionKey: 'first-redemption'
        }
      });

      // Try to redeem again
      const res = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'LIMITED1',
          tenantId: tenant.id,
          amountApplied: 10,
          currency: 'USD'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Maximum redemptions reached');

      // Cleanup
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('expired coupon returns 410 (validate and apply)', async () => {
      const expiredCoupon = await prisma.platformCoupon.create({
        data: {
          code: 'EXPIRED1',
          type: 'percent',
          amount: 20,
          duration: 'once',
          redeemBy: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired yesterday
          active: true,
          createdById: adminUser.id
        }
      });

      const res = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'EXPIRED1',
          planId: plan.id
        });

      expect(res.status).toBe(410);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBe('Coupon has expired');

      const tenant = await prisma.tenant.create({ data: { name: 'Expired T', status: 'active' } });
      const applyRes = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'EXPIRED1', tenantId: tenant.id, amountApplied: 0, planId: plan.id, currency: 'USD' });
      expect(applyRes.status).toBe(410);
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('coupon not applicable to plan returns 422', async () => {
      const otherPlan = await prisma.plan.create({
        data: {
          code: 'other_plan',
          billingFrequency: 'monthly',
          marketingName: 'Other Plan',
          marketingDescription: 'Different plan',
          featureHighlights: [],
          public: true,
          active: true,
          prices: {
            create: [
              { currency: 'USD', period: 'monthly', amountInt: 500 },
              { currency: 'USD', period: 'yearly', amountInt: 5000 }
            ]
          }
        },
        include: { prices: true }
      });

      const restrictedCoupon = await prisma.platformCoupon.create({
        data: {
          code: 'RESTRICTED',
          type: 'fixed',
          amount: 100,
          amountUsd: 100,
          amountInr: 100,
          duration: 'once',
          appliesToPlanIds: [plan.id], // only applies to specific plan
          active: true,
          createdById: adminUser.id
        }
      });

      const res = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'RESTRICTED',
          planId: otherPlan.id // different plan
        });

      expect(res.status).toBe(422);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBe('Coupon not applicable to this plan');

      // Also fails on /apply with 422
      const tenant = await prisma.tenant.create({ data: { name: 'Wrong Plan T', status: 'active' } });
      const applyRes = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'RESTRICTED', tenantId: tenant.id, amountApplied: 100, planId: otherPlan.id, currency: 'USD' });
      expect(applyRes.status).toBe(422);
      await prisma.tenant.delete({ where: { id: tenant.id } });

      // Cleanup
      await prisma.plan.delete({ where: { id: otherPlan.id } });
    });

    test('validate requires planId when coupon is plan-restricted (400)', async () => {
      await prisma.platformCoupon.create({
        data: {
          code: 'RESTRICTS_PLAN',
          type: 'percent',
          amount: 10,
          duration: 'once',
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id
        }
      });
      const res = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'RESTRICTS_PLAN' }); // no planId
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBe('Plan ID required to validate this coupon');
    });

    test('apply requires planId when coupon is plan-restricted (400)', async () => {
      await prisma.platformCoupon.create({
        data: {
          code: 'APPLY_NEEDS_PLAN',
          type: 'fixed',
          amount: 50,
          amountUsd: 50,
          amountInr: 50,
          duration: 'once',
          appliesToPlanIds: [plan.id],
          active: true,
          createdById: adminUser.id
        }
      });
      const tenant = await prisma.tenant.create({ data: { name: 'PlanReq', status: 'active' } });
      const res = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'APPLY_NEEDS_PLAN',
          tenantId: tenant.id,
          amountApplied: 50,
          currency: 'USD'
        }); // missing planId
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Plan ID is required to apply this coupon');
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('creating a duplicate coupon code returns 409', async () => {
      const payload = {
        code: 'DUPL_CODE',
        type: 'percent' as const,
        amount: 5,
        duration: 'once' as const,
      };
      const first = await request(app)
        .post('/api/platform/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);
      expect(first.status).toBe(201);
      const dup = await request(app)
        .post('/api/platform/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);
      expect(dup.status).toBe(409);
      expect(dup.body.message).toBe('Coupon code already exists');
    });

    test('update to type=fixed without currency returns 400', async () => {
      const created = await prisma.platformCoupon.create({
        data: {
          code: 'UP_TO_FIXED',
          type: 'percent',
          amount: 10,
          duration: 'once',
          active: true,
          createdById: adminUser.id
        }
      });
      const res = await request(app)
        .put(`/api/platform/coupons/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'fixed' }); // no currency
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body?.issues)).toBe(true);
      expect(res.body.issues.some((i: any) => /amountUsd.*amountInr.*required/i.test(i.message))).toBe(true);
    });

    test('create repeating without durationInMonths returns 400', async () => {
      const res = await request(app)
        .post('/api/platform/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'REP_NO_MONTHS',
          type: 'percent',
          amount: 10,
          duration: 'repeating',
          active: true
        });
      expect(res.status).toBe(400);
      expect(res.body.issues.some((i: any) => /durationInMonths.*required/i.test(i.message))).toBe(true);
    });

    test('update duration to repeating without durationInMonths returns 400', async () => {
      const c = await prisma.platformCoupon.create({
        data: {
          code: 'UP_REPEATING',
          type: 'percent',
          amount: 10,
          duration: 'once',
          active: true,
          createdById: adminUser.id
        }
      });
      const res = await request(app)
        .put(`/api/platform/coupons/${c.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ duration: 'repeating' }); // missing durationInMonths
      expect(res.status).toBe(400);
      expect(res.body.issues.some((i: any) => /durationInMonths.*required/i.test(i.message))).toBe(true);
    });

    test('applying deactivated coupon returns 409 (validate and apply)', async () => {
      const deactivatedCoupon = await prisma.platformCoupon.create({
        data: {
          code: 'DEACTIVATED',
          type: 'percent',
          amount: 15,
          duration: 'once',
          active: false, // deactivated
          createdById: adminUser.id
        }
      });

      const res = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'DEACTIVATED'
        });

      expect(res.status).toBe(409);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBe('Coupon is inactive');

      const tenant = await prisma.tenant.create({ data: { name: 'Inactive T', status: 'active' } });
      const applyRes = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'DEACTIVATED', tenantId: tenant.id, amountApplied: 0, currency: 'USD' });
      expect(applyRes.status).toBe(409);
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('redeeming with duplicate redemption key is idempotent', async () => {
      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'IDEMPOTENT',
          type: 'fixed',
          amount: 25,
          amountUsd: 25,
          amountInr: 25,
          duration: 'once',
          active: true,
          createdById: adminUser.id
        }
      });

      const tenant = await prisma.tenant.create({
        data: { name: 'Idempotent Test', status: 'active' }
      });

      const redeemData = {
        couponCode: 'IDEMPOTENT',
        tenantId: tenant.id,
        amountApplied: 25,
        currency: 'USD'
      };

      // First redemption
      const res1 = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'duplicate-key')
        .send(redeemData);

      expect(res1.status).toBe(200);

      // Second redemption with same key
      const res2 = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'duplicate-key')
        .send(redeemData);

      expect(res2.status).toBe(200);
      expect(res2.body.redemptionKey).toBe('duplicate-key');

      // Verify only one redemption exists
      const redemptions = await prisma.couponRedemption.findMany({
        where: { couponId: coupon.id }
      });

      expect(redemptions).toHaveLength(1);

      // Cleanup
      await prisma.tenant.delete({ where: { id: tenant.id } });
    });

    test('coupon events are emitted correctly', async () => {
      const eventSpy = jest.spyOn(PlatformEventBus, 'publish').mockImplementation(() => {});

      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'EVENT_TEST',
          type: 'percent',
          amount: 10,
          duration: 'once',
          active: true,
          createdById: adminUser.id
        }
      });

      // Update coupon
      await request(app)
        .put(`/api/platform/coupons/${coupon.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 15 });

      // Deactivate coupon
      await request(app)
        .post(`/api/platform/coupons/${coupon.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(eventSpy).toHaveBeenCalledWith(
        'platform.coupon.updated',
        expect.objectContaining({ couponId: coupon.id })
      );

      expect(eventSpy).toHaveBeenCalledWith(
        'platform.coupon.deactivated',
        expect.objectContaining({ couponId: coupon.id })
      );

      eventSpy.mockRestore();
    });

    test('repeating/forever validate require subscriptionId (400)', async () => {
      await prisma.platformCoupon.create({
        data: {
          code: 'SUBREQ-R',
          type: 'percent',
          amount: 10,
          duration: 'repeating',
          durationInMonths: 2,
          active: true,
          createdById: adminUser.id
        }
      });
      const v1 = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'SUBREQ-R', planId: plan.id });
      expect(v1.status).toBe(400);

      await prisma.platformCoupon.create({
        data: {
          code: 'SUBREQ-F',
          type: 'fixed',
          amount: 100,
          amountUsd: 100,
          amountInr: 100,
          duration: 'forever',
          active: true,
          createdById: adminUser.id
        }
      });
      const v2 = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'SUBREQ-F', planId: plan.id });
      expect(v2.status).toBe(400);
    });

    test('apply repeating/forever coupons require subscriptionId (400)', async () => {
      await prisma.platformCoupon.create({
        data: {
          code: 'APPLY-REP-REQ',
          type: 'percent',
          amount: 10,
          duration: 'repeating',
          durationInMonths: 2,
          active: true,
          createdById: adminUser.id
        }
      });
      const repApply = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'APPLY-REP-REQ', tenantId: 't1', amountApplied: 0, planId: plan.id, currency: 'USD' });
      expect(repApply.status).toBe(400);

      await prisma.platformCoupon.create({
        data: {
          code: 'APPLY-FOR-REQ',
          type: 'fixed',
          amount: 100,
          amountUsd: 100,
          amountInr: 100,
          duration: 'forever',
          active: true,
          createdById: adminUser.id
        }
      });
      const forApply = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ couponCode: 'APPLY-FOR-REQ', tenantId: 't2', amountApplied: 0, planId: plan.id, currency: 'USD' });
      expect(forApply.status).toBe(400);
    });
  });

  describe('Different Coupon Types', () => {
    test('percentage coupon calculates discount correctly', async () => {
      await prisma.platformCoupon.create({
        data: {
          code: 'PERCENT30',
          type: 'percent',
          amount: 30,
          duration: 'once',
          active: true,
          createdById: adminUser.id
        }
      });

      const res = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'PERCENT30',
          planId: plan.id,
          amount: 1000
        });

      expect(res.status).toBe(200);
      expect(res.body.discount).toBe(300); // 30% of 1000
      expect(res.body.finalAmount).toBe(700);
    });

    test('fixed amount coupon calculates discount correctly', async () => {
      await prisma.platformCoupon.create({
        data: {
          code: 'FIXED200',
          type: 'fixed',
          amount: 200,
          amountUsd: 200,
          amountInr: 200,
          duration: 'once',
          active: true,
          createdById: adminUser.id
        }
      });

      const res = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'FIXED200',
          planId: plan.id,
          amount: 1000
        });

      expect(res.status).toBe(200);
      expect(res.body.discount).toBe(200);
      expect(res.body.finalAmount).toBe(800);
    });

    test('preview infers currency from subscription', async () => {
      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'FIXAUTO',
          type: 'fixed',
          amount: 0,
          amountUsd: 200,
          amountInr: 100,
          duration: 'once',
          active: true,
          createdById: adminUser.id,
        },
      });
      const tenantUsd = await prisma.tenant.create({ data: { name: 'USDSub', status: 'active' } });
      const subUsd = await prisma.subscription.create({
        data: { tenantId: tenantUsd.id, planId: plan.id, status: 'active', currency: 'USD' },
      });
      const usdPrev = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'FIXAUTO',
          planId: plan.id,
          amount: 1000,
          subscriptionId: subUsd.id,
          currency: 'INR',
        });
      expect(usdPrev.status).toBe(200);
      expect(usdPrev.body.discount).toBe(200);

      const tenantInr = await prisma.tenant.create({ data: { name: 'INRSub', status: 'active' } });
      const subInr = await prisma.subscription.create({
        data: { tenantId: tenantInr.id, planId: plan.id, status: 'active', currency: 'INR' },
      });
      const inrPrev = await request(app)
        .post('/api/platform/coupons/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'FIXAUTO',
          planId: plan.id,
          amount: 1000,
          subscriptionId: subInr.id,
          currency: 'USD',
        });
      expect(inrPrev.status).toBe(200);
      expect(inrPrev.body.discount).toBe(100);

      await prisma.subscription.deleteMany({ where: { id: { in: [subUsd.id, subInr.id] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantUsd.id, tenantInr.id] } } });
      await prisma.platformCoupon.delete({ where: { id: coupon.id } });
    });

    test('validate uses subscription currency even when mismatched currency supplied', async () => {
      const coupon = await prisma.platformCoupon.create({
        data: {
          code: 'VALFIX',
          type: 'fixed',
          amount: 0,
          amountUsd: 100,
          amountInr: 100,
          duration: 'once',
          active: true,
          createdById: adminUser.id,
        },
      });
      const tenant = await prisma.tenant.create({ data: { name: 'ValT', status: 'active' } });
      const sub = await prisma.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: 'active', currency: 'USD' },
      });
      const res = await request(app)
        .post('/api/platform/coupons/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'VALFIX', planId: plan.id, subscriptionId: sub.id, currency: 'INR' });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.currency).toBe('USD');

      const direct = await PlatformCouponService.validateCoupon('VALFIX', plan.id, sub.id, 'INR');
      expect(direct.currency).toBe('USD');

      await prisma.subscription.delete({ where: { id: sub.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
      await prisma.platformCoupon.delete({ where: { id: coupon.id } });
    });

    test('repeating coupon allows multiple redemptions', async () => {
      const repeatingCoupon = await prisma.platformCoupon.create({
        data: {
          code: 'REPEAT10',
          type: 'percent',
          amount: 10,
          duration: 'repeating',
          durationInMonths: 3,
          active: true,
          createdById: adminUser.id
        }
      });

      const tenant1 = await prisma.tenant.create({
        data: { name: 'Repeat Test 1', status: 'active' }
      });

      const tenant2 = await prisma.tenant.create({
        data: { name: 'Repeat Test 2', status: 'active' }
      });

      const sub1 = await prisma.subscription.create({
        data: { tenantId: tenant1.id, planId: plan.id, status: 'active' }
      });

      const sub2 = await prisma.subscription.create({
        data: { tenantId: tenant2.id, planId: plan.id, status: 'active' }
      });

      // Multiple redemptions should work
      const res1 = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'REPEAT10',
          tenantId: tenant1.id,
          subscriptionId: sub1.id,
          amountApplied: 100,
          currency: 'USD'
        });

      const res2 = await request(app)
        .post('/api/platform/coupons/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          couponCode: 'REPEAT10',
          tenantId: tenant2.id,
          subscriptionId: sub2.id,
          amountApplied: 100,
          currency: 'USD'
        });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Cleanup
      await prisma.subscription.deleteMany({ where: { id: { in: [sub1.id, sub2.id] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenant1.id, tenant2.id] } } });
    });
  });
});