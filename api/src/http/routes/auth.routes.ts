import type { FastifyInstance } from 'fastify';
import { InvalidCredentialsError } from '../../domain/errors.js';
import type { HmacTokenService } from '../../infrastructure/auth/token-service.js';
import type { UserDirectory } from '../../infrastructure/auth/user-directory.js';

export interface LocalAuthOptions {
  readonly directory: UserDirectory;
  readonly tokens: HmacTokenService;
}

interface LoginBody {
  username: string;
  password: string;
}

const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 1, maxLength: 100 },
      password: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
} as const;

/**
 * Login del entorno local: valida credenciales, deduce la filial de la cuenta y firma
 * un JWT con ella. En AWS este paso lo hace Cognito y la API solo verifica el token.
 */
export function authRoutes(options: LocalAuthOptions) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post<{ Body: LoginBody }>('/auth/login', { schema: loginSchema }, async (request) => {
      const user = await options.directory.authenticate(request.body.username, request.body.password);
      if (!user) {
        throw new InvalidCredentialsError();
      }
      return { token: await options.tokens.sign(user), user };
    });
  };
}
