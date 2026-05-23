import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createTestApp } from './helpers/app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health responde 200 con status ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/v1/health no requiere auth (es publico)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', 'Bearer fake-token-no-deberia-tocarse');
    // Si el guard hubiera intentado validar el token, devolveria 401.
    expect(res.status).toBe(200);
  });
});
