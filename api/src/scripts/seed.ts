import { BatchWriteCommand, GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from '../config.js';
import { createDocumentClient, createDynamoClient } from '../infrastructure/dynamo/dynamo-client.js';
import { DynamoServiceRequestRepository, toItem } from '../infrastructure/dynamo/dynamo-service-request.repository.js';
import { ensureTable, waitForDynamo } from '../infrastructure/dynamo/ensure-table.js';
import { keys } from '../infrastructure/dynamo/table-schema.js';
import { buildRequest, createRandom, type TenantSeed } from './seed-data.js';

/**
 * Carga datos de prueba de volumen. Idempotente: si una filial ya tiene datos, la omite.
 * Uso: npm run seed            (valores por defecto)
 *      SEED_VOLUME=50000 npm run seed
 */
const BATCH_SIZE = 25;
const CONCURRENCY = 8;
const MEASURE_RUNS = 5;
const volume = Number(process.env['SEED_VOLUME'] ?? 50_000);

const TENANTS: readonly TenantSeed[] = [
  { tenantId: 'cementos', requesterId: 'ana.cementos', analystId: 'carlos.cementos', count: volume },
  { tenantId: 'energia', requesterId: 'laura.energia', analystId: 'diego.energia', count: 120 },
  // 'concesiones' queda sin solicitudes a propósito, para ver el estado vacío en la pantalla.
];

const config = loadConfig({ AUTH_DEV_SECRET: 'x'.repeat(32), ...process.env });
const client = createDynamoClient({
  region: config.region,
  ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
});
const db = createDocumentClient(client);

await waitForDynamo(client);
await ensureTable(client, config.tableName);

for (const tenant of TENANTS) {
  await seedTenant(db, tenant);
}
await measure(db);

async function seedTenant(doc: DynamoDBDocumentClient, tenant: TenantSeed): Promise<void> {
  const counter = await doc.send(
    new GetCommand({ TableName: config.tableName, Key: { PK: keys.partition(tenant.tenantId), SK: keys.counter() } }),
  );
  if (counter.Item) {
    console.log(`Filial ${tenant.tenantId}: ya tiene datos (${counter.Item['seq']}), se omite.`);
    return;
  }
  const started = Date.now();
  const random = createRandom(42);
  const items = Array.from({ length: tenant.count }, (_, i) => toItem(buildRequest(tenant, i + 1, started, random)));
  const batches = chunk(items, BATCH_SIZE);
  let done = 0;
  await runWithConcurrency(batches, CONCURRENCY, async (batch) => {
    await writeBatch(doc, batch);
    done += batch.length;
    if (done % 10_000 === 0) console.log(`  ${tenant.tenantId}: ${done}/${tenant.count}`);
  });
  await doc.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { PK: keys.partition(tenant.tenantId), SK: keys.counter(), seq: tenant.count },
    }),
  );
  console.log(`Filial ${tenant.tenantId}: ${tenant.count} solicitudes en ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}

async function writeBatch(doc: DynamoDBDocumentClient, items: Record<string, unknown>[]): Promise<void> {
  let pending = items.map((Item) => ({ PutRequest: { Item } }));
  for (let attempt = 0; pending.length > 0 && attempt < 8; attempt++) {
    const result = await doc.send(new BatchWriteCommand({ RequestItems: { [config.tableName]: pending } }));
    pending = (result.UnprocessedItems?.[config.tableName] ?? []) as typeof pending;
    if (pending.length > 0) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
  }
  if (pending.length > 0) throw new Error(`No se pudieron escribir ${pending.length} elementos.`);
}

/** Evidencia de rendimiento: tiempo de las consultas que usa la pantalla sobre la filial de mayor volumen. */
async function measure(doc: DynamoDBDocumentClient): Promise<void> {
  const repo = new DynamoServiceRequestRepository(doc, config.tableName);
  const tenantId = TENANTS[0]?.tenantId ?? 'cementos';
  const probes: [string, () => Promise<unknown>][] = [
    ['Primera página (25)', () => repo.list(tenantId, { limit: 25 })],
    ['Filtro por estado REGISTERED', () => repo.list(tenantId, { limit: 25, status: 'REGISTERED' })],
    ['Filtro por estado CLOSED, página 100', () => repo.list(tenantId, { limit: 25, status: 'CLOSED', afterNumber: 25_000 })],
    ['Búsqueda por número', () => repo.findByNumber(tenantId, 12_345)],
  ];
  // Calentamiento: la primera consulta paga el arranque en frío de DynamoDB Local (JVM)
  // y de las conexiones HTTP; no representa el tiempo de una consulta real.
  for (const [, probe] of probes) await probe();

  console.log(`\nTiempos de consulta sobre la filial "${tenantId}" (mediana de ${MEASURE_RUNS} ejecuciones):`);
  for (const [label, probe] of probes) {
    const samples: number[] = [];
    for (let run = 0; run < MEASURE_RUNS; run++) {
      const t0 = performance.now();
      await probe();
      samples.push(performance.now() - t0);
    }
    console.log(`  ${label.padEnd(40)} ${median(samples).toFixed(1)} ms`);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const item = items[index++];
      if (item) await worker(item);
    }
  });
  await Promise.all(runners);
}
