import type { FastifyInstance } from 'fastify';
import type { ServiceRequestService } from '../../application/service-request.service.js';
import { MAX_PAGE_SIZE } from '../../application/service-request.service.js';
import { REQUEST_STATUSES, type RequestStatus } from '../../domain/request-status.js';
import { WORKFLOW_ACTIONS, type WorkflowAction } from '../../domain/request-workflow.js';
import { REQUEST_CATEGORIES, type RequestCategory } from '../../domain/service-request.js';
import type { TokenVerifier } from '../../infrastructure/auth/token-service.js';
import { currentUser, requireAuthentication } from '../auth.js';

interface ListQuerystring {
  status?: RequestStatus;
  limit?: number;
  cursor?: string;
}

interface NumberParams {
  number: number;
}

interface CreateBody {
  title: string;
  description: string;
  category: RequestCategory;
}

interface TransitionBody {
  action: WorkflowAction;
  comment?: string;
}

const numberParams = {
  type: 'object',
  required: ['number'],
  properties: { number: { type: 'integer', minimum: 1, maximum: 9_999_999_999 } },
} as const;

const listSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: [...REQUEST_STATUSES] },
      limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE },
      cursor: { type: 'string', maxLength: 200 },
    },
  },
} as const;

const createSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'description', 'category'],
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 120 },
      description: { type: 'string', minLength: 1, maxLength: 2000 },
      category: { type: 'string', enum: [...REQUEST_CATEGORIES] },
    },
  },
} as const;

const transitionSchema = {
  params: numberParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: { type: 'string', enum: [...WORKFLOW_ACTIONS] },
      comment: { type: 'string', maxLength: 1000 },
    },
  },
} as const;

export function serviceRequestRoutes(service: ServiceRequestService, verifier: TokenVerifier) {
  return async (app: FastifyInstance): Promise<void> => {
    requireAuthentication(app, verifier);

    app.get<{ Querystring: ListQuerystring }>('/requests', { schema: listSchema }, async (request) =>
      service.list(currentUser(request), request.query),
    );

    app.get<{ Params: NumberParams }>('/requests/:number', { schema: { params: numberParams } }, async (request) =>
      service.get(currentUser(request), request.params.number),
    );

    app.post<{ Body: CreateBody }>('/requests', { schema: createSchema }, async (request, reply) => {
      const created = await service.create(currentUser(request), request.body);
      return reply.status(201).header('location', `/api/requests/${created.number}`).send(created);
    });

    app.post<{ Params: NumberParams; Body: TransitionBody }>(
      '/requests/:number/transitions',
      { schema: transitionSchema },
      async (request) =>
        service.transition(currentUser(request), request.params.number, request.body.action, request.body.comment),
    );
  };
}
