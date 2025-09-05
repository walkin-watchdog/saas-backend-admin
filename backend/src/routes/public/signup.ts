import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { PublicSignupRequest, PublicSignupResponse } from '../../types/public';
import { SubscriptionService } from '../../services/subscriptionService';
import { eventBus, PUBLIC_EVENTS } from '../../utils/eventBus';
import { verifyPublicCaptcha } from '../../utils/publicCaptcha';
import { GatewayCredentialResolver } from '../../services/gatewayCredentialResolver';
import { prisma } from '../../utils/prisma';
import { EmailService } from '../../services/emailService';
import { withTenantContext } from '../../middleware/tenantMiddleware';
import { publicSensitiveLimiter } from '../../middleware/rateLimit';
import { PlatformAbandonedCartService } from '../../services/platformAbandonedCartService';
import { PlatformConfigService } from '../../services/platformConfigService';
import { hashToken } from '../../utils/tokenHash';

const router = express.Router();

const schema = z.object({
  companyName: z.string().min(1),
  ownerEmail: z.string().email(),
  password: z.string().min(6),
  planId: z.string(),
  currency: z.enum(['USD', 'INR']).optional(),
  couponCode: z.string().optional(),
  captcha: z.string().optional(),
  recovery: z.string().optional(),
});

function deriveTenantCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

/** Map platform credential errors to a stable wire error code */
function platformCredErrorCode(err: unknown): 'CONFIG_MISSING_PLATFORM' | 'CREDENTIAL_SCOPE_VIOLATION' | undefined {
  const e = err as any;
  const code = e?.code as string | undefined;
  if (code === 'CONFIG_MISSING_PLATFORM') return 'CONFIG_MISSING_PLATFORM';
  if (code === 'CREDENTIAL_SCOPE_VIOLATION') return 'CREDENTIAL_SCOPE_VIOLATION';
  const msg = (e?.message || '') as string;
  if (msg.includes('CONFIG_MISSING_PLATFORM')) return 'CONFIG_MISSING_PLATFORM';
  if (msg.includes('CREDENTIAL_SCOPE_VIOLATION')) return 'CREDENTIAL_SCOPE_VIOLATION';
  return undefined;
}

/** Best-effort cleanup if something fails after creating tenant/user */
async function cleanupTenantAndOwner(tenantId: string) {
  try {
    // Prefer deleting the tenant and let FK cascades clean dependent rows.
    await prisma.tenant.delete({ where: { id: tenantId } });
  } catch {
    // Swallow cleanup errors – we don't want to mask the original failure.
  }
}

router.post('/', publicSensitiveLimiter, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', issues: parsed.error.issues });
    }
    const body = parsed.data as PublicSignupRequest & { captcha?: string };
    const captchaOk = await verifyPublicCaptcha(body.captcha);
    if (!captchaOk) return res.status(400).json({ error: 'CAPTCHA_FAILED' });
    const tenantCode = deriveTenantCode(body.companyName);
    let recoverySessionId: string | null = null;
    let recoveryTokenKey: string | null = null;

    if (body.recovery) {
      const tokenHash = hashToken(body.recovery);
      const key = `cart_recovery_${tokenHash}`;
      const configEntry = await PlatformConfigService.getConfigEntry(key, 'platform');
      if (!configEntry || !configEntry.expiresAt || new Date() > configEntry.expiresAt) {
        return res.status(400).json({ error: 'INVALID_RECOVERY_TOKEN' });
      }
      const config = await PlatformConfigService.getConfig<{ sessionId: string }>(key, 'platform');
      if (!config || !config.sessionId) {
        return res.status(400).json({ error: 'INVALID_RECOVERY_TOKEN' });
      }
      recoverySessionId = config.sessionId;
      recoveryTokenKey = key;
    }
    const key = (req.header('Idempotency-Key') || '').trim();

    let attempt = key
      ? await prisma.publicSignupAttempt.findUnique({ where: { idempotencyKey: key } })
      : await prisma.publicSignupAttempt.findUnique({ where: { ownerEmail_tenantCode: { ownerEmail: body.ownerEmail, tenantCode } } });
    if (attempt) {
      return res.status(200).json({ ...(attempt.response as any), idempotent: true });
    }

    // --- Preflight platform credentials BEFORE any DB mutations (prevents orphans) ---
    try {
      await GatewayCredentialResolver('platform');
    } catch (e) {
      const code = platformCredErrorCode(e) || 'CONFIG_MISSING_PLATFORM';
      // Surface a structured, stable error code as required.
      return res.status(503).json({ error: code });
    }

    const planById = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!planById) {
      return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    }
    if (!planById.public || !planById.active) {
      return res.status(403).json({ error: 'PLAN_NOT_AVAILABLE' });
    }
    const plan = planById;

    // Create tenant + owner user, then attempt subscription.
    // If subscription creation fails, cleanup tenantuser to avoid orphans.
    let tenant: { id: string } | undefined = undefined;
    let user: { id: string } | undefined = undefined;
    try {
      tenant = await prisma.tenant.create({ data: { name: body.companyName } });
      const hashed = await bcrypt.hash(body.password, 10);
      // Encode tenantId into the token so we can open the correct RLS context when verifying.
      const verificationToken = `${tenant.id}.${randomUUID()}`
      const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      // IMPORTANT: user creation must occur inside the tenant context for RLS.
      user = await withTenantContext({ id: tenant.id } as any, async (tenantPrisma) => {
        return (tenantPrisma as typeof prisma).user.create({
          data: {
            tenantId: tenant!.id,
            email: body.ownerEmail,
            password: hashed,
            name: body.ownerEmail,
            role: 'ADMIN',
            emailVerified: false,
            verificationToken,
            verificationTokenExpiry: verificationExpiry,
          },
          select: { id: true },
        });
      });

      const trialEnabled = process.env.PUBLIC_SIGNUP_TRIAL_DISABLED !== 'true';
      const subResult = await SubscriptionService.createSubscription(tenant.id, plan.id, {
        couponCode: body.couponCode,
        trial: trialEnabled,
        currency: body.currency || 'USD',
      });

      await withTenantContext({ id: tenant.id } as any, async () => {
        const verifyUrl =
          `${process.env.PUBLIC_BASE_URL || ''}/public/verify-email/${encodeURIComponent(verificationToken)}`;
        await EmailService.sendEmail({
          to: body.ownerEmail,
          subject: 'Verify your email',
          text: `Click to verify: ${verifyUrl}`,
        });
      });

      eventBus.publish(PUBLIC_EVENTS.TENANT_SIGNUP_COMPLETED, { tenantId: tenant.id, tenantCode });
      eventBus.publish(PUBLIC_EVENTS.USER_SIGNUP_COMPLETED, { userId: user.id, tenantId: tenant.id });

      const resp: PublicSignupResponse = {
        tenantId: tenant.id,
        ownerUserId: user.id,
        subscriptionId: (subResult as any)?.id,
        checkoutUrl: (subResult as any)?.checkoutUrl,
      };

      const storedKey = key || crypto.randomUUID();
      await prisma.publicSignupAttempt.create({
        data: {
          ownerEmail: body.ownerEmail,
          tenantCode,
          idempotencyKey: storedKey,
          response: resp as any,
        },
      });

      if (recoverySessionId) {
        try {
          await PlatformAbandonedCartService.markRecovered(recoverySessionId);
          await PlatformConfigService.deleteConfig(recoveryTokenKey!, undefined, 'platform');
        } catch {
          // swallow errors
        }
      }

      return res.status(201).json(resp);
    } catch (err) {
      // Roll back partial writes if we created a tenant and something after that failed.
      if (tenant?.id) {
        await cleanupTenantAndOwner(tenant.id);
      }
      // Concurrency: if idempotency insert races, translate to idempotent response
      const anyErr = err as any;
      if (anyErr?.code === 'P2002') {
        try {
          const attemptAfter = key
            ? await prisma.publicSignupAttempt.findUnique({ where: { idempotencyKey: key } })
            : await prisma.publicSignupAttempt.findUnique({
                where: { ownerEmail_tenantCode: { ownerEmail: body.ownerEmail, tenantCode } },
              });
          if (attemptAfter?.response) {
            return res.status(200).json({ ...(attemptAfter.response as any), idempotent: true });
          }
        } catch {
          // fall through to generic handling
        }
      }
      // Return structured error if this was a platform credential problem
      const code = platformCredErrorCode(err);
      if (code) {
        return res.status(503).json({ error: code });
      }
      // If subscription creation failed for other reasons, surface a stable error
      return res.status(502).json({ error: 'SUBSCRIPTION_CREATE_FAILED' });
    }
  } catch (err) {
    next(err);
  }
});

export default router;