export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Se usa tanto si la solicitud no existe como si pertenece a otra filial: no revela existencia. */
export class RequestNotFoundError extends DomainError {
  readonly code = 'REQUEST_NOT_FOUND';

  constructor() {
    super('La solicitud no existe.');
  }
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
}

export class RequestClosedError extends DomainError {
  readonly code = 'REQUEST_CLOSED';

  constructor() {
    super('La solicitud está cerrada y no admite cambios.');
  }
}

export class ActionNotAllowedError extends DomainError {
  readonly code = 'ACTION_NOT_ALLOWED';
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

export class ConcurrencyConflictError extends DomainError {
  readonly code = 'CONCURRENT_MODIFICATION';

  constructor() {
    super('La solicitud cambió mientras se procesaba tu acción. Consulta su estado actual e inténtalo de nuevo.');
  }
}

export class AuthenticationError extends DomainError {
  readonly code = 'UNAUTHENTICATED';

  constructor() {
    super('Debes iniciar sesión para continuar.');
  }
}
