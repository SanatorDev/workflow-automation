import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AuthUser {
  name: string;
  login: string;
}

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: 'GitHub OAuth is not configured',
  missing_code: 'Missing OAuth code or state',
  invalid_state: 'Invalid OAuth state',
  access_denied: 'GitHub authorization was denied',
  login_failed: 'GitHub login failed',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  getCurrentUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>('/api/auth/me', { withCredentials: true });
  }

  loginWithGitHub(): void {
    window.location.href = '/api/auth/github';
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}, { withCredentials: true });
  }

  /** Map stable server error codes to user-facing copy. Unknown codes get a generic message. */
  messageForLoginError(code: string | null): string | null {
    if (!code) {
      return null;
    }

    return LOGIN_ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.';
  }
}
