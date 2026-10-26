import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FieldMapping {
  targetField: string;
  /** Dynamic mapping from the trigger step. */
  sourceField?: string;
  /** Static value used every run. */
  value?: string;
}

export interface ZapStep {
  app: string;
  event: string;
  configuration?: Record<string, string>;
  /** Action-only: trigger fields referenced in the message body. */
  fieldMappings?: FieldMapping[];
}

export interface Zap {
  id: string;
  name: string;
  isOn: boolean;
  trigger: ZapStep;
  action: ZapStep;
  createdAt: string;
  updatedAt: string;
}

export type ZapInput = Omit<Zap, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable({ providedIn: 'root' })
export class ZapService {
  private readonly http = inject(HttpClient);

  list(): Observable<Zap[]> {
    return this.http.get<Zap[]>('/api/zaps', { withCredentials: true });
  }

  get(id: string): Observable<Zap> {
    return this.http.get<Zap>(`/api/zaps/${id}`, { withCredentials: true });
  }

  create(body: ZapInput): Observable<Zap> {
    return this.http.post<Zap>('/api/zaps', body, { withCredentials: true });
  }

  update(id: string, body: ZapInput): Observable<Zap> {
    return this.http.put<Zap>(`/api/zaps/${id}`, body, {
      withCredentials: true,
    });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/zaps/${id}`, {
      withCredentials: true,
    });
  }
}
