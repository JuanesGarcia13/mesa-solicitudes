import type { FastifyInstance } from 'fastify';
import { AuthenticationError } from '../../domain/errors.js';
import type { UserContext } from '../../domain/user.js';
import type { DevTenant } from '../../infrastructure/auth/dev-users.js';
import type { HmacTokenService } from '../../infrastructure/auth/token-service.js';

export interface DevAuthOptions {
  readonly users: readonly UserContext[];
  readonly tenants: readonly DevTenant[];
  readonly tokens: HmacTokenService;
}

/** Solo existe en modo de autenticación "dev": sustituye a la pantalla de login del proveedor real. */
export function devAuthRoutes(options: DevAuthOptions) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/auth/dev-users', async () =>
      options.users.map((u) => ({
        ...u,
        tenantName: options.tenants.find((t) => t.id === u.tenantId)?.name ?? u.tenantId,
      })),
    );

    app.post<{ Body: { userId: string } }>(
      '/auth/dev-login',
      {
        schema: {
          body: {
            type: 'object',
            required: ['userId'],
            additionalProperties: false,
            properties: { userId: { type: 'string', maxLength: 100 } },
          },
        },
      },
      async (request) => {
        const user = options.users.find((u) => u.userId === request.body.userId);
        if (!user) {
          throw new AuthenticationError();
        }
        return { token: await options.tokens.sign(user), user };
      },
    );
  };
}
