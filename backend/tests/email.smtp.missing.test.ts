import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';

describe('SMTP config required', () => {
  let tenant: any;
  let user: any;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'NoSMTP', status: 'active', dedicated: false },
    });
    const hash = await bcrypt.hash('pass123', 10);
    user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'nosmtp@example.com',
        password: hash,
        name: 'No SMTP',
        role: 'ADMIN',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  test('forgot-password returns 412 when SMTP missing', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('x-api-key', tenant.apiKey)
      .send({ email: user.email });
    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({ code: 'SMTP_CONFIG_MISSING' });
  });
});
