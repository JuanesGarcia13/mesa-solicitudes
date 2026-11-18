import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import {
  ACTION_LABELS,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type RequestStatus,
} from '../../core/api/api.models';
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
  protected readonly searchTerm = signal('');
  protected readonly searchError = signal<string | null>(null);

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
    this.store.open(number);
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
