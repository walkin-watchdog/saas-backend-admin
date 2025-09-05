import { prisma } from '../src/utils/prisma';
import { EmailService } from '../src/services/emailService';
import { TenantConfigService } from '../src/services/tenantConfigService';
import nodemailer from 'nodemailer';

describe('Email from address handling', () => {
  let tenant: any;
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' });

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'FromTenant', status: 'active', dedicated: false },
    });
    // mock nodemailer
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as any);
  });

  afterAll(async () => {
    (nodemailer.createTransport as jest.Mock).mockRestore();
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    sendMail.mockClear();
    await prisma.tenantConfig.deleteMany({ where: { tenantId: tenant.id, key: 'smtp' } });
  });

  test('uses from address from tenant config', async () => {
    await TenantConfigService.createConfig(tenant.id, 'smtp', {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'u',
      pass: 'p',
      from: 'tenant@example.com',
    });

    await EmailService.sendEmail({
      to: 'dest@example.com',
      subject: 'Hello',
      text: 'Hi',
      tenantId: tenant.id,
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'tenant@example.com' }));
  });

  test('missing from in config throws SMTP_CONFIG_MISSING', async () => {
    await TenantConfigService.createConfig(tenant.id, 'smtp', {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'u',
      pass: 'p',
      from: 'should-not-use',
    });
    // update config removing from
    await TenantConfigService.updateConfig(tenant.id, 'smtp', {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'u',
      pass: 'p',
    } as any);

    await expect(
      EmailService.sendEmail({
        to: 'a@b.com',
        subject: 'x',
        text: 'y',
        tenantId: tenant.id,
      })
    ).rejects.toMatchObject({ code: 'SMTP_CONFIG_MISSING' });
  });
});
