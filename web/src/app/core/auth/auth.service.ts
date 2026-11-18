import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { type Observable, tap } from 'rxjs';
import type { DevUser, SessionUser } from '../api/api.models';

interface Session {
  token: string;
  user: SessionUser;
}

const STORAGE_KEY = 'mesa.session';

/**
 * Sesión simulada: el backend firma un token con la filial del usuario elegido.
 * El frontend nunca envía la filial; solo el token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  devUsers(): Observable<DevUser[]> {
    return this.http.get<DevUser[]>('/api/auth/dev-users');
  }

  login(userId: string): Observable<Session> {
    return this.http.post<Session>('/api/auth/dev-login', { userId }).pipe(
      tap((session) => {
        this.session.set(session);
        writeStoredSession(session);
      }),
    );
  }

  logout(): void {
    this.session.set(null);
    writeStoredSession(null);
    void this.router.navigate(['/login']);
  }
}

function readStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento disponible la sesión vive solo en memoria.
  }
}
