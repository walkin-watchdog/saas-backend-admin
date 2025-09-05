import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function globalTeardown(): Promise<void> {
  try {
    const { CacheService } = await import('../../src/utils/cache');
    await CacheService.shutdown?.();
  } catch {}

  try {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    await p.$disconnect();
  } catch {}

  try {
    const invoicesDir = process.env.INVOICES_DIR || path.join(process.cwd(), 'invoices');
    await fs.rm(invoicesDir, { recursive: true, force: true });
  } catch {}

  if (process.env.CI !== 'true') {
    try {
      await execAsync('docker compose -f docker-compose.test.yml down -v');
    } catch {}
  }
}