import { ActionNotAllowedError, RequestNotFoundError } from '../domain/errors.js';
import { INITIAL_STATUS, type RequestStatus } from '../domain/request-status.js';
import {
  allowedActions,
  planTransition,
  type WorkflowAction,
} from '../domain/request-workflow.js';
import type {
  RequestCategory,
  ServiceRequest,
  ServiceRequestSummary,
} from '../domain/service-request.js';
import type { UserContext } from '../domain/user.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import type { Clock, ServiceRequestRepository } from './ports.js';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface CreateRequestInput {
  readonly title: string;
  readonly description: string;
  readonly category: RequestCategory;
}

export interface ListRequestsInput {
  readonly status?: RequestStatus;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface RequestListResult {
  readonly items: ServiceRequestSummary[];
  readonly nextCursor: string | null;
}

export interface RequestDetail extends ServiceRequest {
  readonly allowedActions: WorkflowAction[];
}

/**
 * Casos de uso de la Mesa de Solicitudes. Cada método recibe el UserContext
 * verificado y usa user.tenantId como única fuente de la filial.
 */
export class ServiceRequestService {
  constructor(
    private readonly repository: ServiceRequestRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async create(user: UserContext, input: CreateRequestInput): Promise<RequestDetail> {
    if (user.role !== 'REQUESTER') {
      throw new ActionNotAllowedError('Solo la filial puede registrar solicitudes.');
    }
    const created = await this.repository.create({
      tenantId: user.tenantId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      createdBy: user.userId,
      change: {
        action: 'CREATE',
        from: null,
        to: INITIAL_STATUS,
        byUserId: user.userId,
        byRole: user.role,
        at: this.clock().toISOString(),
      },
    });
    return toDetail(created, user);
  }

  async list(user: UserContext, input: ListRequestsInput): Promise<RequestListResult> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = await this.repository.list(user.tenantId, {
      limit,
      ...(input.status ? { status: input.status } : {}),
      ...(input.cursor ? { afterNumber: decodeCursor(input.cursor) } : {}),
    });
    return {
      items: page.items,
      nextCursor: page.lastNumber === undefined ? null : encodeCursor(page.lastNumber),
    };
  }

  async get(user: UserContext, number: number): Promise<RequestDetail> {
    return toDetail(await this.findOwned(user, number), user);
  }

  async transition(
    user: UserContext,
    number: number,
    action: WorkflowAction,
    comment?: string,
  ): Promise<RequestDetail> {
    const current = await this.findOwned(user, number);
    const planned = planTransition(current.status, action, user.role, comment);
    const updated = await this.repository.updateStatus({
      tenantId: user.tenantId,
      number,
      expectedStatus: planned.from,
      change: {
        action,
        from: planned.from,
        to: planned.to,
        byUserId: user.userId,
        byRole: user.role,
        at: this.clock().toISOString(),
        ...(planned.comment ? { comment: planned.comment } : {}),
      },
    });
    return toDetail(updated, user);
  }

  private async findOwned(user: UserContext, number: number): Promise<ServiceRequest> {
    const found = await this.repository.findByNumber(user.tenantId, number);
    if (!found) {
      throw new RequestNotFoundError();
    }
    return found;
  }
}

function toDetail(request: ServiceRequest, user: UserContext): RequestDetail {
  return { ...request, allowedActions: allowedActions(request.status, user.role) };
}
