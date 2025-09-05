import { prisma } from '../src/utils/prisma';
import { OffboardingJobService } from '../src/services/offboardingJobService';
import { OffboardTenantJob } from '../src/jobs/offboardTenantJob';

describe('Offboarding job retries and cleanup', () => {
  it('reschedules job when performOffboarding fails', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'FailCorp' } });
    const user = await prisma.platformUser.create({ data: { name: 'Admin', email: 'admin+fail@example.com' } });

    await OffboardingJobService.schedule({
      tenantId: tenant.id,
      reason: 'test failure',
      scheduledAt: new Date(Date.now() - 1000),
      retentionDays: 30,
      initiatedById: user.id,
    });

    const spy = jest
      .spyOn(OffboardTenantJob as any, 'performOffboarding')
      .mockRejectedValue(new Error('boom'));

    await OffboardTenantJob.processOffboarding();

    const job = await prisma.offboardingJob.findUnique({ where: { tenantId: tenant.id } });
    expect(job?.status).toBe('scheduled');
    expect(job?.processingAt).toBeNull();

    spy.mockRestore();
  });

  it('cleanup removes completed jobs after retention period', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'CleanupCorp' } });
    const user = await prisma.platformUser.create({ data: { name: 'Admin2', email: 'admin+cleanup@example.com' } });

    await prisma.offboardingJob.create({
      data: {
        tenantId: tenant.id,
        reason: 'done',
        scheduledAt: new Date(),
        retentionDays: 1,
        status: 'completed',
        completedAt: new Date(Date.now() - 2 * 86400000),
        initiatedById: user.id,
      },
    });

    await OffboardingJobService.cleanup(new Date());

    const job = await prisma.offboardingJob.findUnique({ where: { tenantId: tenant.id } });
    expect(job).toBeNull();
  });
});
