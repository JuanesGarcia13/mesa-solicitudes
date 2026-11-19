import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, type OnInit, signal } from '@angular/core';
import {
  ACTION_LABELS,
  ACTION_OPTIONS,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type RequestDetail,
  type RequestStatus,
  type WorkflowAction,
} from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { StatusBadge } from '../../shared/status-badge';
import { RequestListStore } from './request-list.store';

interface StatusFilter {
  value: RequestStatus | null;
  label: string;
}

@Component({
  selector: 'app-request-list-page',
  imports: [DatePipe, DecimalPipe, StatusBadge],
  providers: [RequestListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-list.page.html',
  styleUrl: './request-list.page.scss',
})
export class RequestListPage implements OnInit {
  protected readonly store = inject(RequestListStore);
  private readonly auth = inject(AuthService);
  protected readonly searchTerm = signal('');
  protected readonly searchError = signal<string | null>(null);
  protected readonly pendingAction = signal<WorkflowAction | null>(null);
  protected readonly comment = signal('');
  protected readonly actionOptions = ACTION_OPTIONS;
  protected readonly heading = computed(() => {
    const user = this.auth.user();
    return user?.role === 'ANALYST' ? `Solicitudes de ${user.tenantName}` : 'Mis solicitudes';
  });

  protected readonly filters: StatusFilter[] = [
    { value: null, label: 'Todas' },
    ...(Object.keys(STATUS_LABELS) as RequestStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] })),
  ];
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly actionLabels = ACTION_LABELS;

  ngOnInit(): void {
    this.store.reload();
  }

  protected search(event: Event): void {
    event.preventDefault();
    const raw = this.searchTerm().trim().replace(/^#/, '');
    const number = Number(raw);
    if (!raw || !Number.isSafeInteger(number) || number < 1) {
      this.searchError.set('Escribe el número de la solicitud, por ejemplo 1250.');
      return;
    }
    this.searchError.set(null);
    this.openRequest(number);
  }

  protected openRequest(number: number): void {
    this.cancelAction();
    this.store.open(number);
  }

  protected closeDetail(): void {
    this.cancelAction();
    this.store.closeDetail();
  }

  protected chooseAction(action: WorkflowAction): void {
    if (ACTION_OPTIONS[action].requiresComment) {
      this.pendingAction.set(action);
      return;
    }
    this.store.transition(action, undefined, () => this.cancelAction());
  }

  protected submitPendingAction(event: Event): void {
    event.preventDefault();
    const action = this.pendingAction();
    if (action) this.store.transition(action, this.comment(), () => this.cancelAction());
  }

  protected cancelAction(): void {
    this.pendingAction.set(null);
    this.comment.set('');
  }

  protected onCommentInput(event: Event): void {
    this.comment.set((event.target as HTMLTextAreaElement).value);
  }

  /** Explica a quién le toca el siguiente paso cuando el usuario no tiene acciones disponibles. */
  protected nextStepHint(request: RequestDetail): string {
    const isAnalyst = this.auth.user()?.role === 'ANALYST';
    const hints: Record<RequestStatus, string> = {
      REGISTERED: isAnalyst ? '' : 'Pendiente de que el centro de servicios inicie la atención.',
      IN_PROGRESS: isAnalyst ? '' : 'El centro de servicios está atendiendo esta solicitud.',
      RESOLVED: isAnalyst ? 'Esperando que la filial confirme la solución.' : '',
      CLOSED: 'Solicitud cerrada: no admite cambios.',
    };
    return hints[request.status];
  }

  protected onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.searchError.set(null);
  }

  protected emptyMessage(): string {
    const status = this.store.status();
    return status
      ? `No tienes solicitudes en estado "${STATUS_LABELS[status]}".`
      : 'Tu filial aún no tiene solicitudes registradas.';
  }
}
