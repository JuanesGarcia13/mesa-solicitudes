import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { RequestDetail, RequestPage, RequestStatus } from './api.models';

export interface ListParams {
  status?: RequestStatus | null;
  cursor?: string | null;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class RequestsApi {
  private readonly http = inject(HttpClient);

  list(params: ListParams): Observable<RequestPage> {
    let query = new HttpParams().set('limit', params.limit ?? 25);
    if (params.status) query = query.set('status', params.status);
    if (params.cursor) query = query.set('cursor', params.cursor);
    return this.http.get<RequestPage>('/api/requests', { params: query });
  }

  get(number: number): Observable<RequestDetail> {
    return this.http.get<RequestDetail>(`/api/requests/${number}`);
  }
}
