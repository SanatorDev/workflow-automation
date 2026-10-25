import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

/** Requires a valid session cookie via GET /api/auth/me. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.getCurrentUser().pipe(
    map(() => true),
    catchError(() => {
      void router.navigate(['/login']);
      return of(false);
    })
  );
};
