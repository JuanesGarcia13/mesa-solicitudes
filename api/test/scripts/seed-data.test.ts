import { describe, expect, it } from 'vitest';
import { planTransition } from '../../src/domain/request-workflow.js';
import { buildRequest, createRandom } from '../../src/scripts/seed-data.js';

describe('seed data', () => {
  const tenant = { tenantId: 't', requesterId: 'r', analystId: 'a', count: 2000 };
  const now = Date.UTC(2026, 10, 18);
  const random = createRandom(42);
  const requests = Array.from({ length: tenant.count }, (_, i) => buildRequest(tenant, i + 1, now, random));

  it('only contains histories that respect the agreed process', () => {
    for (const request of requests) {
      for (const change of request.history.slice(1)) {
        if (change.action === 'CREATE' || change.from === null) throw new Error('unexpected CREATE');
        expect(planTransition(change.from, change.action, change.byRole, change.comment).to).toBe(change.to);
      }
      expect(request.history.at(-1)?.to).toBe(request.status);
    }
  });

  it('never dates a change in the future', () => {
    expect(requests.every((r) => r.history.every((h) => Date.parse(h.at) <= now))).toBe(true);
  });

  it('covers every status so the filters have data', () => {
    expect(new Set(requests.map((r) => r.status))).toEqual(new Set(['REGISTERED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']));
  });
});
