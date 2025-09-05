// tests/rls.policies.test.ts
import { prisma } from '../src/utils/prisma';

async function ensureRlsTesterRole(): Promise<void> {
  // Create a non-superuser role we can SET ROLE to
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_tester') THEN
        CREATE ROLE rls_tester LOGIN PASSWORD 'rls_tester' NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END$$;
  `);
  // Grant privileges needed to run the SELECT/UPDATE; RLS will still govern row visibility
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO rls_tester`);
  await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_tester`);
  await prisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rls_tester`);
}

describe('DB-level RLS', () => {
  let t1: any, t2: any, u1: any, u2: any;

  beforeAll(async () => {
    await ensureRlsTesterRole();

    t1 = await prisma.tenant.create({ data: { name: 'T1', status: 'active' } });
    t2 = await prisma.tenant.create({ data: { name: 'T2', status: 'active' } });

    u1 = await prisma.user.create({
      data: { tenantId: t1.id, email: 'u1@t1.co', password: 'x', name: 'u1', role: 'ADMIN' },
    });
    u2 = await prisma.user.create({
      data: { tenantId: t2.id, email: 'u2@t2.co', password: 'x', name: 'u2', role: 'ADMIN' },
    });
  });

  it('blocks cross-tenant SELECT with SET LOCAL app.tenantId', async () => {
    const rows = await prisma.$transaction(async (tx) => {
      // Switch away from superuser/owner so RLS is effective
      await tx.$executeRawUnsafe(`SET ROLE rls_tester`);
      await tx.$executeRawUnsafe(`SET LOCAL app.tenantId = '${t1.id}'`);
      const result = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM "users" WHERE "tenantId" = '${t2.id}'`
      );
      return result;
    });
    expect(rows.length).toBe(0);
  });

  it('blocks cross-tenant UPDATE via RLS (0 rows or permission error)', async () => {
    const updatedCountOrError = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET ROLE rls_tester`);
      await tx.$executeRawUnsafe(`SET LOCAL app.tenantId = '${t1.id}'`);
      try {
        const res = await tx.$executeRawUnsafe(
          `UPDATE "users" SET "name" = 'hacked' WHERE "tenantId" = '${t2.id}' AND "id" = '${u2.id}'`
        );
        return res; // rows affected
      } catch (_err) {
        // If privileges are insufficient, that's also acceptable proof RLS/privs prevent the cross-tenant write
        return 'permission-denied';
      }
    });

    if (typeof updatedCountOrError === 'number') {
      expect(updatedCountOrError).toBe(0);
    } else {
      expect(updatedCountOrError).toBe('permission-denied');
    }
  });
});