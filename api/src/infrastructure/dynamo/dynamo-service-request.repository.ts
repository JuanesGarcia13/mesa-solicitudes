import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type {
  ListQuery,
  NewServiceRequest,
  Page,
  ServiceRequestRepository,
  StatusUpdate,
} from '../../application/ports.js';
import { ConcurrencyConflictError } from '../../domain/errors.js';
import type { ServiceRequest, ServiceRequestSummary } from '../../domain/service-request.js';
import { GSI1_NAME, SUMMARY_ATTRIBUTES, keys } from './table-schema.js';

type Item = Record<string, unknown>;

export class DynamoServiceRequestRepository implements ServiceRequestRepository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(input: NewServiceRequest): Promise<ServiceRequest> {
    const number = await this.nextNumber(input.tenantId);
    const request: ServiceRequest = {
      tenantId: input.tenantId,
      number,
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
    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: toItem(request),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return request;
  }

  async findByNumber(tenantId: string, number: number): Promise<ServiceRequest | null> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: keys.partition(tenantId), SK: keys.request(number) },
        ConsistentRead: true,
      }),
    );
    return result.Item ? fromItem(result.Item) : null;
  }

  async list(tenantId: string, query: ListQuery): Promise<Page<ServiceRequestSummary>> {
    const result = await this.db.send(new QueryCommand(buildListQuery(this.tableName, tenantId, query)));
    const items = (result.Items ?? []).map((i) => i as ServiceRequestSummary);
    const last = items[items.length - 1];
    return result.LastEvaluatedKey && last ? { items, lastNumber: last.number } : { items };
  }

  async updateStatus(update: StatusUpdate): Promise<ServiceRequest> {
    try {
      const result = await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: keys.partition(update.tenantId), SK: keys.request(update.number) },
          ConditionExpression: 'attribute_exists(PK) AND #status = :expected',
          UpdateExpression:
            'SET #status = :to, GSI1PK = :gsi1pk, updatedAt = :at, ' +
            '#version = #version + :one, history = list_append(history, :change)',
          ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
          ExpressionAttributeValues: {
            ':expected': update.expectedStatus,
            ':to': update.change.to,
            ':gsi1pk': keys.statusPartition(update.tenantId, update.change.to),
            ':at': update.change.at,
            ':one': 1,
            ':change': [update.change],
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return fromItem(result.Attributes ?? {});
    } catch (error) {
      throw error instanceof ConditionalCheckFailedException ? new ConcurrencyConflictError() : error;
    }
  }

  /** Contador atómico por filial: números legibles y secuenciales (#1, #2, ...). */
  private async nextNumber(tenantId: string): Promise<number> {
    const result = await this.db.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: keys.partition(tenantId), SK: keys.counter() },
        UpdateExpression: 'ADD seq :one',
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return Number(result.Attributes?.['seq']);
  }
}

function buildListQuery(tableName: string, tenantId: string, query: ListQuery): QueryCommandInput {
  const projection = {
    ProjectionExpression: SUMMARY_ATTRIBUTES.map((a) => `#${a}`).join(', '),
    ExpressionAttributeNames: Object.fromEntries(SUMMARY_ATTRIBUTES.map((a) => [`#${a}`, a])),
  };
  const base = { TableName: tableName, Limit: query.limit, ScanIndexForward: false };
  const pk = keys.partition(tenantId);
  const after = query.afterNumber === undefined ? undefined : keys.request(query.afterNumber);

  if (query.status) {
    const gsi1pk = keys.statusPartition(tenantId, query.status);
    return {
      ...base,
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeNames: projection.ExpressionAttributeNames,
      ExpressionAttributeValues: { ':pk': gsi1pk },
      ProjectionExpression: projection.ProjectionExpression,
      ...(after ? { ExclusiveStartKey: { PK: pk, SK: after, GSI1PK: gsi1pk, GSI1SK: after } } : {}),
    };
  }
  return {
    ...base,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeNames: projection.ExpressionAttributeNames,
    ExpressionAttributeValues: { ':pk': pk, ':prefix': 'REQ#' },
    ProjectionExpression: projection.ProjectionExpression,
    ...(after ? { ExclusiveStartKey: { PK: pk, SK: after } } : {}),
  };
}

export function toItem(request: ServiceRequest): Item {
  return {
    PK: keys.partition(request.tenantId),
    SK: keys.request(request.number),
    GSI1PK: keys.statusPartition(request.tenantId, request.status),
    GSI1SK: keys.request(request.number),
    ...request,
  };
}

function fromItem(item: Item): ServiceRequest {
  const { PK: _pk, SK: _sk, GSI1PK: _g1, GSI1SK: _g2, ...rest } = item;
  return rest as unknown as ServiceRequest;
}
