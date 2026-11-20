import { TooManyLoginAttemptsError } from '../../domain/errors.js';

export interface LoginAttemptLimiterOptions {
  readonly maxFailures: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

interface Attempts {
  failures: number;
  windowStartedAt: number;
}

const PRUNE_THRESHOLD = 1_000;

/**
 * Frena la fuerza bruta del login local: tras `maxFailures` intentos fallidos para el mismo
 * usuario desde la misma IP, rechaza nuevos intentos hasta que termine la ventana.
 * La clave combina usuario e IP para que un atacante no pueda bloquear a un usuario legítimo
 * que entra desde otra red. No se confía en X-Forwarded-For (se podría falsificar para evadir
 * el límite), así que detrás de nginx la IP es la del proxy y la clave queda, en la práctica,
 * por usuario. Vive en memoria por instancia: en AWS el login lo hace Cognito, que trae su
 * propia protección contra fuerza bruta.
 */
export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, Attempts>();
  private readonly now: () => number;

  constructor(private readonly options: LoginAttemptLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  assertAllowed(username: string, ip: string): void {
    const entry = this.activeEntry(keyOf(username, ip));
    if (entry && entry.failures >= this.options.maxFailures) {
      const retryAfterMs = entry.windowStartedAt + this.options.windowMs - this.now();
      throw new TooManyLoginAttemptsError(Math.ceil(retryAfterMs / 1000));
    }
  }

  recordFailure(username: string, ip: string): void {
    const key = keyOf(username, ip);
    const entry = this.activeEntry(key) ?? { failures: 0, windowStartedAt: this.now() };
    entry.failures += 1;
    this.attempts.set(key, entry);
    this.pruneIfLarge();
  }

  reset(username: string, ip: string): void {
    this.attempts.delete(keyOf(username, ip));
  }

  private activeEntry(key: string): Attempts | undefined {
    const entry = this.attempts.get(key);
    if (entry && this.isExpired(entry)) {
      this.attempts.delete(key);
      return undefined;
    }
    return entry;
  }

  private isExpired(entry: Attempts): boolean {
    return this.now() - entry.windowStartedAt >= this.options.windowMs;
  }

  private pruneIfLarge(): void {
    if (this.attempts.size < PRUNE_THRESHOLD) return;
    for (const [key, entry] of this.attempts) {
      if (this.isExpired(entry)) this.attempts.delete(key);
    }
  }
}

function keyOf(username: string, ip: string): string {
  return `${username.trim().toLowerCase()}|${ip}`;
}
