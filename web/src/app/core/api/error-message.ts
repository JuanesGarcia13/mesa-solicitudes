import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from './api.models';

/** Traduce un error HTTP a un mensaje entendible. Prioriza el mensaje del backend. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Ocurrió un error inesperado.';
  }
  if (error.status === 0) {
    return 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  }
  const body = error.error as Partial<ApiError> | null;
  if (body?.message && error.status < 500) {
    return body.message;
  }
  return 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.';
}
