import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encodeCursor } from '../../src/application/cursor.js';
import { USERS, createTestApp, sampleRequest, type TestApp } from '../support/test-app.js';

/** Problema 1: la filial ve sus solicitudes con su estado, filtra y pagina. */
describe('listing requests', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
    for (let i = 0; i < 5; i++) {
      await t.as(USERS.requesterA).post('/api/requests', { ...sampleRequest, title: `Solicitud ${i + 1}` });
    }
    await t.as(USERS.analystA).post('/api/requests/2/transitions', { action: 'START' });
    await t.as(USERS.analystA).post('/api/requests/4/transitions', { action: 'START' });
  });

  afterEach(() => t.app.close());

  it('returns the newest first with the current status and without heavy fields', async () => {
    const res = await t.as(USERS.requesterA).get('/api/requests');

    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { number: number }) => i.number)).toEqual([5, 4, 3, 2, 1]);
    expect(res.json().items[1]).toEqual({
      number: 4,
      title: 'Solicitud 4',
      category: 'PURCHASES',
      status: 'IN_PROGRESS',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.json().nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    const res = await t.as(USERS.requesterA).get('/api/requests?status=IN_PROGRESS');

    expect(res.json().items.map((i: { number: number }) => i.number)).toEqual([4, 2]);
  });

  it('paginates with an opaque cursor', async () => {
    const first = await t.as(USERS.requesterA).get('/api/requests?limit=2');
    const second = await t.as(USERS.requesterA).get(`/api/requests?limit=2&cursor=${first.json().nextCursor}`);

    expect(first.json().items.map((i: { number: number }) => i.number)).toEqual([5, 4]);
    expect(second.json().items.map((i: { number: number }) => i.number)).toEqual([3, 2]);
  });

  it('a cursor cannot be used to reach another tenant', async () => {
    const res = await t.as(USERS.requesterB).get(`/api/requests?cursor=${encodeCursor(6)}`);

    expect(res.json().items).toEqual([]);
  });

  it('rejects a malformed cursor with 400', async () => {
    const res = await t.as(USERS.requesterA).get('/api/requests?cursor=not-a-cursor');

    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown status filter with 400', async () => {
    const res = await t.as(USERS.requesterA).get('/api/requests?status=DELETED');

    expect(res.statusCode).toBe(400);
  });

  it('finds a specific request by its number', async () => {
    const res = await t.as(USERS.requesterA).get('/api/requests/3');

    expect(res.json()).toMatchObject({ number: 3, title: 'Solicitud 3', description: sampleRequest.description });
  });
});
