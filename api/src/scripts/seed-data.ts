import type { RequestStatus } from '../domain/request-status.js';
import type { WorkflowAction } from '../domain/request-workflow.js';
import type { RequestCategory, ServiceRequest, StatusChange } from '../domain/service-request.js';

export interface TenantSeed {
  readonly tenantId: string;
  readonly requesterId: string;
  readonly analystId: string;
  readonly count: number;
}

const DAY_MS = 86_400_000;
const CATEGORIES: readonly RequestCategory[] = ['PURCHASES', 'PAYROLL', 'ACCOUNTING'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const TITLES: Readonly<Record<RequestCategory, readonly ((n: number) => string)[]>> = {
  PURCHASES: [
    (n) => `Orden de compra OC-${n} pendiente de aprobación`,
    (n) => `Pago a Proveedor ${String(n % 900).padStart(3, '0')} sin aplicar`,
    (n) => `Creación de proveedor nuevo NIT ${900_000_000 + n}`,
  ],
  PAYROLL: [
    (n) => `Ajuste de nómina de ${MONTHS[n % 12]}`,
    (n) => `Certificado laboral para empleado ${10_000 + (n % 5000)}`,
    (n) => `Novedad de horas extra, centro de costo ${100 + (n % 80)}`,
  ],
  ACCOUNTING: [
    (n) => `Conciliación de la cuenta ${110_505 + (n % 40)}`,
    (n) => `Reclasificación de gasto, comprobante ${n}`,
    (n) => `Cierre contable de ${MONTHS[n % 12]}: diferencia en provisión`,
  ],
};

/** PRNG determinista (mulberry32): el mismo seed produce siempre los mismos datos. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Las solicitudes antiguas casi siempre están cerradas; las recientes se reparten entre estados. */
function pickStatus(ageRatio: number, random: () => number): RequestStatus {
  const r = random();
  if (ageRatio > 0.1) {
    return r < 0.97 ? 'CLOSED' : 'RESOLVED';
  }
  const weights: [RequestStatus, number][] = [['REGISTERED', 0.3], ['IN_PROGRESS', 0.35], ['RESOLVED', 0.2], ['CLOSED', 0.15]];
  let acc = 0;
  for (const [status, weight] of weights) {
    acc += weight;
    if (r < acc) return status;
  }
  return 'CLOSED';
}

const PATH: readonly { action: WorkflowAction; to: RequestStatus; byAnalyst: boolean; comment?: string }[] = [
  { action: 'START', to: 'IN_PROGRESS', byAnalyst: true },
  { action: 'RESOLVE', to: 'RESOLVED', byAnalyst: true, comment: 'Solicitud atendida y resuelta.' },
  { action: 'CONFIRM', to: 'CLOSED', byAnalyst: false },
];

function buildHistory(seed: TenantSeed, status: RequestStatus, createdAt: number): StatusChange[] {
  const history: StatusChange[] = [
    { action: 'CREATE', from: null, to: 'REGISTERED', byUserId: seed.requesterId, byRole: 'REQUESTER', at: new Date(createdAt).toISOString() },
  ];
  let current: RequestStatus = 'REGISTERED';
  for (const [index, step] of PATH.entries()) {
    if (current === status) break;
    history.push({
      action: step.action,
      from: current,
      to: step.to,
      byUserId: step.byAnalyst ? seed.analystId : seed.requesterId,
      byRole: step.byAnalyst ? 'ANALYST' : 'REQUESTER',
      at: new Date(createdAt + (index + 1) * DAY_MS).toISOString(),
      ...(step.comment ? { comment: step.comment } : {}),
    });
    current = step.to;
  }
  return history;
}

export function buildRequest(seed: TenantSeed, number: number, now: number, random: () => number): ServiceRequest {
  const ageRatio = 1 - number / seed.count;
  const createdAt = now - Math.round(ageRatio * 730 * DAY_MS) - Math.round(random() * DAY_MS);
  const category = CATEGORIES[number % CATEGORIES.length] ?? 'PURCHASES';
  const templates = TITLES[category];
  const title = templates[Math.floor(random() * templates.length)]?.(number) ?? `Solicitud ${number}`;
  const history = buildHistory(seed, pickStatus(ageRatio, random), createdAt);
  const last = history[history.length - 1];
  return {
    tenantId: seed.tenantId,
    number,
    title,
    description: `Detalle de la solicitud ${number}: ${title.toLowerCase()}.`,
    category,
    status: last?.to ?? 'REGISTERED',
    createdBy: seed.requesterId,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: last?.at ?? new Date(createdAt).toISOString(),
    version: history.length,
    history,
  };
}
