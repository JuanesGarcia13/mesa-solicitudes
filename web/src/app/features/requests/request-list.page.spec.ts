import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeEsCo from '@angular/common/locales/es-CO';
import { LOCALE_ID } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RequestDetail, RequestPage, RequestSummary, WorkflowAction } from '../../core/api/api.models';
import { RequestListPage } from './request-list.page';

registerLocaleData(localeEsCo);

const summary = (number: number, status: RequestSummary['status'] = 'REGISTERED'): RequestSummary => ({
  number,
  title: `Solicitud ${number}`,
  category: 'PAYROLL',
  status,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
});

describe('RequestListPage', () => {
  let fixture: ComponentFixture<RequestListPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RequestListPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LOCALE_ID, useValue: 'es-CO' },
      ],
    });
    fixture = TestBed.createComponent(RequestListPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const respondList = (page: RequestPage, url = '/api/requests') => {
    http.expectOne((r) => r.url === url).flush(page);
    fixture.detectChanges();
  };

  const text = () => el.textContent ?? '';

  it('shows each request with its current status', () => {
    respondList({ items: [summary(2, 'IN_PROGRESS'), summary(1, 'CLOSED')], nextCursor: null });

    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('#2');
    expect(rows[0].textContent).toContain('En atención');
    expect(rows[1].textContent).toContain('Cerrada');
  });

  it('shows a clear empty state when the subsidiary has no requests', () => {
    respondList({ items: [], nextCursor: null });

    expect(text()).toContain('Tu filial aún no tiene solicitudes registradas.');
    expect(el.querySelector('table')).toBeNull();
  });

  it('shows a clear error state and retries', () => {
    http
      .expectOne('/api/requests?limit=25')
      .flush({ code: 'X', message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).toContain('No pudimos cargar tus solicitudes');
    (el.querySelector('.state--error button') as HTMLButtonElement).click();
    respondList({ items: [summary(1)], nextCursor: null });
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('filters by status through the API', () => {
    respondList({ items: [summary(1)], nextCursor: null });

    const chip = Array.from(el.querySelectorAll<HTMLButtonElement>('.chip')).find((b) =>
      b.textContent?.includes('Resuelta'),
    );
    chip?.click();
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === '/api/requests');
    expect(req.request.params.get('status')).toBe('RESOLVED');
    req.flush({ items: [], nextCursor: null });
    fixture.detectChanges();
    expect(text()).toContain('No tienes solicitudes en estado "Resuelta".');
  });

  it('loads the next page with the cursor', () => {
    respondList({ items: [summary(3)], nextCursor: 'abc' });

    (el.querySelector('.results__footer button') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.params.get('cursor') === 'abc');
    req.flush({ items: [summary(2)], nextCursor: null });
    fixture.detectChanges();

    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.querySelector('.results__footer button')).toBeNull();
  });

  it('finds a specific request by number and reports when it is not found', () => {
    respondList({ items: [summary(1)], nextCursor: null });
    const input = el.querySelector('input[type=search]') as HTMLInputElement;
    input.value = '#999';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http
      .expectOne('/api/requests/999')
      .flush({ code: 'REQUEST_NOT_FOUND', message: 'La solicitud no existe.' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(text()).toContain('No encontramos la solicitud #999 en tu filial.');
  });

  describe('moving a request through the process', () => {
    const detail = (status: RequestSummary['status'], allowedActions: WorkflowAction[]): RequestDetail => ({
      ...summary(7, status),
      description: 'detalle',
      createdBy: 'ana',
      version: 1,
      history: [],
      allowedActions,
    });

    const openDetail = (d: RequestDetail) => {
      respondList({ items: [summary(7, d.status)], nextCursor: null });
      (el.querySelector('tbody tr') as HTMLElement).click();
      fixture.detectChanges();
      http.expectOne('/api/requests/7').flush(d);
      fixture.detectChanges();
    };

    const actionButtons = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('.actions button')).map((b) => b.textContent?.trim());

    const clickAction = (label: string) => {
      Array.from(el.querySelectorAll<HTMLButtonElement>('.actions button'))
        .find((b) => b.textContent?.trim() === label)
        ?.click();
      fixture.detectChanges();
    };

    it('shows only the actions the backend allows for this user', () => {
      openDetail(detail('RESOLVED', ['CONFIRM', 'REJECT']));

      expect(actionButtons()).toEqual(['Confirmar solución', 'No estoy conforme']);
    });

    it('executes an action and updates the status in the detail and in the list', () => {
      openDetail(detail('REGISTERED', ['START']));

      clickAction('Iniciar atención');
      const req = http.expectOne('/api/requests/7/transitions');
      expect(req.request.body).toEqual({ action: 'START' });
      req.flush(detail('IN_PROGRESS', ['RESOLVE']));
      fixture.detectChanges();

      expect(el.querySelector('tbody tr')?.textContent).toContain('En atención');
      expect(actionButtons()).toEqual(['Marcar como resuelta']);
    });

    it('asks for a comment when the action requires one', () => {
      openDetail(detail('RESOLVED', ['CONFIRM', 'REJECT']));

      clickAction('No estoy conforme');
      const submitButton = el.querySelector('.actions__comment button[type=submit]') as HTMLButtonElement;
      expect(submitButton.disabled).toBeTrue();
      const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'El pago no aparece';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (el.querySelector('.actions__comment') as HTMLFormElement).dispatchEvent(new Event('submit'));

      const req = http.expectOne('/api/requests/7/transitions');
      expect(req.request.body).toEqual({ action: 'REJECT', comment: 'El pago no aparece' });
      req.flush(detail('IN_PROGRESS', []));
    });

    it('shows why the backend rejected the action and reloads the real state', () => {
      openDetail(detail('REGISTERED', ['START']));

      clickAction('Iniciar atención');
      http.expectOne('/api/requests/7/transitions').flush(
        { code: 'CONCURRENT_MODIFICATION', message: 'La solicitud cambió mientras se procesaba tu acción.' },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      expect(el.querySelector('.actions__error')?.textContent).toContain('La solicitud cambió');
      http.expectOne('/api/requests/7').flush(detail('IN_PROGRESS', ['RESOLVE']));
      fixture.detectChanges();
      expect(actionButtons()).toEqual(['Marcar como resuelta']);
    });
  });

  it('validates the search input before calling the API', () => {
    respondList({ items: [], nextCursor: null });
    const input = el.querySelector('input[type=search]') as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(text()).toContain('Escribe el número de la solicitud');
  });
});
