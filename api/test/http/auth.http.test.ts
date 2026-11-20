import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceRequestService } from '../../src/application/service-request.service.js';
import { buildApp } from '../../src/http/app.js';
import { DEMO_ACCOUNTS } from '../../src/infrastructure/auth/demo-accounts.js';
import { LoginAttemptLimiter } from '../../src/infrastructure/auth/login-attempt-limiter.js';
import { HmacTokenService } from '../../src/infrastructure/auth/token-service.js';
import { InMemoryUserDirectory } from '../../src/infrastructure/auth/user-directory.js';
import { InMemoryServiceRequestRepository } from '../../src/infrastructure/memory/in-memory-service-request.repository.js';

const DEMO_PASSWORD = 'Mesa2026*';

describe('login with username and password', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const tokens = new HmacTokenService('test-secret-with-at-least-32-characters!!');
    app = await buildApp({
      service: new ServiceRequestService(new InMemoryServiceRequestRepository()),
      tokenVerifier: tokens,
      corsOrigins: [],
      localAuth: {
        directory: new InMemoryUserDirectory(DEMO_ACCOUNTS),
        tokens,
        limiter: new LoginAttemptLimiter({ maxFailures: 5, windowMs: 60_000 }),
      },
    });
  });

  afterAll(() => app.close());

  const login = (username: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

  const authorized = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

  it('resolves the tenant on the server from the account and signs it into the token', async () => {
    const res = await login('ana.cementos', DEMO_PASSWORD);

    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ tenantId: 'cementos', tenantName: 'Filial Cementos', role: 'REQUESTER' });
    const claims = JSON.parse(Buffer.from(res.json().token.split('.')[1], 'base64url').toString());
    expect(claims).toMatchObject({ sub: 'ana.cementos', tenantId: 'cementos', role: 'REQUESTER' });
  });

  it('accepts the username regardless of case and surrounding spaces', async () => {
    expect((await login('  Laura.Energia ', DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('every demo account can log in with the documented password', async () => {
    for (const account of DEMO_ACCOUNTS) {
      expect((await login(account.username, DEMO_PASSWORD)).statusCode).toBe(200);
    }
  });

  it('answers a wrong password and an unknown user identically (no user enumeration)', async () => {
    const wrongPassword = await login('ana.cementos', 'incorrecta');
    const unknownUser = await login('nadie.existe', DEMO_PASSWORD);

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos.' });
    expect(unknownUser.json()).toEqual(wrongPassword.json());
  });

  it('rejects an empty password with 400', async () => {
    expect((await login('ana.cementos', '')).statusCode).toBe(400);
  });

  it('end to end: each logged-in user only sees the requests of its own tenant', async () => {
    const ana = (await login('ana.cementos', DEMO_PASSWORD)).json().token;
    const laura = (await login('laura.energia', DEMO_PASSWORD)).json().token;
    await authorized(ana, 'POST', '/api/requests', { title: 'Nómina de octubre', description: 'x', category: 'PAYROLL' });

    const anaList = (await authorized(ana, 'GET', '/api/requests')).json();
    const lauraList = (await authorized(laura, 'GET', '/api/requests')).json();

    expect(anaList.items.map((i: { title: string }) => i.title)).toEqual(['Nómina de octubre']);
    expect(lauraList.items).toEqual([]);
  });
});

describe('login brute-force protection', () => {
  const MAX_FAILURES = 3;
  const WINDOW_MS = 15 * 60 * 1000;
  let app: FastifyInstance;
  let now: number;

  beforeAll(async () => {
    now = 0;
    const tokens = new HmacTokenService('test-secret-with-at-least-32-characters!!');
    app = await buildApp({
      service: new ServiceRequestService(new InMemoryServiceRequestRepository()),
      tokenVerifier: tokens,
      corsOrigins: [],
      localAuth: {
        directory: new InMemoryUserDirectory(DEMO_ACCOUNTS),
        tokens,
        limiter: new LoginAttemptLimiter({ maxFailures: MAX_FAILURES, windowMs: WINDOW_MS, now: () => now }),
      },
    });
  });

  afterAll(() => app.close());

  const login = (username: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

  const failTimes = async (username: string, times: number) => {
    for (let i = 0; i < times; i += 1) {
      expect((await login(username, 'incorrecta')).statusCode).toBe(401);
    }
  };

  it('locks the account after repeated failures, even for the right password, and says when to retry', async () => {
    await failTimes('ana.cementos', MAX_FAILURES);

    const locked = await login('ana.cementos', DEMO_PASSWORD);

    expect(locked.statusCode).toBe(429);
    expect(locked.json().code).toBe('TOO_MANY_ATTEMPTS');
    expect(Number(locked.headers['retry-after'])).toBe(WINDOW_MS / 1000);
  });

  it('does not affect other accounts', async () => {
    expect((await login('laura.energia', DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('allows logging in again once the window expires', async () => {
    now += WINDOW_MS;

    expect((await login('ana.cementos', DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('a successful login resets the failure count', async () => {
    await failTimes('diego.energia', MAX_FAILURES - 1);
    expect((await login('diego.energia', DEMO_PASSWORD)).statusCode).toBe(200);

    await failTimes('diego.energia', MAX_FAILURES - 1);

    expect((await login('diego.energia', DEMO_PASSWORD)).statusCode).toBe(200);
  });
});
