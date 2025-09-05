import { keyFromUserOrIp, keyByTenantRouteIp } from '../src/middleware/rateLimit';
import * as jwt from '../src/utils/jwt';

describe('keyFromUserOrIp', () => {
  afterEach(() => jest.restoreAllMocks());

  function makeReq(partial: any) {
    return {
      headers: {},
      ip: '203.0.113.5',
      ...partial,
    } as any;
  }

  it('uses tenant:user when req.user.id is present', () => {
    const req = makeReq({ tenantId: 'T1', user: { id: 'U1' } });
    expect(keyFromUserOrIp(req)).toBe('T1:U1');
  });

  it('uses tenant:sub when Authorization bearer decodes', () => {
    jest.spyOn(jwt, 'verifyAccess').mockReturnValue({ sub: 'U42' } as any);
    const req = makeReq({ tenantId: 'T2', headers: { authorization: 'Bearer token' } });
    expect(keyFromUserOrIp(req)).toBe('T2:U42');
  });

  it('falls back to tenant:ip when no user/token', () => {
    const req = makeReq({ tenantId: 'TX' });
    expect(keyFromUserOrIp(req)).toBe('TX:203.0.113.5');
  });

  it('falls back to tenant:ip when bearer is invalid', () => {
    jest.spyOn(jwt, 'verifyAccess').mockImplementation(() => { throw new Error('bad'); });
    const req = makeReq({ tenantId: 'TY', headers: { authorization: 'Bearer nope' } });
    expect(keyFromUserOrIp(req)).toBe('TY:203.0.113.5');
  });

  it('keyByTenantRouteIp uses tenant, route and ip', () => {
    const req = makeReq({ tenantId: 'T1', baseUrl: '/foo', path: '/bar' });
    expect(keyByTenantRouteIp(req)).toBe('T1:/foo/bar:203.0.113.5');
  });

  it('keyByTenantRouteIp prefers res.locals.routePath when available', () => {
    const req = makeReq({
      tenantId: 'T2',
      baseUrl: '/foo',
      path: '/bar',
      res: { locals: { routePath: '/foo/:id' } },
    });
    expect(keyByTenantRouteIp(req)).toBe('T2:/foo/:id:203.0.113.5');
  });

  it('keyByTenantRouteIp falls back to public when tenant missing', () => {
    const req = makeReq({ baseUrl: '/foo', path: '/baz' });
    expect(keyByTenantRouteIp(req)).toBe('public:/foo/baz:203.0.113.5');
  });
});