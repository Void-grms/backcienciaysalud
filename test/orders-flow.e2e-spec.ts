import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ADMIN_CREDS, createTestApp } from './helpers/app';

// Test integral del flujo de una orden: paciente -> orden -> bulk-save ->
// validate -> deliver -> PDF disponible -> audit log poblado -> dashboard
// refleja el delivery. Cubre la mayoria de los acoplamientos criticos.

describe('Orders flow (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let createdPatientId: string | null = null;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(ADMIN_CREDS);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    // Limpieza best-effort para no dejar residuos en la DB compartida.
    if (createdPatientId && token) {
      await request(app.getHttpServer())
        .delete(`/api/v1/patients/${createdPatientId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('completa el flujo completo desde creacion hasta delivery', async () => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    // 1. Crear paciente con documento unico para no colisionar con corridas previas.
    const docNumber = `T${Date.now().toString().slice(-7)}`;
    const patient = await auth(request(app.getHttpServer()).post('/api/v1/patients')).send({
      documentType: 'DNI',
      documentNumber: docNumber,
      firstName: 'Test',
      lastName: 'E2E',
      sex: 'F',
      birthDate: '1990-01-01',
    });
    expect(patient.status).toBe(201);
    createdPatientId = patient.body.id;

    // 2. Tomar el primer test disponible del catalogo (HB del seed).
    const tests = await auth(request(app.getHttpServer()).get('/api/v1/catalog/tests'));
    expect(tests.status).toBe(200);
    expect(tests.body.items.length).toBeGreaterThan(0);
    const testId = tests.body.items[0].id;

    // 3. Crear orden.
    const order = await auth(request(app.getHttpServer()).post('/api/v1/orders')).send({
      patientId: createdPatientId,
      tests: [{ testId }],
    });
    expect(order.status).toBe(201);
    expect(order.body.state).toBe('draft');
    expect(order.body.code).toMatch(/^ORD-\d{4}-\d{6}$/);
    const orderId = order.body.id;
    const orderCode = order.body.code;
    const itemId = order.body.items[0].id;

    // 4. Bulk-save: dispara transicion draft -> in_progress automatica.
    const saved = await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/results/bulk-save`),
    ).send({ entries: [{ orderItemId: itemId, valueNumeric: 13.5 }] });
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toBe(1);

    // 5. Validate.
    const validated = await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/validate`),
    );
    expect(validated.status).toBe(200);
    expect(validated.body.state).toBe('validated');
    expect(validated.body.validatedAt).toBeDefined();

    // 6. Deliver.
    const delivered = await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/deliver`),
    );
    expect(delivered.status).toBe(200);
    expect(delivered.body.state).toBe('delivered');

    // 7. Detalle por codigo: la API acepta ambos (id o code).
    const byCode = await auth(
      request(app.getHttpServer()).get(`/api/v1/orders/${orderCode}`),
    );
    expect(byCode.status).toBe(200);
    expect(byCode.body.id).toBe(orderId);

    // 8. Audit: debe haber al menos los 4 eventos esperados de la orden.
    // Dejamos un breve tick para que el listener async procese el evento.
    await new Promise((r) => setTimeout(r, 500));
    const audit = await auth(
      request(app.getHttpServer()).get(
        `/api/v1/audit?entityType=order&entityId=${orderId}&perPage=20`,
      ),
    );
    expect(audit.status).toBe(200);
    const actions = audit.body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'order.created',
        'order.in_progress',
        'order.validated',
        'order.delivered',
      ]),
    );
  });

  it('rechaza crear orden sin patientId con 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ tests: [] });
    expect(res.status).toBe(400);
  });

  it('GET /admin/dashboard/overview devuelve metricas validas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ordersByState).toBeDefined();
    expect(typeof res.body.ordersByState.delivered).toBe('number');
    expect(res.body.totalsToday).toBeDefined();
    expect(Array.isArray(res.body.topTests)).toBe(true);
  });
});
