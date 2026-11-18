import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { NewServiceRequest, ServiceRequestRepository } from '../../src/application/ports.js';
import { ConcurrencyConflictError } from '../../src/domain/errors.js';
import { createDocumentClient, createDynamoClient } from '../../src/infrastructure/dynamo/dynamo-client.js';
import { DynamoServiceRequestRepository } from '../../src/infrastructure/dynamo/dynamo-service-request.repository.js';
import { ensureTable } from '../../src/infrastructure/dynamo/ensure-table.js';
import { InMemoryServiceRequestRepository } from '../../src/infrastructure/memory/in-memory-service-request.repository.js';

/**
 * Misma batería de pruebas para ambas implementaciones. La de DynamoDB corre cuando
 * existe DYNAMO_ENDPOINT (docker compose up dynamodb, o el service container del CI).
 */
type Factory = () => Promise<ServiceRequestRepository>;

const endpoint = process.env['DYNAMO_ENDPOINT'];
const targets: [string, Factory][] = [['in-memory', async () => new InMemoryServiceRequestRepository()]];
if (endpoint) {
  targets.push([
    'dynamodb',
    async () => {
      const client = createDynamoClient({ region: 'us-east-1', endpoint });
      const tableName = `test-${randomUUID()}`;
      await ensureTable(client, tableName);
      return new DynamoServiceRequestRepository(createDocumentClient(client), tableName);
    },
  ]);
}

const newRequest = (tenantId: string, title = 'Solicitud'): NewServiceRequest => ({
  tenantId,
  title,
  description: 'detalle',
  category: 'PAYROLL',
  createdBy: 'u1',
  change: { action: 'CREATE', from: null, to: 'REGISTERED', byUserId: 'u1', byRole: 'REQUESTER', at: new Date().toISOString() },
});

describe.each(targets)('ServiceRequestRepository contract (%s)', (_name, factory) => {
  let repo: ServiceRequestRepository;

  beforeAll(async () => {
    repo = await factory();
    for (let i = 1; i <= 5; i++) await repo.create(newRequest('t-a', `A${i}`));
    await repo.create(newRequest('t-b', 'B1'));
  }, 30_000);

  it('numbers requests sequentially per tenant', async () => {
    expect((await repo.findByNumber('t-a', 5))?.title).toBe('A5');
    expect((await repo.findByNumber('t-b', 1))?.title).toBe('B1');
  });

  it('never returns a request from another tenant partition', async () => {
    expect(await repo.findByNumber('t-b', 5)).toBeNull();
    const page = await repo.list('t-b', { limit: 50 });
    expect(page.items.map((i) => i.title)).toEqual(['B1']);
  });

  it('lists newest first and paginates until exhausted', async () => {
    const first = await repo.list('t-a', { limit: 3 });
    expect(first.items.map((i) => i.number)).toEqual([5, 4, 3]);
    const second = await repo.list('t-a', { limit: 3, afterNumber: first.lastNumber });
    expect(second.items.map((i) => i.number)).toEqual([2, 1]);
  });

  it('applies a status change only from the expected status and indexes the new status', async () => {
    const at = new Date().toISOString();
    const change = { action: 'START', from: 'REGISTERED', to: 'IN_PROGRESS', byUserId: 'u2', byRole: 'ANALYST', at } as const;

    const updated = await repo.updateStatus({ tenantId: 't-a', number: 2, expectedStatus: 'REGISTERED', change });

    expect(updated).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
    expect(updated.history).toHaveLength(2);
    const filtered = await repo.list('t-a', { limit: 10, status: 'IN_PROGRESS' });
    expect(filtered.items.map((i) => i.number)).toEqual([2]);
    await expect(
      repo.updateStatus({ tenantId: 't-a', number: 2, expectedStatus: 'REGISTERED', change }),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('cannot update a request through another tenant key', async () => {
    const change = { action: 'START', from: 'REGISTERED', to: 'IN_PROGRESS', byUserId: 'x', byRole: 'ANALYST', at: '' } as const;

    await expect(
      repo.updateStatus({ tenantId: 't-b', number: 3, expectedStatus: 'REGISTERED', change }),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect((await repo.findByNumber('t-a', 3))?.status).toBe('REGISTERED');
  });
});
