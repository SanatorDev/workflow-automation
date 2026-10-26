import { Request, Response } from 'express';
import { env } from '../config/env';
import { clearCookie, getCookie, unsignValue } from '../utils/cookies';

export const OAUTH_STATE_COOKIE = 'oauth_state';
export const SESSION_COOKIE = 'session';

export function cookieSecure(): boolean {
  return env.nodeEnv === 'production';
}

export function sessionCookieOptions() {
  return {
    secure: cookieSecure(),
    sameSite: 'lax' as const,
  };
}

/** Resolve the signed session cookie to a user id, or null if absent/invalid. */
export function getSessionUserId(req: Request): string | null {
  const signed = getCookie(req, SESSION_COOKIE);
  if (!signed) {
    return null;
  }

  return unsignValue(signed, env.sessionSecret);
}

export function clearSessionCookie(res: Response): void {
  clearCookie(res, SESSION_COOKIE, sessionCookieOptions());
}
