import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GitHubRepo {
  id: number;
  fullName: string;
  private: boolean;
}

@Injectable({ providedIn: 'root' })
export class GitHubService {
  private readonly http = inject(HttpClient);

  listRepos(): Observable<GitHubRepo[]> {
    return this.http.get<GitHubRepo[]>('/api/github/repos', {
      withCredentials: true,
    });
  }
}
