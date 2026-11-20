import type { FastifyInstance } from 'fastify';
import type { ServiceRequestRepository } from './application/ports.js';
import { ServiceRequestService } from './application/service-request.service.js';
import type { AppConfig, AuthConfig } from './config.js';
import { buildApp } from './http/app.js';
import { DEMO_ACCOUNTS } from './infrastructure/auth/demo-accounts.js';
import { LoginAttemptLimiter } from './infrastructure/auth/login-attempt-limiter.js';
import { HmacTokenService, JwksTokenVerifier, type TokenVerifier } from './infrastructure/auth/token-service.js';
import { InMemoryUserDirectory } from './infrastructure/auth/user-directory.js';
import { createDocumentClient, createDynamoClient } from './infrastructure/dynamo/dynamo-client.js';
import { DynamoServiceRequestRepository } from './infrastructure/dynamo/dynamo-service-request.repository.js';
import { InMemoryServiceRequestRepository } from './infrastructure/memory/in-memory-service-request.repository.js';

/** Único lugar donde se eligen las implementaciones concretas según la configuración. */
export async function createApplication(config: AppConfig): Promise<FastifyInstance> {
  const { verifier, devTokens } = createTokenServices(config.auth);
  return buildApp({
    service: new ServiceRequestService(createRepository(config)),
    tokenVerifier: verifier,
    corsOrigins: config.corsOrigins,
    logger: { level: config.logLevel, redact: ['req.headers.authorization'] },
    ...(devTokens
      ? { localAuth: { directory: new InMemoryUserDirectory(DEMO_ACCOUNTS), tokens: devTokens, limiter: createLoginLimiter() } }
      : {}),
  });
}

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;

function createLoginLimiter(): LoginAttemptLimiter {
  return new LoginAttemptLimiter({ maxFailures: MAX_LOGIN_FAILURES, windowMs: LOGIN_LOCK_WINDOW_MS });
}

function createTokenServices(auth: AuthConfig): { verifier: TokenVerifier; devTokens?: HmacTokenService } {
  if (auth.mode === 'dev') {
    const tokens = new HmacTokenService(auth.secret);
    return { verifier: tokens, devTokens: tokens };
  }
  return { verifier: new JwksTokenVerifier(auth.jwksUrl, auth.issuer, auth.audience) };
}

function createRepository(config: AppConfig): ServiceRequestRepository {
  if (config.persistence === 'memory') {
    return new InMemoryServiceRequestRepository();
  }
  const client = createDynamoClient({
    region: config.region,
    ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
  });
  return new DynamoServiceRequestRepository(createDocumentClient(client), config.tableName);
}
