import request from 'supertest';
import express from 'express';
import { routePath } from '../../src/middleware/routePath';

describe('routePath middleware', () => {
  it('stores normalized route in res.locals.routePath', async () => {
    const app = express();
    app.get('/items/:id', routePath, (req, res) => {
      res.json({ route: res.locals.routePath });
    });

    const r = await request(app).get('/items/99');
    expect(r.status).toBe(200);
    expect(r.body.route).toBe('/items/:id');
  });
});