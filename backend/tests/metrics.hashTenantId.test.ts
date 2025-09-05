import { hashTenantId } from '../src/utils/metrics';

describe('hashTenantId', () => {
  it('returns stable 8-char hex string and hides PII', () => {
    const a = hashTenantId('tenant-abc');
    const b = hashTenantId('tenant-abc');
    const c = hashTenantId('tenant-xyz');

    expect(a).toHaveLength(8);
    expect(/^[0-9a-f]{8}$/.test(a)).toBe(true);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.includes('tenant')).toBe(false);
  });
});