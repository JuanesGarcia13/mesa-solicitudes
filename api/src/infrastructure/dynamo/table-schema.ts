import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import type { RequestStatus } from '../../domain/request-status.js';

/**
 * Diseño de tabla única (single-table):
 *
 * | Entidad    | PK                 | SK                 | GSI1PK                          | GSI1SK             |
 * |------------|--------------------|--------------------|---------------------------------|--------------------|
 * | Solicitud  | TENANT#<tenantId>  | REQ#<numero 10 d.> | TENANT#<tenantId>#STATUS#<st>   | REQ#<numero 10 d.> |
 * | Contador   | TENANT#<tenantId>  | COUNTER#REQ        | -                               | -                  |
 *
 * - Listar las solicitudes de una filial: Query PK = TENANT#t, orden descendente.
 * - Filtrar por estado: Query GSI1 con GSI1PK = TENANT#t#STATUS#s.
 * - Buscar por número: GetItem PK + SK.
 * La filial es parte de toda llave, así que ninguna operación cruza filiales.
 */
export const GSI1_NAME = 'GSI1';

export const SUMMARY_ATTRIBUTES = ['number', 'title', 'category', 'status', 'createdAt', 'updatedAt'] as const;

const NUMBER_DIGITS = 10;

export const keys = {
  partition: (tenantId: string): string => `TENANT#${tenantId}`,
  request: (number: number): string => `REQ#${String(number).padStart(NUMBER_DIGITS, '0')}`,
  counter: (): string => 'COUNTER#REQ',
  statusPartition: (tenantId: string, status: RequestStatus): string =>
    `TENANT#${tenantId}#STATUS#${status}`,
};

export function createTableInput(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: GSI1_NAME,
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'INCLUDE', NonKeyAttributes: [...SUMMARY_ATTRIBUTES] },
      },
    ],
  };
}
