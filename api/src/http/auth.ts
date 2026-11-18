import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuthenticationError } from '../domain/errors.js';
import type { UserContext } from '../domain/user.js';
import type { TokenVerifier } from '../infrastructure/auth/token-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserContext | null;
  }
}

/**
 * Exige un Bearer token válido en todas las rutas del contexto donde se registra.
 * Desde aquí, request.user es la única fuente de la filial para los casos de uso.
 */
export function requireAuthentication(app: FastifyInstance, verifier: TokenVerifier): void {
  app.addHook('onRequest', async (request) => {
    const token = extractBearer(request);
    const user = await verifier.verify(token);
    request.user = user;
    request.log = request.log.child({ tenantId: user.tenantId, userId: user.userId });
  });
}

export function currentUser(request: FastifyRequest): UserContext {
  if (!request.user) {
    throw new AuthenticationError();
  }
  return request.user;
}

function extractBearer(request: FastifyRequest): string {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AuthenticationError();
  }
  return token;
}
