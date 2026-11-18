import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthenticationError } from '../../domain/errors.js';
import { isUserRole, type UserContext } from '../../domain/user.js';

export interface TokenVerifier {
  verify(token: string): Promise<UserContext>;
}

const ISSUER = 'mesa-solicitudes-dev';
const AUDIENCE = 'mesa-solicitudes';

/**
 * Identidad simulada para desarrollo: JWT HS256 firmado por la propia API.
 * Lo importante es que la filial viaja como claim firmado y no puede alterarse.
 */
export class HmacTokenService implements TokenVerifier {
  private readonly key: Uint8Array;

  constructor(secret: string, private readonly ttl = '8h') {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(user: UserContext): Promise<string> {
    return new SignJWT({ tenantId: user.tenantId, role: user.role, name: user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(this.ttl)
      .sign(this.key);
  }

  async verify(token: string): Promise<UserContext> {
    return verifyWith(() => jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE }));
  }
}

/**
 * Verificación contra un proveedor real (Amazon Cognito) usando su JWKS.
 * Cognito expone atributos personalizados como "custom:tenantId" y "custom:role".
 */
export class JwksTokenVerifier implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(jwksUrl: string, private readonly issuer: string, private readonly audience: string) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verify(token: string): Promise<UserContext> {
    return verifyWith(() => jwtVerify(token, this.jwks, { issuer: this.issuer, audience: this.audience }));
  }
}

async function verifyWith(run: () => Promise<{ payload: JWTPayload }>): Promise<UserContext> {
  try {
    const { payload } = await run();
    return toUserContext(payload);
  } catch {
    throw new AuthenticationError();
  }
}

function toUserContext(payload: JWTPayload): UserContext {
  const tenantId = payload['tenantId'] ?? payload['custom:tenantId'];
  const role = payload['role'] ?? payload['custom:role'];
  const name = payload['name'] ?? payload.sub;
  if (!payload.sub || typeof tenantId !== 'string' || !tenantId || !isUserRole(role)) {
    throw new AuthenticationError();
  }
  return { userId: payload.sub, tenantId, role, name: String(name) };
}
