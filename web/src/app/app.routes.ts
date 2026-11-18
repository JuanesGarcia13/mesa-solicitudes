import type { Routes } from '@angular/router';
import { anonymousGuard, authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [anonymousGuard],
    title: 'Ingresar · Mesa de Solicitudes',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'solicitudes',
    canActivate: [authGuard],
    title: 'Mis solicitudes · Mesa de Solicitudes',
    loadComponent: () => import('./features/requests/request-list.page').then((m) => m.RequestListPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'solicitudes' },
  { path: '**', redirectTo: 'solicitudes' },
];
