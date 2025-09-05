jest.mock('../src/services/tenantConfigService', () => ({
  TenantConfigService: { getConfig: jest.fn().mockResolvedValue(null) }
}));

jest.mock('../src/middleware/tenantMiddleware', () => ({ getTenantId: () => 't1' }));

jest.mock('../src/utils/externalAdapter', () => ({ externalCall: (_:any, fn:any) => fn() }));

import { HubSpotService } from '../src/services/hubspotService';

describe('HubSpot config requirement', () => {
  it('throws HUBSPOT_CONFIG_MISSING when tenant config absent', async () => {
    await expect(HubSpotService.getContactByEmail('a@b.com')).rejects.toMatchObject({ code: 'HUBSPOT_CONFIG_MISSING' });
  });
});
