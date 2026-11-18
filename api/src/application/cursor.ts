import { ValidationError } from '../domain/errors.js';

/**
 * El cursor solo transporta el número de la última solicitud vista. La filial
 * nunca viaja en el cursor: se reconstruye desde el token en cada consulta, por
 * lo que manipularlo no permite saltar a la partición de otra filial.
 */
export function encodeCursor(lastNumber: number): string {
  return Buffer.from(JSON.stringify({ n: lastNumber }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): number {
  const invalid = new ValidationError('El cursor de paginación no es válido.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid;
  }
  const n = (parsed as { n?: unknown } | null)?.n;
  if (!Number.isSafeInteger(n) || (n as number) < 1) {
    throw invalid;
  }
  return n as number;
}
