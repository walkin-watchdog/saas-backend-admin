import { logger } from './logger';

function isInteractiveTxStartTimeout(err: any): boolean {
  const code = (err && (err.code || err?.clientVersion)) as string | undefined;
  const msg = String(err?.message || err || '');
  // Match known interactive-tx/pool wait failures across Prisma versions
  return (
    /Unable to start a transaction in the given time/i.test(msg) ||
    /Timed out fetching a new connection/i.test(msg) ||
    code === 'P2024' || // timeout fetching a connection
    code === 'P2028'    // transaction API error (varies by version)
  );
}

export async function retryInteractiveTx<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseMs?: number }
): Promise<T> {
  const retries = opts?.retries ?? (process.env.CI === 'true' ? 6 : 3);
  const base = opts?.baseMs ?? 75;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt < retries && isInteractiveTxStartTimeout(err)) {
        const delay = base * Math.pow(2, attempt);
        logger.warn('retry.interactive_tx_start_timeout', { attempt, delayMs: delay });
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }
      throw err;
    }
  }
}