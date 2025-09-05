import request from 'supertest';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: async () => null, // or return {ext:'png', mime:'image/png'}
}), { virtual: true });

import { app } from '../src/app';

describe('GET /api/health', () => {
  it('returns 200 OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
