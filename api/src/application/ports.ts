import type { RequestStatus } from '../domain/request-status.js';
import type {
  RequestCategory,
  ServiceRequest,
  ServiceRequestSummary,
  StatusChange,
} from '../domain/service-request.js';

export interface ListQuery {
  readonly status?: RequestStatus;
  readonly limit: number;
  /** Número de la última solicitud vista; la página siguiente trae las anteriores a esta. */
  readonly afterNumber?: number;
}

export interface Page<T> {
  readonly items: T[];
  readonly lastNumber?: number;
}

export interface NewServiceRequest {
  readonly tenantId: string;
  readonly title: string;
  readonly description: string;
  readonly category: RequestCategory;
  readonly createdBy: string;
  readonly change: StatusChange;
}

export interface StatusUpdate {
  readonly tenantId: string;
  readonly number: number;
  readonly expectedStatus: RequestStatus;
  readonly change: StatusChange;
}

/**
 * Contrato de persistencia. Toda operación exige tenantId como parte de la llave:
 * no existe forma de leer o escribir una solicitud sin indicar a qué filial pertenece.
 */
export interface ServiceRequestRepository {
  create(input: NewServiceRequest): Promise<ServiceRequest>;
  findByNumber(tenantId: string, number: number): Promise<ServiceRequest | null>;
  list(tenantId: string, query: ListQuery): Promise<Page<ServiceRequestSummary>>;
  /** Aplica el cambio solo si el estado sigue siendo expectedStatus; si no, ConcurrencyConflictError. */
  updateStatus(update: StatusUpdate): Promise<ServiceRequest>;
}

export type Clock = () => Date;
