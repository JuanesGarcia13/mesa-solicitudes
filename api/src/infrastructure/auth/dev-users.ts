import type { UserContext } from '../../domain/user.js';

export interface DevTenant {
  readonly id: string;
  readonly name: string;
}

export const DEV_TENANTS: readonly DevTenant[] = [
  { id: 'cementos', name: 'Filial Cementos' },
  { id: 'energia', name: 'Filial Energía' },
  { id: 'concesiones', name: 'Filial Concesiones' },
];

/** Usuarios simulados: reemplazan a un proveedor de identidad en el entorno local. */
export const DEV_USERS: readonly UserContext[] = [
  { userId: 'ana.cementos', name: 'Ana Restrepo', tenantId: 'cementos', role: 'REQUESTER' },
  { userId: 'carlos.cementos', name: 'Carlos Mejía (analista)', tenantId: 'cementos', role: 'ANALYST' },
  { userId: 'laura.energia', name: 'Laura Gómez', tenantId: 'energia', role: 'REQUESTER' },
  { userId: 'diego.energia', name: 'Diego Ríos (analista)', tenantId: 'energia', role: 'ANALYST' },
  { userId: 'sofia.concesiones', name: 'Sofía Vélez', tenantId: 'concesiones', role: 'REQUESTER' },
];
