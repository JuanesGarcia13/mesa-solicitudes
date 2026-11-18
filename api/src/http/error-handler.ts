import type { FastifyError, FastifyInstance } from 'fastify';
import { DomainError } from '../domain/errors.js';

const HTTP_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  ACTION_NOT_ALLOWED: 403,
  REQUEST_NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INVALID_TRANSITION: 409,
  REQUEST_CLOSED: 409,
  CONCURRENT_MODIFICATION: 409,
};

export interface ErrorBody {
  readonly code: string;
  readonly message: string;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(HTTP_STATUS_BY_CODE[error.code] ?? 400).send(body(error.code, error.message));
    }
    if (error.validation) {
      return reply.status(400).send(body('VALIDATION_ERROR', `Datos inválidos: ${error.message}`));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(body('INTERNAL_ERROR', 'Ocurrió un error inesperado. Intenta de nuevo.'));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(body('ROUTE_NOT_FOUND', 'El recurso solicitado no existe.')),
  );
}

function body(code: string, message: string): ErrorBody {
  return { code, message };
}
