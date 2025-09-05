import { PlatformConfigService } from '../../src/services/platformConfigService';
import { GlobalConfigService } from '../../src/services/globalConfigService';
import { prisma } from '../../src/utils/prisma';

describe('GlobalConfig scope', () => {
  afterAll(async () => {
    await prisma.globalConfig.deleteMany({ where: { key: 'dup_key' } });
  });

  it('allows same key in different scopes', async () => {
    await PlatformConfigService.setConfig('dup_key', { value: 'platform' }, undefined, { scope: 'platform' });
    await GlobalConfigService.set('dup_key', { value: 'global' });

    const platformVal = await PlatformConfigService.getConfig<{ value: string }>('dup_key', 'platform');
    const globalVal = await GlobalConfigService.get<{ value: string }>('dup_key', 'global');

    expect(platformVal?.value).toBe('platform');
    expect(globalVal?.value).toBe('global');
  });
});