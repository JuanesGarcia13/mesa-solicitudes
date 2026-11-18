import type {
  ListQuery,
  NewServiceRequest,
  Page,
  ServiceRequestRepository,
  StatusUpdate,
} from '../../application/ports.js';
import { ConcurrencyConflictError } from '../../domain/errors.js';
import type { ServiceRequest, ServiceRequestSummary } from '../../domain/service-request.js';

/**
 * Implementación en memoria con la misma semántica que la de DynamoDB
 * (partición por filial, orden descendente por número, escritura condicional).
 * Se usa en pruebas y para correr la API sin base de datos.
 */
export class InMemoryServiceRequestRepository implements ServiceRequestRepository {
  private readonly partitions = new Map<string, Map<number, ServiceRequest>>();

  async create(input: NewServiceRequest): Promise<ServiceRequest> {
    const partition = this.partition(input.tenantId);
    const request: ServiceRequest = {
      tenantId: input.tenantId,
      number: partition.size + 1,
      title: input.title,
      description: input.description,
      category: input.category,
      status: input.change.to,
      createdBy: input.createdBy,
      createdAt: input.change.at,
      updatedAt: input.change.at,
      version: 1,
      history: [input.change],
    };
    partition.set(request.number, request);
    return structuredClone(request);
  }

  async findByNumber(tenantId: string, number: number): Promise<ServiceRequest | null> {
    const found = this.partitions.get(tenantId)?.get(number);
    return found ? structuredClone(found) : null;
  }

  async list(tenantId: string, query: ListQuery): Promise<Page<ServiceRequestSummary>> {
    const all = [...(this.partitions.get(tenantId)?.values() ?? [])]
      .filter((r) => !query.status || r.status === query.status)
      .filter((r) => query.afterNumber === undefined || r.number < query.afterNumber)
      .sort((a, b) => b.number - a.number);
    const items = all.slice(0, query.limit).map(toSummary);
    const hasMore = all.length > query.limit;
    return hasMore ? { items, lastNumber: items[items.length - 1]?.number } : { items };
  }

  async updateStatus(update: StatusUpdate): Promise<ServiceRequest> {
    const partition = this.partition(update.tenantId);
    const current = partition.get(update.number);
    if (!current || current.status !== update.expectedStatus) {
      throw new ConcurrencyConflictError();
    }
    const next: ServiceRequest = {
      ...current,
      status: update.change.to,
      updatedAt: update.change.at,
      version: current.version + 1,
      history: [...current.history, update.change],
    };
    partition.set(update.number, next);
    return structuredClone(next);
  }

  private partition(tenantId: string): Map<number, ServiceRequest> {
    let partition = this.partitions.get(tenantId);
    if (!partition) {
      partition = new Map();
      this.partitions.set(tenantId, partition);
    }
    return partition;
  }
}

function toSummary(r: ServiceRequest): ServiceRequestSummary {
  return {
    number: r.number,
    title: r.title,
    category: r.category,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
