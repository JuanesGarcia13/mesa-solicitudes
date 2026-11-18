import { loadConfig } from '../config.js';
import { createDynamoClient } from '../infrastructure/dynamo/dynamo-client.js';
import { ensureTable, waitForDynamo } from '../infrastructure/dynamo/ensure-table.js';

const config = loadConfig({ AUTH_DEV_SECRET: 'x'.repeat(32), ...process.env });
const client = createDynamoClient({
  region: config.region,
  ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
});

await waitForDynamo(client);
const result = await ensureTable(client, config.tableName);
console.log(`Tabla ${config.tableName}: ${result === 'created' ? 'creada' : 'ya existía'}.`);
