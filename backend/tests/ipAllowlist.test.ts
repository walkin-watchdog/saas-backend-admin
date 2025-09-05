import { isIpAllowed } from '../src/utils/ipAllowlist';

describe('ipAllowlist IPv6 support', () => {
  it('allows IPv6 address within CIDR range', () => {
    const list = ['2001:db8::/32'];
    expect(isIpAllowed('2001:db8:0:1::123', list)).toBe(true);
  });

  it('denies IPv6 address outside allowlist', () => {
    const list = ['2001:db8::/32'];
    expect(isIpAllowed('2001:db9::1', list)).toBe(false);
  });
});
