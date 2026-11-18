import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USERS, createTestApp, sampleRequest, type TestApp } from '../support/test-app.js';

/** Problema 2 a través de la API: reglas del proceso y mensajes claros al rechazar. */
describe('request workflow over HTTP', () => {
  let t: TestApp;
  let url: string;

  beforeEach(async () => {
    t = await createTestApp();
    const created = await t.as(USERS.requesterA).post('/api/requests', sampleRequest);
    url = `/api/requests/${created.json().number}`;
  });

  afterEach(() => t.app.close());

  const move = (user: (typeof USERS)[keyof typeof USERS], action: string, comment?: string) =>
    t.as(user).post(`${url}/transitions`, { action, ...(comment ? { comment } : {}) });

  it('registers a new request in the first stage with its history', async () => {
    const res = await t.as(USERS.requesterA).get(url);

    expect(res.json()).toMatchObject({ number: 1, status: 'REGISTERED', allowedActions: [] });
    expect(res.json().history).toEqual([expect.objectContaining({ action: 'CREATE', to: 'REGISTERED' })]);
  });

  it('only the subsidiary can register requests', async () => {
    const res = await t.as(USERS.analystA).post('/api/requests', sampleRequest);

    expect(res.statusCode).toBe(403);
  });

  it('runs the full agreed process including a rejection loop', async () => {
    expect((await move(USERS.analystA, 'START')).json().status).toBe('IN_PROGRESS');
    expect((await move(USERS.analystA, 'RESOLVE', 'Pago aplicado')).json().status).toBe('RESOLVED');
    expect((await move(USERS.requesterA, 'REJECT', 'No veo el pago')).json().status).toBe('IN_PROGRESS');
    expect((await move(USERS.analystA, 'RESOLVE', 'Pago reenviado')).json().status).toBe('RESOLVED');

    const closed = await move(USERS.requesterA, 'CONFIRM');

    expect(closed.json()).toMatchObject({ status: 'CLOSED', version: 6, allowedActions: [] });
    expect(closed.json().history.map((h: { action: string }) => h.action)).toEqual([
      'CREATE', 'START', 'RESOLVE', 'REJECT', 'RESOLVE', 'CONFIRM',
    ]);
  });

  it('rejects skipping a stage with 409, an explanation, and leaves the request unchanged', async () => {
    const res = await move(USERS.analystA, 'RESOLVE', 'Listo');

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      code: 'INVALID_TRANSITION',
      message: expect.stringContaining('No se puede resolver una solicitud en estado "Registrada"'),
    });
    const after = await t.as(USERS.requesterA).get(url);
    expect(after.json()).toMatchObject({ status: 'REGISTERED', version: 1 });
  });

  it('rejects an analyst trying to confirm the solution with 403', async () => {
    await move(USERS.analystA, 'START');
    await move(USERS.analystA, 'RESOLVE', 'Listo');

    const res = await move(USERS.analystA, 'CONFIRM');

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('Solo la filial puede confirmar la solución de una solicitud.');
    expect((await t.as(USERS.requesterA).get(url)).json().status).toBe('RESOLVED');
  });

  it('does not accept changes on a closed request', async () => {
    await move(USERS.analystA, 'START');
    await move(USERS.analystA, 'RESOLVE', 'Listo');
    await move(USERS.requesterA, 'CONFIRM');

    const res = await move(USERS.requesterA, 'REJECT', 'Quiero reabrir');

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'REQUEST_CLOSED', message: 'La solicitud está cerrada y no admite cambios.' });
  });

  it('rejects an unknown action with 400', async () => {
    const res = await move(USERS.analystA, 'CLOSE_NOW');

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
