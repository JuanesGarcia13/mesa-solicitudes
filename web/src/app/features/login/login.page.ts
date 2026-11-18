import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { DevUser } from '../../core/api/api.models';
import { errorMessage } from '../../core/api/error-message';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="login">
      <h1>Mesa de Solicitudes</h1>
      <p class="muted">
        Entorno local: elige un usuario simulado. Cada uno pertenece a una filial y solo verá sus solicitudes.
      </p>

      @if (error()) {
        <div class="alert" role="alert">
          {{ error() }}
          <button type="button" class="btn" (click)="loadUsers()">Reintentar</button>
        </div>
      }

      <ul class="users">
        @for (user of users(); track user.userId) {
          <li>
            <button type="button" class="user" [disabled]="busy()" (click)="login(user)">
              <span class="user__name">{{ user.name }}</span>
              <span class="muted">{{ user.tenantName }} · {{ user.role === 'ANALYST' ? 'Analista' : 'Filial' }}</span>
            </button>
          </li>
        } @empty {
          @if (!error()) {
            <li class="muted">Cargando usuarios…</li>
          }
        }
      </ul>
    </section>
  `,
  styles: `
    .login {
      max-width: 34rem;
      margin: 4rem auto;
      padding: 2rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    h1 { margin: 0 0 0.5rem; }
    .users { list-style: none; padding: 0; margin: 1.5rem 0 0; display: grid; gap: 0.5rem; }
    .user {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.2rem;
      padding: 0.8rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      cursor: pointer;
      text-align: left;
    }
    .user:hover { border-color: var(--primary); background: var(--primary-soft); }
    .user__name { font-weight: 600; }
    .alert {
      display: flex; justify-content: space-between; align-items: center; gap: 1rem;
      margin-top: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius);
      background: var(--danger-soft); color: var(--danger);
    }
  `,
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly users = signal<DevUser[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  ngOnInit(): void {
    this.loadUsers();
  }

  protected loadUsers(): void {
    this.error.set(null);
    this.auth.devUsers().subscribe({
      next: (users) => this.users.set(users),
      error: (err: unknown) => this.error.set(errorMessage(err)),
    });
  }

  protected login(user: DevUser): void {
    this.busy.set(true);
    this.auth.login(user.userId).subscribe({
      next: () => void this.router.navigate(['/solicitudes']),
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
