import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { createTableInput } from './table-schema.js';

/** Crea la tabla si no existe. Solo para entornos locales y pruebas: en AWS la crea el CDK. */
export async function ensureTable(client: DynamoDBClient, tableName: string): Promise<'created' | 'exists'> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return 'exists';
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }
  }
  await client.send(new CreateTableCommand(createTableInput(tableName)));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
  return 'created';
}

/** Reintenta hasta que DynamoDB Local acepte conexiones (el contenedor tarda unos segundos). */
export async function waitForDynamo(client: DynamoDBClient, attempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await client.send(new DescribeTableCommand({ TableName: '__ping__' }));
      return;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('DynamoDB no respondió a tiempo.');
}
