import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ADMIN_CREDS, createTestApp } from './helpers/app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  // Login del admin UNA sola vez y reusamos token + cookie para los specs
  // posteriores. El throttle de /auth/login (5/min por IP) es agresivo:
  // si cada spec hiciera su propio login, los ultimos chocarian contra 429.
  let adminAccessToken: string;
  let adminRefreshCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(ADMIN_CREDS);
    if (login.status !== 200) {
      throw new Error(`Login del admin fallo (${login.status}): ${JSON.stringify(login.body)}`);
    }
    adminAccessToken = login.body.accessToken;
    // set-cookie puede venir como string (1 cookie) o string[] (N cookies)
    // segun la version de http/supertest. Normalizamos siempre a array.
    const rawSetCookie = login.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(rawSetCookie)
      ? (rawSetCookie as string[])
      : typeof rawSetCookie === 'string'
        ? [rawSetCookie]
        : [];
    adminRefreshCookie = cookies.find((c) => c.startsWith('refreshToken=')) ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login (login compartido)', () => {
    it('devuelve accessToken + refresh cookie HttpOnly', () => {
      expect(adminAccessToken).toBeDefined();
      expect(adminAccessToken.length).toBeGreaterThan(20);
      expect(adminRefreshCookie).toBeDefined();
      expect(adminRefreshCookie).toContain('HttpOnly');
    });

    it('rechaza credenciales invalidas con 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@laboratorio.com', password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body.type).toBeDefined();
      expect(res.body.title).toBeDefined();
    });

    it('rechaza payload invalido con 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@laboratorio.com' }); // sin password
      expect(res.status).toBe(400);
    });

    it('rechaza campos extra (whitelist + forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'admin@laboratorio.com',
          password: 'Admin123!',
          extraField: 'sneaky',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /auth/me', () => {
    it('rechaza sin Authorization con 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('devuelve el perfil cuando hay token valido', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(ADMIN_CREDS.identifier);
      expect(res.body.role).toBe('admin');
    });

    it('rechaza tokens malformados con 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rota el token usando la cookie HttpOnly', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', adminRefreshCookie);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('rechaza refresh sin cookie con 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh');
      expect(res.status).toBe(401);
    });
  });
});
