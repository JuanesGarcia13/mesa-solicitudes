import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(LoginPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const type = (selector: string, value: string) => {
    const input = el.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  it('requires username and password before calling the API', () => {
    submit();

    expect(el.textContent).toContain('Escribe tu usuario.');
    expect(el.textContent).toContain('Escribe tu contraseña.');
  });

  it('sends only the credentials and navigates to the requests on success', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    type('#username', 'ana.cementos');
    type('#password', 'Mesa2026*');
    submit();

    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ username: 'ana.cementos', password: 'Mesa2026*' });
    req.flush({
      token: 'jwt',
      user: { userId: 'ana.cementos', name: 'Ana', tenantId: 'cementos', tenantName: 'Filial Cementos', role: 'REQUESTER' },
    });

    expect(navigate).toHaveBeenCalledWith(['/solicitudes']);
  });

  it('shows the server message on invalid credentials and clears the password', () => {
    type('#username', 'ana.cementos');
    type('#password', 'mala');
    submit();

    http
      .expectOne('/api/auth/login')
      .flush(
        { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    fixture.detectChanges();

    expect(el.querySelector('[role=alert]')?.textContent).toContain('Usuario o contraseña incorrectos.');
    expect((el.querySelector('#password') as HTMLInputElement).value).toBe('');
  });
});
