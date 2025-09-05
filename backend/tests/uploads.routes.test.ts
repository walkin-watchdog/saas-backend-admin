import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/utils/prisma';
import { signAccess } from '../src/utils/jwt';

jest.mock('../src/services/uploadService', () => {
  const actual = jest.requireActual('../src/services/uploadService');
  return {
    ...actual,
    // Mock the cloudinary precheck so we can flip it per-test
    requireCloudinaryConfigured: jest.fn(),
    UploadService: {
      ...actual.UploadService,
      uploadSingleImage: jest.fn().mockResolvedValue({
        publicId: 'pid',
        url: 'http://example.com/pid',
        width: 100,
        height: 100,
      }),
      getImages: jest.fn().mockResolvedValue({
        images: [
          {
            id: 'website/products/pid',
            url: 'http://example.com/pid',
            format: 'webp',
            created: new Date().toISOString(),
            bytes: 12345,
            folder: 'website/products',
          },
        ],
        hasMore: false,
        nextCursor: null,
      }),
      searchImages: jest.fn().mockResolvedValue({
        images: [],
        hasMore: false,
        nextCursor: null,
      }),
      deleteImage: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  };
});

const {
  UploadService,
  requireCloudinaryConfigured,
} = require('../src/services/uploadService');

const uploadSingleImage = UploadService.uploadSingleImage as jest.Mock;
const getImages = UploadService.getImages as jest.Mock;
const searchImages = UploadService.searchImages as jest.Mock;
const deleteImage = UploadService.deleteImage as jest.Mock;
const requireCloudinaryConfiguredMock = requireCloudinaryConfigured as jest.Mock;

describe('upload routes', () => {
  let tenant: any;
  let admin: any;
  let token: string;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({
      data: { name: 'UploadTenant', status: 'active', dedicated: false },
    });
    admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@up.co',
        password: 'pw',
        name: 'Admin',
        role: 'ADMIN',
        platformAdmin: true,
      },
    });
    token = signAccess({
      sub: admin.id,
      tenantId: tenant.id,
      role: 'ADMIN',
      platformAdmin: true,
      tokenVersion: 0,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: Cloudinary configured OK
    requireCloudinaryConfiguredMock.mockResolvedValue({
      cloudName: 'c',
      apiKey: 'k',
      apiSecret: 's',
    });
  });

  test('precondition fails (412) when Cloudinary is not configured', async () => {
    requireCloudinaryConfiguredMock.mockRejectedValueOnce(
      Object.assign(new Error('Cloudinary configuration missing'), {
        code: 'CLOUDINARY_CONFIG_MISSING',
      })
    );

    const res = await request(app)
      .post('/api/uploads/products')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .attach('images', Buffer.from('irrelevant'), {
        filename: 'x.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(412);
    expect(res.body.code).toBe('CLOUDINARY_CONFIG_MISSING');
    expect(uploadSingleImage).not.toHaveBeenCalled();
  });

  test('allows upload of permitted mime type (products: jpeg)', async () => {
    const res = await request(app)
      .post('/api/uploads/products')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .attach('images', Buffer.from('test-bytes'), {
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(1);
    expect(uploadSingleImage).toHaveBeenCalledTimes(1);
    // folder & imageType are both "products" per route code
    const callArgs = uploadSingleImage.mock.calls[0];
    expect(callArgs[1]).toBe('products');
    expect(callArgs[2]).toBe('products');
  });

  test('rejects disallowed mime type (products: png not allowed by default rules)', async () => {
    const res = await request(app)
      .post('/api/uploads/products')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .attach('images', Buffer.from('bad'), {
        filename: 'test.png',
        contentType: 'image/png',
      });

    // uploadWithRules sets error.status = 400 on unsupported type
    expect(res.status).toBe(400);
    expect(uploadSingleImage).not.toHaveBeenCalled();
  });

  test('400 when no files provided', async () => {
    const res = await request(app)
      .post('/api/uploads/products')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No images provided/);
  });

  test('GET images uses service and returns list', async () => {
    const res = await request(app)
      .get('/api/uploads/products')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: '10' });

    expect(res.status).toBe(200);
    expect(getImages).toHaveBeenCalledWith('products', { limit: 10, nextCursor: undefined, prefix: undefined });
    expect(res.body.images).toHaveLength(1);
  });

  test('search requires "q" query (400)', async () => {
    const res = await request(app)
      .get('/api/uploads/search')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Search query is required/i);
  });

  test('search returns results via service', async () => {
    searchImages.mockResolvedValueOnce({
      images: [{ id: 'a', url: 'u', format: 'webp', created: '', bytes: 1, folder: 'f' }],
      hasMore: false,
      nextCursor: null,
    });

    const res = await request(app)
      .get('/api/uploads/search')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'folder:website*' });

    expect(res.status).toBe(200);
    expect(searchImages).toHaveBeenCalled();
    expect(res.body.images).toHaveLength(1);
  });

  test('delete image uses service', async () => {
    const res = await request(app)
      .delete('/api/uploads/website/products/pid')
      .set('x-api-key', tenant.apiKey)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(deleteImage).toHaveBeenCalledWith('website/products/pid');
    expect(res.body.success).toBe(true);
  });
});