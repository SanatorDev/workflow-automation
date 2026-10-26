import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { signValue } from '../utils/cookies';
import { encryptSecret } from '../utils/secret-crypto';

const SESSION_SECRET = 'a'.repeat(32);
const TOKEN_ENCRYPTION_KEY = 'b'.repeat(32);

jest.mock('../config/env', () => ({
  env: {
    nodeEnv: 'development',
    clientOrigin: 'http://localhost:4200',
    sessionSecret: 'a'.repeat(32),
    tokenEncryptionKey: 'b'.repeat(32),
  },
}));

jest.mock('../models/user.model', () => ({
  User: {
    findById: jest.fn(),
  },
}));

jest.mock('../services/github-oauth.service', () => ({
  fetchGitHubRepos: jest.fn(),
}));

import githubRoutes from './github.routes';
import { User } from '../models/user.model';
import { fetchGitHubRepos } from '../services/github-oauth.service';

const mockedUser = User as jest.Mocked<typeof User>;
const mockedFetchRepos = fetchGitHubRepos as jest.MockedFunction<
  typeof fetchGitHubRepos
>;
const userId = new Types.ObjectId().toString();

function createApp() {
  const app = express();
  app.use('/api/github', githubRoutes);
  return app;
}

function sessionCookie(): string {
  return `session=${encodeURIComponent(signValue(userId, SESSION_SECRET))}`;
}

describe('github routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/github/repos');
    expect(res.status).toBe(401);
  });

  it('lists repositories for the current user', async () => {
    const select = jest.fn().mockResolvedValue({
      accessToken: encryptSecret('github-token', TOKEN_ENCRYPTION_KEY),
    });
    mockedUser.findById.mockReturnValue({ select } as never);
    mockedFetchRepos.mockResolvedValue([
      { id: 1, full_name: 'octocat/Hello-World', private: false },
      { id: 2, full_name: 'octocat/private-app', private: true },
    ]);

    const res = await request(app)
      .get('/api/github/repos')
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, fullName: 'octocat/Hello-World', private: false },
      { id: 2, fullName: 'octocat/private-app', private: true },
    ]);
    expect(mockedFetchRepos).toHaveBeenCalledWith('github-token');
  });

  it('returns 403 when the user has no stored GitHub token', async () => {
    const select = jest.fn().mockResolvedValue({ accessToken: undefined });
    mockedUser.findById.mockReturnValue({ select } as never);

    const res = await request(app)
      .get('/api/github/repos')
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(403);
    expect(mockedFetchRepos).not.toHaveBeenCalled();
  });
});
