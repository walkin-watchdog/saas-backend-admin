import { jest } from '@jest/globals';

const findUniqueMock = jest.fn() as jest.MockedFunction<any>;
const updateMock = jest.fn() as jest.MockedFunction<any>;

jest.mock('../../src/utils/prisma', () => {
  return {
    prisma: {
      tenant: {
        findUnique: (...a:any[]) => findUniqueMock(...a),
        update: (...a:any[]) => updateMock(...a),
      },
    },
    getDedicatedPrisma: jest.fn(),
  };
});

describe('TenantService.updateTenant publishes datasource change only when relevant fields change', () => {
  beforeEach(() => {
    jest.resetModules();
    findUniqueMock.mockReset();
    updateMock.mockReset();
  });

  test('no publish when connectivity fields unchanged', async () => {
    const before = { id:'t1', dedicated:false, datasourceUrl:null, dbName:null };
    const after  = { ...before };
    findUniqueMock.mockResolvedValue(before);
    updateMock.mockResolvedValue(after);

    const { TenantService } = await import('../../src/services/tenantService');
    const { eventBus, TENANT_EVENTS } = await import('../../src/utils/eventBus');
    const publishSpy = jest.spyOn(eventBus, 'publish');

    await TenantService.updateTenant('t1', { name: 'noop' } as any);
    expect(publishSpy).not.toHaveBeenCalledWith(TENANT_EVENTS.DATASOURCE_CHANGED, expect.anything());
  });

  test('publish when datasourceUrl changes', async () => {
    const before = { id:'t1', dedicated:true, datasourceUrl:'postgres://old', dbName:'db1' };
    const after  = { ...before, datasourceUrl:'postgres://new' };
    findUniqueMock.mockResolvedValue(before);
    updateMock.mockResolvedValue(after);

    const { TenantService } = await import('../../src/services/tenantService');
    const { eventBus, TENANT_EVENTS } = await import('../../src/utils/eventBus');
    const publishSpy = jest.spyOn(eventBus, 'publish');

    await TenantService.updateTenant('t1', { datasourceUrl: 'postgres://new' } as any);

    expect(publishSpy).toHaveBeenCalledWith(TENANT_EVENTS.DATASOURCE_CHANGED, expect.objectContaining({
      tenantId: 't1',
      before: expect.objectContaining({ datasourceUrl: 'postgres://old' }),
      after:  expect.objectContaining({ datasourceUrl: 'postgres://new' }),
      reason: 'admin_update',
    }));
  });
});
