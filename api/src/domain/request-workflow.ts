import {
  ActionNotAllowedError,
  InvalidTransitionError,
  RequestClosedError,
  ValidationError,
} from './errors.js';
import { STATUS_LABELS, type RequestStatus } from './request-status.js';
import { ROLE_LABELS, type UserRole } from './user.js';

export const WORKFLOW_ACTIONS = ['START', 'RESOLVE', 'CONFIRM', 'REJECT'] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

interface TransitionRule {
  readonly from: RequestStatus;
  readonly to: RequestStatus;
  readonly role: UserRole;
  readonly requiresComment: boolean;
  readonly label: string;
}

/**
 * Proceso acordado, declarado como datos: es la única fuente de verdad de qué
 * transiciones existen y quién puede ejecutarlas.
 *
 * REGISTERED --START(analista)--> IN_PROGRESS --RESOLVE(analista)--> RESOLVED
 * RESOLVED --CONFIRM(filial)--> CLOSED
 * RESOLVED --REJECT(filial)--> IN_PROGRESS
 */
export const WORKFLOW: Readonly<Record<WorkflowAction, TransitionRule>> = {
  START: { from: 'REGISTERED', to: 'IN_PROGRESS', role: 'ANALYST', requiresComment: false, label: 'iniciar la atención de' },
  RESOLVE: { from: 'IN_PROGRESS', to: 'RESOLVED', role: 'ANALYST', requiresComment: true, label: 'resolver' },
  CONFIRM: { from: 'RESOLVED', to: 'CLOSED', role: 'REQUESTER', requiresComment: false, label: 'confirmar la solución de' },
  REJECT: { from: 'RESOLVED', to: 'IN_PROGRESS', role: 'REQUESTER', requiresComment: true, label: 'rechazar la solución de' },
};

export interface PlannedTransition {
  readonly action: WorkflowAction;
  readonly from: RequestStatus;
  readonly to: RequestStatus;
  readonly comment?: string;
}

export function isWorkflowAction(value: unknown): value is WorkflowAction {
  return typeof value === 'string' && (WORKFLOW_ACTIONS as readonly string[]).includes(value);
}

/** Acciones que un rol puede ejecutar sobre una solicitud en el estado dado. */
export function allowedActions(status: RequestStatus, role: UserRole): WorkflowAction[] {
  return WORKFLOW_ACTIONS.filter((action) => {
    const rule = WORKFLOW[action];
    return rule.from === status && rule.role === role;
  });
}

/**
 * Valida una transición sin efectos secundarios. Si no es válida lanza un error
 * cuyo mensaje explica por qué, para que quien lo intente lo entienda.
 */
export function planTransition(
  current: RequestStatus,
  action: WorkflowAction,
  role: UserRole,
  comment?: string,
): PlannedTransition {
  const rule = WORKFLOW[action];
  assertNotClosed(current);
  assertRole(rule, role);
  assertFromStatus(rule, current);
  const trimmed = comment?.trim();
  assertComment(rule, trimmed);
  return { action, from: current, to: rule.to, ...(trimmed ? { comment: trimmed } : {}) };
}

function assertNotClosed(current: RequestStatus): void {
  if (current === 'CLOSED') {
    throw new RequestClosedError();
  }
}

function assertRole(rule: TransitionRule, role: UserRole): void {
  if (rule.role !== role) {
    throw new ActionNotAllowedError(
      `Solo ${ROLE_LABELS[rule.role]} puede ${rule.label} una solicitud.`,
    );
  }
}

function assertFromStatus(rule: TransitionRule, current: RequestStatus): void {
  if (rule.from !== current) {
    throw new InvalidTransitionError(
      `No se puede ${rule.label} una solicitud en estado "${STATUS_LABELS[current]}": ` +
        `esta acción solo aplica cuando está "${STATUS_LABELS[rule.from]}". ` +
        describeNextStep(current),
    );
  }
}

function assertComment(rule: TransitionRule, comment: string | undefined): void {
  if (rule.requiresComment && !comment) {
    throw new ValidationError(`Para ${rule.label} una solicitud debes indicar un comentario.`);
  }
}

function describeNextStep(current: RequestStatus): string {
  const next = WORKFLOW_ACTIONS.map((action) => WORKFLOW[action]).filter((r) => r.from === current);
  const steps = next.map((r) => `${ROLE_LABELS[r.role]} puede ${r.label} la solicitud`);
  return steps.length > 0 ? `Siguiente paso: ${steps.join(' o ')}.` : '';
}
