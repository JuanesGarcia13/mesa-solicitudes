import { randomBytes } from 'node:crypto';
import type { UserContext } from '../../domain/user.js';
import { hashPassword, verifyPassword } from './password-hasher.js';

export interface DirectoryUser extends UserContext {
  readonly tenantName: string;
}

export interface UserAccount {
  readonly username: string;
  readonly passwordHash: string;
  readonly user: DirectoryUser;
}

export interface UserDirectory {
  /** Devuelve el usuario con su filial si las credenciales son válidas; null en cualquier otro caso. */
  authenticate(username: string, password: string): Promise<DirectoryUser | null>;
}

/**
 * Directorio local de usuarios para el entorno de desarrollo. La filial pertenece a la
 * cuenta y la decide el servidor; el cliente solo envía usuario y contraseña.
 */
export class InMemoryUserDirectory implements UserDirectory {
  private readonly decoyHash = hashPassword(randomBytes(24).toString('hex'));

  constructor(private readonly accounts: readonly UserAccount[]) {}

  async authenticate(username: string, password: string): Promise<DirectoryUser | null> {
    const account = this.accounts.find((a) => a.username === username.trim().toLowerCase());
    // Si el usuario no existe se verifica igual contra un hash señuelo: mismo costo, sin enumerar usuarios.
    const valid = await verifyPassword(password, account?.passwordHash ?? (await this.decoyHash));
    return account && valid ? account.user : null;
  }
}
