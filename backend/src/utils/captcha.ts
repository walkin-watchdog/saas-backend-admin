import superagent from 'superagent';
import { GlobalConfigService } from '../services/globalConfigService';
import { CaptchaConfig } from '../types/security';

/**
 * Verify CAPTCHA token against the configured provider. When no configuration
 * exists (e.g. local development), the check passes automatically.
 */
export async function verifyCaptcha(
  _tenantId: string,
  token?: string,
): Promise<boolean> {
  const cfg = await GlobalConfigService.get<CaptchaConfig>('captcha');
  if (!cfg || !cfg.secretKey) {
    // CAPTCHA not configured – allow in development environments
    return true;
  }
  if (!token) return false;

  const url =
    cfg.provider === 'hcaptcha'
      ? 'https://hcaptcha.com/siteverify'
      : 'https://www.google.com/recaptcha/api/siteverify';
  try {
    const maybeReq: any = superagent.post(url);
    let res: any;
    if (typeof maybeReq?.type === 'function' && typeof maybeReq?.send === 'function') {
      res = await maybeReq.type('form').send({ secret: cfg.secretKey, response: token });
    } else {
      res = await maybeReq;
    }
    const success = !!res?.body?.success;
    // Providers like reCAPTCHA v3 return a score; others may not.
    const score = typeof res?.body?.score === 'number' ? res.body.score : success ? 1 : 0;
    const threshold = typeof cfg.threshold === 'number' ? cfg.threshold : 0.5;
    return success && score >= threshold;
  } catch {
    return false;
  }
}