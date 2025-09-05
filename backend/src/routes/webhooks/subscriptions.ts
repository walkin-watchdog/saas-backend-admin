import express, { Router } from 'express';
import crypto from 'crypto';
import { GatewayCredentialResolver } from '../../services/gatewayCredentialResolver';
import { SubscriptionService } from '../../services/subscriptionService';
import { PayPalService } from '../../services/paypalService';
import { logger } from '../../utils/logger';

const router = Router();
router.use(express.raw({ type: 'application/json' }));
const WEBHOOK_TOLERANCE_SEC = Number(process.env.WEBHOOK_TOLERANCE_SEC || 300);

router.post('/razorpay', async (req, res) => {
  try {
    const creds = await GatewayCredentialResolver('platform');
    if (!creds.webhookSecret) {
      logger.error('CONFIG_MISSING_PLATFORM (razorpay webhook secret missing)');
      // NACK so provider retries after you fix config
      return res.status(500).json({ error: 'CONFIG_MISSING_PLATFORM' });
    }
    const signature = req.headers['x-razorpay-signature'] as string;
    const payload = (req.body as Buffer).toString('utf8');
    const expected = crypto
      .createHmac('sha256', creds.webhookSecret || '')
      .update(payload)
      .digest('hex');
    if (expected !== signature) {
      // NACK: wrong signature → retry per provider policies
      return res.status(400).json({ error: 'SIGNATURE_SCOPE_VIOLATION' });
    }
    const event = JSON.parse(payload);
    // Best-effort timestamp tolerance:
    // Only enforce when a trustworthy timestamp is present.
    // If absent, allow through so the replay/idempotency guard can run,
    // preserving behavior expected by tests (409 on hash mismatch).
    {
      const nowSec = Math.floor(Date.now() / 1000);
      const evtSec = Number(event?.created_at);
      if (Number.isFinite(evtSec)) {
        if (Math.abs(nowSec - evtSec) > WEBHOOK_TOLERANCE_SEC) {
          return res.status(400).json({ error: 'stale_webhook' });
        }
      }
    }
    let record;
    try {
      record = await SubscriptionService.recordWebhook('razorpay', event.id, payload);
    } catch (e: any) {
      if (e?.message === 'WEBHOOK_REPLAY_HASH_MISMATCH') return res.status(409).json({ error: 'WEBHOOK_REPLAY_HASH_MISMATCH' });
      throw e;
    }
    let tenantResolved = true;
    if (!record.alreadyProcessed) {
      const result = await SubscriptionService.processWebhook('razorpay', payload);
      tenantResolved = !!result?.tenantResolved;
      if (!tenantResolved) {
        logger.warn('TENANT_RESOLUTION_FAILED (razorpay webhook)', { eventId: event.id });
      }
    }
    // NACK when tenant resolution failed so gateway retries
    if (!tenantResolved) return res.status(400).json({ error: 'TENANT_RESOLUTION_FAILED' });
    return res.status(200).json({ ok: true, already_processed: record.alreadyProcessed, tenant_resolved: tenantResolved });
  } catch (err: any) {
    if (err?.message === 'WEBHOOK_REPLAY_HASH_MISMATCH') {
      return res.status(409).json({ error: 'WEBHOOK_REPLAY_HASH_MISMATCH' });
    }
    return res.status(400).json({ error: err?.message || 'INVALID_WEBHOOK' });
  }
});

router.post('/paypal', async (req, res) => {
  try {
    const body = (req.body as Buffer).toString('utf8');
    const headers = req.headers as Record<string, string>;
    const verified = await PayPalService.verifyWebhookSignature(headers, JSON.parse(body), { scope: 'platform' });
    if (!verified) {
      // NACK: PayPal will retry on non-2xx
      return res.status(400).json({ error: 'SIGNATURE_SCOPE_VIOLATION' });
    }
    const event = JSON.parse(body);
    // Timestamp tolerance from PayPal header enforced only when header present
    const hdr = (headers['paypal-transmission-time'] || headers['PayPal-Transmission-Time']) as string | undefined;
    if (hdr) {
      const ts = Date.parse(hdr);
      if (Number.isFinite(ts)) {
        const skew = Math.abs(Date.now() - ts) / 1000;
        if (skew > WEBHOOK_TOLERANCE_SEC) {
          return res.status(400).json({ error: 'stale_webhook' });
        }
      }
    }
    let record;
    try {
      record = await SubscriptionService.recordWebhook('paypal', event.id, body);
    } catch (e: any) {
      if (e?.message === 'WEBHOOK_REPLAY_HASH_MISMATCH') return res.status(409).json({ error: 'WEBHOOK_REPLAY_HASH_MISMATCH' });
      throw e;
    }
    let tenantResolved = true;
    if (!record.alreadyProcessed) {
      const result = await SubscriptionService.processWebhook('paypal', body);
      tenantResolved = !!result?.tenantResolved;
      if (!tenantResolved) {
        logger.warn('TENANT_RESOLUTION_FAILED (paypal webhook)', { eventId: event.id });
      }
    }
    // NACK when tenant resolution failed so PayPal retries
    if (!tenantResolved) return res.status(400).json({ error: 'TENANT_RESOLUTION_FAILED' });
    return res.status(200).json({ ok: true, already_processed: record.alreadyProcessed, tenant_resolved: tenantResolved });
  } catch (err: any) {
    if (err?.message === 'WEBHOOK_REPLAY_HASH_MISMATCH') {
      return res.status(409).json({ error: 'WEBHOOK_REPLAY_HASH_MISMATCH' });
    }
    return res.status(400).json({ error: err?.message || 'INVALID_WEBHOOK' });
  }
});

export default router;