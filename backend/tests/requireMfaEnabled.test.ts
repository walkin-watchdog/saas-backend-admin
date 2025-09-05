import { requireMfaEnabled, PlatformAuthRequest } from '../src/middleware/platformAuth';
import { PlatformConfigService } from '../src/services/platformConfigService';
import { Response } from 'express';

jest.mock('../src/services/platformConfigService');
const mockedConfig = PlatformConfigService as jest.Mocked<typeof PlatformConfigService>;

describe('requireMfaEnabled middleware', () => {
  it('returns 500 when config lookup fails', async () => {
    const req = {
      platformUser: { id: 'u1', email: 'a@b.c', roles: [], permissions: [], mfaEnabled: false }
    } as unknown as PlatformAuthRequest;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;
    const next = jest.fn();
    mockedConfig.getConfig.mockRejectedValue(new Error('db error'));

    await requireMfaEnabled(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to verify MFA status' });
    expect(next).not.toHaveBeenCalled();
  });
});