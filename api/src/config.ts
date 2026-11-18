export type AuthConfig =
  | { readonly mode: 'dev'; readonly secret: string }
  | { readonly mode: 'jwks'; readonly jwksUrl: string; readonly issuer: string; readonly audience: string };

export interface AppConfig {
  readonly port: number;
  readonly persistence: 'dynamo' | 'memory';
  readonly tableName: string;
  readonly region: string;
  readonly dynamoEndpoint?: string;
  readonly corsOrigins: string[];
  readonly auth: AuthConfig;
  readonly logLevel: string;
}

const DEV_SECRET_MIN_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env['PORT'] ?? 3000),
    persistence: env['PERSISTENCE'] === 'memory' ? 'memory' : 'dynamo',
    tableName: env['TABLE_NAME'] ?? 'service-requests',
    region: env['AWS_REGION'] ?? 'us-east-1',
    ...(env['DYNAMO_ENDPOINT'] ? { dynamoEndpoint: env['DYNAMO_ENDPOINT'] } : {}),
    corsOrigins: (env['CORS_ORIGINS'] ?? 'http://localhost:4200')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    auth: loadAuthConfig(env),
    logLevel: env['LOG_LEVEL'] ?? 'info',
  };
}

function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  if (env['AUTH_MODE'] === 'jwks') {
    return {
      mode: 'jwks',
      jwksUrl: required(env, 'AUTH_JWKS_URL'),
      issuer: required(env, 'AUTH_ISSUER'),
      audience: required(env, 'AUTH_AUDIENCE'),
    };
  }
  const secret = required(env, 'AUTH_DEV_SECRET');
  if (secret.length < DEV_SECRET_MIN_LENGTH) {
    throw new Error(`AUTH_DEV_SECRET debe tener al menos ${DEV_SECRET_MIN_LENGTH} caracteres.`);
  }
  return { mode: 'dev', secret };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}
