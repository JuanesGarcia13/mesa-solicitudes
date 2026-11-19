export type RequestStatus = 'REGISTERED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type RequestCategory = 'PURCHASES' | 'PAYROLL' | 'ACCOUNTING';
export type UserRole = 'REQUESTER' | 'ANALYST';
export type WorkflowAction = 'START' | 'RESOLVE' | 'CONFIRM' | 'REJECT';

export interface RequestSummary {
  number: number;
  title: string;
  category: RequestCategory;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StatusChange {
  action: WorkflowAction | 'CREATE';
  from: RequestStatus | null;
  to: RequestStatus;
  byUserId: string;
  byRole: UserRole;
  at: string;
  comment?: string;
}

export interface RequestDetail extends RequestSummary {
  description: string;
  createdBy: string;
  version: number;
  history: StatusChange[];
  allowedActions: WorkflowAction[];
}

export interface RequestPage {
  items: RequestSummary[];
  nextCursor: string | null;
}

export interface SessionUser {
  userId: string;
  name: string;
  tenantId: string;
  tenantName: string;
  role: UserRole;
}

export interface ApiError {
  code: string;
  message: string;
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  REGISTERED: 'Registrada',
  IN_PROGRESS: 'En atención',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada',
};

export const CATEGORY_LABELS: Record<RequestCategory, string> = {
  PURCHASES: 'Compras',
  PAYROLL: 'Nómina',
  ACCOUNTING: 'Contabilidad',
};

export interface ActionOption {
  label: string;
  requiresComment: boolean;
  commentLabel?: string;
  primary: boolean;
}

/** Textos de los botones. Qué acciones se muestran lo decide el backend con allowedActions. */
export const ACTION_OPTIONS: Record<WorkflowAction, ActionOption> = {
  START: { label: 'Iniciar atención', requiresComment: false, primary: true },
  RESOLVE: { label: 'Marcar como resuelta', requiresComment: true, commentLabel: 'Describe la solución', primary: true },
  CONFIRM: { label: 'Confirmar solución', requiresComment: false, primary: true },
  REJECT: { label: 'No estoy conforme', requiresComment: true, commentLabel: '¿Qué quedó pendiente?', primary: false },
};

export const ACTION_LABELS: Record<StatusChange['action'], string> = {
  CREATE: 'Registrada',
  START: 'Atención iniciada',
  RESOLVE: 'Resuelta',
  CONFIRM: 'Solución confirmada',
  REJECT: 'Solución rechazada',
};
