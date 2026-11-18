import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface DynamoSettings {
  readonly region: string;
  readonly endpoint?: string;
}

export function createDynamoClient(settings: DynamoSettings): DynamoDBClient {
  const config: DynamoDBClientConfig = { region: settings.region };
  if (settings.endpoint) {
    config.endpoint = settings.endpoint;
    config.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
  }
  return new DynamoDBClient(config);
}

export function createDocumentClient(client: DynamoDBClient): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
