// tests/tenantDsnSwitch.test.ts
import request from 'supertest';
import * as prismaUtils from '../src/utils/prisma';
import { app } from '../src/app';
import { PrismaClient } from '@prisma/client';

const root = new PrismaClient();

describe('Dedicated-tenant DSN switch', () => {
  let tenant: any, admin: any, token: string;
  beforeAll(async () => {
    tenant = await root.tenant.create({
      data: { name: 'DedicatedCo', status: 'active', dedicated: true, datasourceUrl: 'postgres://user:pass@localhost:5432/dedicated' },
    });
    admin = await root.user.create({
      data: { tenantId: tenant.id, email: 'admin@ded.co', password: 'x', name: 'Admin', role: 'ADMIN', platformAdmin: true },
    });
    const { signAccess } = require('../src/utils/jwt');
    token = signAccess({ sub: admin.id, tenantId: tenant.id, role: 'ADMIN', platformAdmin: true, tokenVersion: 0 });
  });

  it('constructs PrismaClient with dedicated DSN', async () => {
    const spy = jest.spyOn(prismaUtils, 'getDedicatedPrisma');
    await request(app)
      .get('/api/tenant/config') // any route that hits Prisma for this tenant
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);

    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0][0]; // url
    expect(arg).toBe('postgres://user:pass@localhost:5432/dedicated');
  });
});