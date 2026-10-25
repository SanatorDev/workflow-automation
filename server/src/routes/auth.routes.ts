import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { User } from '../models/user.model';
import {
  buildGitHubAuthorizeUrl,
  exchangeCodeForAccessToken,
  fetchGitHubUser,
} from '../services/github-oauth.service';
import {
  clearCookie,
  getCookie,
  setCookie,
  signValue,
  unsignValue,
} from '../utils/cookies';
import { encryptSecret } from '../utils/secret-crypto';

const router: Router = Router();

export const OAUTH_STATE_COOKIE = 'oauth_state';
export const SESSION_COOKIE = 'session';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Stable codes only — never put GitHub's free-text error_description in the redirect URL. */
export const LOGIN_ERROR_CODES = {
  oauth_not_configured: 'GitHub OAuth is not configured',
  missing_code: 'Missing OAuth code or state',
  invalid_state: 'Invalid OAuth state',
  access_denied: 'GitHub authorization was denied',
  login_failed: 'GitHub login failed',
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERROR_CODES;

function cookieSecure(): boolean {
  return env.nodeEnv === 'production';
}

function sessionCookieOptions() {
  return {
    secure: cookieSecure(),
    sameSite: 'lax' as const,
  };
}

function clientUrl(pathname: string, query?: Record<string, string>): string {
  if (env.nodeEnv === 'production') {
    const params = query ? `?${new URLSearchParams(query).toString()}` : '';
    return `${pathname}${params}`;
  }

  const url = new URL(pathname, env.clientOrigin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function redirectWithError(res: Response, code: LoginErrorCode): void {
  res.redirect(clientUrl('/login', { error: code }));
}

function getSessionUserId(req: Request): string | null {
  const signed = getCookie(req, SESSION_COOKIE);
  if (!signed) {
    return null;
  }

  return unsignValue(signed, env.sessionSecret);
}

/** Step 1: redirect the browser to GitHub's authorize endpoint. */
router.get('/github', (_req: Request, res: Response) => {
  if (!env.githubClientId || !env.githubClientSecret) {
    redirectWithError(res, 'oauth_not_configured');
    return;
  }

  const state = crypto.randomBytes(24).toString('hex');

  setCookie(res, OAUTH_STATE_COOKIE, state, {
    maxAgeMs: STATE_MAX_AGE_MS,
    ...sessionCookieOptions(),
  });

  res.redirect(buildGitHubAuthorizeUrl(state));
});

/**
 * Step 2–3: GitHub redirects here with a temporary code.
 * Exchange the code for an access token, persist the user, then send them to /welcome.
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */
router.get('/github/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (typeof error === 'string') {
    redirectWithError(
      res,
      error === 'access_denied' ? 'access_denied' : 'login_failed'
    );
    return;
  }

  if (typeof code !== 'string' || typeof state !== 'string') {
    redirectWithError(res, 'missing_code');
    return;
  }

  const storedState = getCookie(req, OAUTH_STATE_COOKIE);
  clearCookie(res, OAUTH_STATE_COOKIE, sessionCookieOptions());

  if (!storedState || storedState !== state) {
    redirectWithError(res, 'invalid_state');
    return;
  }

  try {
    const accessToken = await exchangeCodeForAccessToken(code);
    const githubUser = await fetchGitHubUser(accessToken);

    const user = await User.findOneAndUpdate(
      { githubId: githubUser.id },
      {
        githubId: githubUser.id,
        login: githubUser.login,
        name: githubUser.name ?? undefined,
        email: githubUser.email ?? undefined,
        accessToken: encryptSecret(accessToken, env.tokenEncryptionKey),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    setCookie(res, SESSION_COOKIE, signValue(user.id, env.sessionSecret), {
      maxAgeMs: SESSION_MAX_AGE_MS,
      ...sessionCookieOptions(),
    });

    res.redirect(clientUrl('/welcome'));
  } catch (err) {
    console.error('GitHub OAuth callback failed:', err);
    redirectWithError(res, 'login_failed');
  }
});

/** Current session user (name/login for the welcome page). */
router.get('/me', async (req: Request, res: Response) => {
  const userId = getSessionUserId(req);

  if (!userId || !mongoose.isValidObjectId(userId)) {
    if (userId) {
      clearCookie(res, SESSION_COOKIE, sessionCookieOptions());
    }
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }

  try {
    const user = await User.findById(userId).select('name login');

    if (!user) {
      clearCookie(res, SESSION_COOKIE, sessionCookieOptions());
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    res.json({
      name: user.name || user.login,
      login: user.login,
    });
  } catch (err) {
    console.error('Failed to load current user:', err);
    res.status(500).json({ message: 'Failed to load user' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  clearCookie(res, SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
});

export default router;
