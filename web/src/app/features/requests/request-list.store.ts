import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import type {
  RequestDetail,
  RequestStatus,
  RequestSummary,
  WorkflowAction,
} from '../../core/api/api.models';
import { errorMessage } from '../../core/api/error-message';
import { RequestsApi } from '../../core/api/requests.api';

export type ListState = 'loading' | 'loaded' | 'error';

export type DetailState =
  | { kind: 'loading'; number: number }
  | { kind: 'loaded'; number: number; data: RequestDetail }
  | { kind: 'not-found'; number: number }
  | { kind: 'error'; number: number; message: string };

/**
 * Estado de la pantalla "Mis solicitudes". Una suscripción activa por tipo de
 * consulta: si cambia el filtro antes de que responda la anterior, se cancela.
 */
@Injectable()
export class RequestListStore {
  private readonly api = inject(RequestsApi);
  private listSub?: Subscription;
  private detailSub?: Subscription;

  readonly status = signal<RequestStatus | null>(null);
  readonly items = signal<RequestSummary[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly state = signal<ListState>('loading');
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly detail = signal<DetailState | null>(null);
  readonly actionBusy = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly isEmpty = computed(() => this.state() === 'loaded' && this.items().length === 0);
  readonly hasMore = computed(() => this.nextCursor() !== null);

  setStatus(status: RequestStatus | null): void {
    if (status === this.status()) return;
    this.status.set(status);
    this.reload();
  }

  reload(): void {
    this.listSub?.unsubscribe();
    this.state.set('loading');
    this.error.set(null);
    this.items.set([]);
    this.nextCursor.set(null);
    this.listSub = this.api.list({ status: this.status() }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.state.set('loaded');
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.state.set('error');
      },
    });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.listSub = this.api.list({ status: this.status(), cursor }).subscribe({
      next: (page) => {
        this.items.update((items) => [...items, ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.loadingMore.set(false);
      },
    });
  }

  open(number: number): void {
    this.actionError.set(null);
    this.fetchDetail(number);
  }

  closeDetail(): void {
    this.detailSub?.unsubscribe();
    this.actionError.set(null);
    this.detail.set(null);
  }

  /**
   * Ejecuta una acción del proceso. Las reglas viven en el backend: si la rechaza,
   * se muestra su mensaje y se recarga el detalle para reflejar el estado real.
   */
  transition(action: WorkflowAction, comment: string | undefined, onSuccess: () => void): void {
    const current = this.detail();
    if (current?.kind !== 'loaded' || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionError.set(null);
    this.api.transition(current.number, action, comment).subscribe({
      next: (data) => {
        this.detail.set({ kind: 'loaded', number: data.number, data });
        this.items.update((items) =>
          items.map((i) => (i.number === data.number ? { ...i, status: data.status, updatedAt: data.updatedAt } : i)),
        );
        this.actionBusy.set(false);
        onSuccess();
      },
      error: (err: unknown) => {
        this.actionError.set(errorMessage(err));
        this.actionBusy.set(false);
        if (err instanceof HttpErrorResponse && err.status === 409) this.fetchDetail(current.number);
      },
    });
  }

  private fetchDetail(number: number): void {
    this.detailSub?.unsubscribe();
    if (this.detail()?.number !== number) this.detail.set({ kind: 'loading', number });
    this.detailSub = this.api.get(number).subscribe({
      next: (data) => this.detail.set({ kind: 'loaded', number, data }),
      error: (err: unknown) =>
        this.detail.set(
          err instanceof HttpErrorResponse && err.status === 404
            ? { kind: 'not-found', number }
            : { kind: 'error', number, message: errorMessage(err) },
        ),
    });
  }
}
