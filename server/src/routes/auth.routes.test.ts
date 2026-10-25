import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { signValue } from '../utils/cookies';

const SESSION_SECRET = 'a'.repeat(32);
const TOKEN_ENCRYPTION_KEY = 'b'.repeat(32);
const CLIENT_ORIGIN = 'http://localhost:4200';

jest.mock('../config/env', () => ({
  env: {
    nodeEnv: 'development',
    clientOrigin: CLIENT_ORIGIN,
    githubClientId: 'test-client-id',
    githubClientSecret: 'test-client-secret',
    githubCallbackUrl: `${CLIENT_ORIGIN}/api/auth/github/callback`,
    sessionSecret: SESSION_SECRET,
    tokenEncryptionKey: TOKEN_ENCRYPTION_KEY,
  },
}));

jest.mock('../models/user.model', () => ({
  User: {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('../services/github-oauth.service', () => ({
  buildGitHubAuthorizeUrl: jest.fn(
    (state: string) => `https://github.example/authorize?state=${state}`
  ),
  exchangeCodeForAccessToken: jest.fn(),
  fetchGitHubUser: jest.fn(),
}));

import authRoutes, {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
} from './auth.routes';
import { User } from '../models/user.model';
import { env } from '../config/env';

const mockedUser = User as jest.Mocked<typeof User>;

function createApp() {
  const app = express();
  app.use('/api/auth', authRoutes);
  return app;
}

function setCookieHeader(parts: string[]): string {
  return parts.join('; ');
}

describe('auth routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    env.githubClientId = 'test-client-id';
    env.githubClientSecret = 'test-client-secret';
  });

  describe('GET /github/callback', () => {
    it('redirects with missing_code when code or state is absent', async () => {
      const res = await request(app).get('/api/auth/github/callback');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        `${CLIENT_ORIGIN}/login?error=missing_code`
      );
    });

    it('redirects with invalid_state when state does not match cookie', async () => {
      const res = await request(app)
        .get('/api/auth/github/callback')
        .query({ code: 'abc', state: 'from-query' })
        .set(
          'Cookie',
          setCookieHeader([`${OAUTH_STATE_COOKIE}=from-cookie`])
        );

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        `${CLIENT_ORIGIN}/login?error=invalid_state`
      );
    });

    it('redirects with access_denied for GitHub access_denied errors', async () => {
      const res = await request(app)
        .get('/api/auth/github/callback')
        .query({ error: 'access_denied' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        `${CLIENT_ORIGIN}/login?error=access_denied`
      );
    });

    it('redirects with login_failed for other GitHub errors', async () => {
      const res = await request(app)
        .get('/api/auth/github/callback')
        .query({ error: 'server_error' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        `${CLIENT_ORIGIN}/login?error=login_failed`
      );
    });
  });

  describe('GET /me', () => {
    it('returns 401 when no session cookie is present', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Not authenticated' });
      expect(mockedUser.findById).not.toHaveBeenCalled();
    });

    it('returns 401 and clears cookie for a signed but invalid ObjectId', async () => {
      const signed = signValue('not-a-valid-object-id', SESSION_SECRET);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', setCookieHeader([`${SESSION_COOKIE}=${encodeURIComponent(signed)}`]));

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Not authenticated' });
      expect(mockedUser.findById).not.toHaveBeenCalled();
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(`^${SESSION_COOKIE}=;`)),
        ])
      );
      expect(res.headers['set-cookie']?.[0]).toMatch(/Max-Age=0/);
    });

    it('returns the user when the session is valid', async () => {
      const userId = new Types.ObjectId().toHexString();
      const signed = signValue(userId, SESSION_SECRET);

      const select = jest.fn().mockResolvedValue({
        name: 'Ada',
        login: 'ada',
      });
      mockedUser.findById.mockReturnValue({ select } as never);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', setCookieHeader([`${SESSION_COOKIE}=${encodeURIComponent(signed)}`]));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: 'Ada', login: 'ada' });
      expect(mockedUser.findById).toHaveBeenCalledWith(userId);
      expect(select).toHaveBeenCalledWith('name login');
    });
  });

  describe('POST /logout', () => {
    it('clears the session cookie', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(204);
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(`^${SESSION_COOKIE}=;`)),
        ])
      );
      expect(res.headers['set-cookie']?.[0]).toMatch(/Max-Age=0/);
      expect(res.headers['set-cookie']?.[0]).toMatch(/SameSite=lax/i);
    });
  });

  describe('GET /github', () => {
    it('redirects with oauth_not_configured when credentials are missing', async () => {
      env.githubClientId = '';
      env.githubClientSecret = '';

      const res = await request(app).get('/api/auth/github');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        `${CLIENT_ORIGIN}/login?error=oauth_not_configured`
      );
    });
  });
});
