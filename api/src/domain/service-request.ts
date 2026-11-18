import type { RequestStatus } from './request-status.js';
import type { WorkflowAction } from './request-workflow.js';
import type { UserRole } from './user.js';

export const REQUEST_CATEGORIES = ['PURCHASES', 'PAYROLL', 'ACCOUNTING'] as const;

export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export interface StatusChange {
  readonly action: WorkflowAction | 'CREATE';
  readonly from: RequestStatus | null;
  readonly to: RequestStatus;
  readonly byUserId: string;
  readonly byRole: UserRole;
  readonly at: string;
  readonly comment?: string;
}

export interface ServiceRequest {
  readonly tenantId: string;
  readonly number: number;
  readonly title: string;
  readonly description: string;
  readonly category: RequestCategory;
  readonly status: RequestStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly history: readonly StatusChange[];
}

/** Proyección liviana usada en el listado: sin descripción ni historial. */
export type ServiceRequestSummary = Pick<
  ServiceRequest,
  'number' | 'title' | 'category' | 'status' | 'createdAt' | 'updatedAt'
>;
