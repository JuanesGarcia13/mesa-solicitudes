import type { UserAccount } from './user-directory.js';

/**
 * Cuentas de demostración del entorno local. Solo se guardan hashes scrypt; la contraseña
 * de demostración está documentada en el README. En AWS este directorio lo reemplaza Cognito.
 */
export const DEMO_ACCOUNTS: readonly UserAccount[] = [
  {
    username: 'ana.cementos',
    passwordHash:
      'scrypt$AJNVhMBhHSHDovbzlCAbAA==$X/aTUmA38FaL+DpERPY3KplCFdByjllGj8/3gLPZxgeN2PrbV5cuhMGraNOntGXZEjYyw6BYiPtp3bw1giTrPw==',
    user: { userId: 'ana.cementos', name: 'Ana Restrepo', tenantId: 'cementos', tenantName: 'Filial Cementos', role: 'REQUESTER' },
  },
  {
    username: 'carlos.cementos',
    passwordHash:
      'scrypt$UnPRyqs77xy6fLAcFnQUHg==$2g6A14pmSG0tfl9q8vrB8cpBFipIDqQ4HyODQ3ltd/IpsxynbMcgvuBppMI3TJhi4fbpZl+TwYqjlY7veQtWZg==',
    user: { userId: 'carlos.cementos', name: 'Carlos Mejía', tenantId: 'cementos', tenantName: 'Filial Cementos', role: 'ANALYST' },
  },
  {
    username: 'laura.energia',
    passwordHash:
      'scrypt$tqySVehqwOHidIYWrmBoqA==$L8nwNMCoLzkGktiyPAbnPEMiiTcM3cr7y25wgsSxlW8d4t6mh9WAhwHzYCyEXVkSrJ6HMZvxDfHA1WadFc+dRw==',
    user: { userId: 'laura.energia', name: 'Laura Gómez', tenantId: 'energia', tenantName: 'Filial Energía', role: 'REQUESTER' },
  },
  {
    username: 'diego.energia',
    passwordHash:
      'scrypt$fAGBlxWoqHBnYwwPw/VHjQ==$jTuXFCn3IIJ5bLpBMNEat2ZIN2Brx7fs226/AJEXYO5MCpbI2TJisI+b6VootFuM/oWVKJP83dN0xHuAVCA7ZQ==',
    user: { userId: 'diego.energia', name: 'Diego Ríos', tenantId: 'energia', tenantName: 'Filial Energía', role: 'ANALYST' },
  },
  {
    username: 'sofia.concesiones',
    passwordHash:
      'scrypt$prXwS/g/AIa9ytxsIPVKsg==$yT5a6UKZ9fcqAlT9UYxtSyx8KDTiaQQ6p0DxY7C531UXT9Utn3gOljTMSIJQ81zS9l2EqdYVjCZYXtPUZuVxng==',
    user: { userId: 'sofia.concesiones', name: 'Sofía Vélez', tenantId: 'concesiones', tenantName: 'Filial Concesiones', role: 'REQUESTER' },
  },
];
