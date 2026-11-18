export const USER_ROLES = ['REQUESTER', 'ANALYST'] as const;

/**
 * REQUESTER: persona de la filial que registra solicitudes y confirma su solución.
 * ANALYST: analista del centro de servicios que atiende y resuelve.
 */
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  REQUESTER: 'la filial',
  ANALYST: 'el analista',
};

/** Identidad ya verificada. tenantId siempre proviene del token, nunca de la petición. */
export interface UserContext {
  readonly userId: string;
  readonly name: string;
  readonly tenantId: string;
  readonly role: UserRole;
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
