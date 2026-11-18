import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_LABELS, type RequestStatus } from '../core/api/api.models';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge badge--' + status().toLowerCase()">{{ label() }}</span>`,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      padding: 0.2em 0.65em;
      border-radius: 999px;
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge::before {
      content: '';
      width: 0.5em;
      height: 0.5em;
      border-radius: 50%;
      background: currentColor;
    }
    .badge--registered { background: var(--st-registered-bg); color: var(--st-registered); }
    .badge--in_progress { background: var(--st-progress-bg); color: var(--st-progress); }
    .badge--resolved { background: var(--st-resolved-bg); color: var(--st-resolved); }
    .badge--closed { background: var(--st-closed-bg); color: var(--st-closed); }
  `,
})
export class StatusBadge {
  readonly status = input.required<RequestStatus>();
  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
}
