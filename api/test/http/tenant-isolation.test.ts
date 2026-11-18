import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USERS, createTestApp, sampleRequest, type TestApp } from '../support/test-app.js';

/**
 * Problema 3: una filial no puede listar, consultar ni modificar solicitudes de
 * otra aunque conozca su número, y la respuesta no revela si la solicitud existe.
 */
describe('tenant isolation', () => {
  let t: TestApp;
  let foreignNumber: number;

  beforeEach(async () => {
    t = await createTestApp();
    const created = await t.as(USERS.requesterA).post('/api/requests', sampleRequest);
    foreignNumber = created.json().number;
  });

  afterEach(() => t.app.close());

  it('does not list requests of another tenant', async () => {
    const res = await t.as(USERS.requesterB).get('/api/requests');

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('cannot read a foreign request even knowing its number', async () => {
    const res = await t.as(USERS.requesterB).get(`/api/requests/${foreignNumber}`);

    expect(res.statusCode).toBe(404);
  });

  it('cannot modify a foreign request, and it stays unchanged', async () => {
    const res = await t.as(USERS.analystB).post(`/api/requests/${foreignNumber}/transitions`, { action: 'START' });

    expect(res.statusCode).toBe(404);
    const own = await t.as(USERS.requesterA).get(`/api/requests/${foreignNumber}`);
    expect(own.json().status).toBe('REGISTERED');
    expect(own.json().history).toHaveLength(1);
  });

  it('answers a foreign request exactly like a non-existent one (no existence oracle)', async () => {
    const foreign = await t.as(USERS.requesterB).get(`/api/requests/${foreignNumber}`);
    const missing = await t.as(USERS.requesterB).get('/api/requests/999999');
    const foreignWrite = await t.as(USERS.analystB).post(`/api/requests/${foreignNumber}/transitions`, { action: 'START' });
    const missingWrite = await t.as(USERS.analystB).post('/api/requests/999999/transitions', { action: 'START' });

    expect(foreign.statusCode).toBe(missing.statusCode);
    expect(foreign.json()).toEqual(missing.json());
    expect(foreignWrite.statusCode).toBe(missingWrite.statusCode);
    expect(foreignWrite.json()).toEqual(missingWrite.json());
  });

  it('ignores any tenant sent by the client: the tenant only comes from the signed token', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/requests?tenantId=tenant-a',
      headers: {
        authorization: `Bearer ${await t.tokens.sign(USERS.requesterB)}`,
        'x-tenant-id': 'tenant-a',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('rejects a token whose tenant claim was tampered with', async () => {
    const token = await t.tokens.sign(USERS.requesterB);
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, tenantId: 'tenant-a' })).toString('base64url');

    const res = await t.app.inject({
      method: 'GET',
      url: '/api/requests',
      headers: { authorization: `Bearer ${header}.${forged}.${signature}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects requests without a token', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/requests' });

    expect(res.statusCode).toBe(401);
  });
});
