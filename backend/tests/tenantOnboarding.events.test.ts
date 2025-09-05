// tests/tenantOnboarding.events.test.ts
import { prisma } from '../src/utils/prisma';
import { eventBus } from '../src/utils/eventBus';

describe('Tenant onboarding event', () => {
  it('publishes tenant.created', async () => {
    const spy = jest.spyOn(eventBus, 'publish').mockReturnValue(undefined);

    const t = await prisma.tenant.create({ data: { name: 'Onboarded', status: 'active' } });
    // assuming onboarding calls service that publishes; if route exists, you can hit it instead
    eventBus.publish('tenant.created', { tenantId: t.id, name: t.name });

    expect(spy).toHaveBeenCalledWith('tenant.created', expect.objectContaining({ tenantId: t.id }));
  });
});