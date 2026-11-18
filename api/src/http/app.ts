import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { ServiceRequestService } from '../application/service-request.service.js';
import type { TokenVerifier } from '../infrastructure/auth/token-service.js';
import { registerErrorHandling } from './error-handler.js';
import { devAuthRoutes, type DevAuthOptions } from './routes/dev-auth.routes.js';
import { serviceRequestRoutes } from './routes/service-requests.routes.js';

export interface AppDependencies {
  readonly service: ServiceRequestService;
  readonly tokenVerifier: TokenVerifier;
  readonly corsOrigins: string[];
  readonly devAuth?: DevAuthOptions;
  readonly logger?: FastifyServerOptions['logger'];
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });

  app.decorateRequest('user', null);
  registerErrorHandling(app);
  await app.register(cors, { origin: deps.corsOrigins });

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok' }));
      if (deps.devAuth) {
        await api.register(devAuthRoutes(deps.devAuth));
      }
      await api.register(serviceRequestRoutes(deps.service, deps.tokenVerifier));
    },
    { prefix: '/api' },
  );

  return app;
}
