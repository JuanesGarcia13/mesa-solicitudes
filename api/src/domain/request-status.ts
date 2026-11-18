export const REQUEST_STATUSES = ['REGISTERED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const INITIAL_STATUS: RequestStatus = 'REGISTERED';

export const STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  REGISTERED: 'Registrada',
  IN_PROGRESS: 'En atención',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada',
};

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value);
}
