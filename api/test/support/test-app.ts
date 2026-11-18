import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { ServiceRequestRepository } from '../../src/application/ports.js';
import { ServiceRequestService } from '../../src/application/service-request.service.js';
import type { UserContext } from '../../src/domain/user.js';
import { buildApp } from '../../src/http/app.js';
import { HmacTokenService } from '../../src/infrastructure/auth/token-service.js';
import { InMemoryServiceRequestRepository } from '../../src/infrastructure/memory/in-memory-service-request.repository.js';

export const USERS = {
  requesterA: { userId: 'ana', name: 'Ana', tenantId: 'tenant-a', role: 'REQUESTER' },
  analystA: { userId: 'carlos', name: 'Carlos', tenantId: 'tenant-a', role: 'ANALYST' },
  requesterB: { userId: 'laura', name: 'Laura', tenantId: 'tenant-b', role: 'REQUESTER' },
  analystB: { userId: 'diego', name: 'Diego', tenantId: 'tenant-b', role: 'ANALYST' },
} as const satisfies Record<string, UserContext>;

export interface TestApp {
  readonly app: FastifyInstance;
  readonly tokens: HmacTokenService;
  as(user: UserContext): ApiClient;
}

export interface ApiClient {
  get(url: string): Promise<LightMyRequestResponse>;
  post(url: string, payload?: object): Promise<LightMyRequestResponse>;
}

export async function createTestApp(
  repository: ServiceRequestRepository = new InMemoryServiceRequestRepository(),
): Promise<TestApp> {
  const tokens = new HmacTokenService('test-secret-with-at-least-32-characters!!');
  const app = await buildApp({
    service: new ServiceRequestService(repository),
    tokenVerifier: tokens,
    corsOrigins: ['http://localhost'],
  });
  const as = (user: UserContext): ApiClient => ({
    get: async (url) =>
      app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${await tokens.sign(user)}` } }),
    post: async (url, payload) =>
      app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${await tokens.sign(user)}` },
        ...(payload ? { payload } : {}),
      }),
  });
  return { app, tokens, as };
}

export const sampleRequest = {
  title: 'Pago a proveedor pendiente',
  description: 'La factura 123 del proveedor X no se ha pagado.',
  category: 'PURCHASES',
} as const;
