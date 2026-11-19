import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  const user = { userId: 'ana', name: 'Ana', tenantId: 'cementos', tenantName: 'Filial Cementos', role: 'REQUESTER' };

  it('sends only the bearer token, never a tenant header', () => {
    auth.login('ana.cementos', 'secreta').subscribe();
    const login = http.expectOne('/api/auth/login');
    expect(login.request.body).toEqual({ username: 'ana.cementos', password: 'secreta' });
    login.flush({ token: 'signed.jwt.token', user });

    client.get('/api/requests').subscribe();
    const req = http.expectOne('/api/requests');

    expect(req.request.headers.get('Authorization')).toBe('Bearer signed.jwt.token');
    expect(req.request.headers.keys().some((k) => k.toLowerCase().includes('tenant'))).toBeFalse();
    req.flush({ items: [], nextCursor: null });
  });

  it('ends the session when the API answers 401', () => {
    auth.login('ana.cementos', 'secreta').subscribe();
    http.expectOne('/api/auth/login').flush({ token: 't', user });

    client.get('/api/requests').subscribe({ error: () => undefined });
    http.expectOne('/api/requests').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBeFalse();
  });
});
