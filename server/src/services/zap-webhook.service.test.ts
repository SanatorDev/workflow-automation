jest.mock('../config/env', () => ({
  env: {
    publicBaseUrl: 'https://api.example.com',
    tokenEncryptionKey: 'a'.repeat(32),
    webhookDelivery: 'github',
  },
}));

jest.mock('../models/zap.model', () => ({
  Zap: {
    updateOne: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../models/user.model', () => ({
  User: {
    findById: jest.fn(),
  },
}));

jest.mock('./github-api.service', () => ({
  createRepoWebhook: jest.fn(),
  deleteRepoWebhook: jest.fn().mockResolvedValue(undefined),
  parseOwnerRepo: jest.requireActual('./github-api.service').parseOwnerRepo,
}));

jest.mock('../utils/secret-crypto', () => ({
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
  decryptSecret: jest.fn().mockReturnValue('github-access-token'),
}));

import { env } from '../config/env';
import { IZap, Zap } from '../models/zap.model';
import { User } from '../models/user.model';
import {
  createRepoWebhook,
  deleteRepoWebhook,
} from './github-api.service';
import {
  ensureGitHubWebhookForZap,
  syncGitHubWebhookAfterChange,
} from './zap-webhook.service';

const mockedCreate = createRepoWebhook as jest.MockedFunction<
  typeof createRepoWebhook
>;
const mockedDelete = deleteRepoWebhook as jest.MockedFunction<
  typeof deleteRepoWebhook
>;
const mockedUpdateOne = Zap.updateOne as jest.MockedFunction<typeof Zap.updateOne>;
const mockedUserFindById = User.findById as jest.MockedFunction<typeof User.findById>;
const mutableEnv = env as { webhookDelivery: 'github' | 'forward' };

function githubZap(overrides: Partial<IZap> = {}): IZap {
  return {
    id: 'zap1',
    userId: 'user1',
    isOn: true,
    trigger: {
      app: 'GitHub',
      event: 'New Pull Request',
      configuration: { repository: 'octocat/Hello-World' },
    },
    action: {
      app: 'GitHub',
      event: 'Create Comment',
      configuration: { repository: 'octocat/Hello-World', body: 'hi' },
    },
    ...overrides,
  } as IZap;
}

describe('zap-webhook.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutableEnv.webhookDelivery = 'github';
    mockedUserFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ accessToken: 'encrypted' }),
    } as never);
    mockedCreate.mockResolvedValue({ id: 99 });
  });

  it('persists the webhook secret before creating the GitHub hook', async () => {
    const zap = githubZap();

    await ensureGitHubWebhookForZap(zap);

    expect(mockedUpdateOne).toHaveBeenCalledWith(
      { _id: 'zap1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          githubWebhookSecret: expect.any(String),
        }),
        $unset: { githubWebhookId: 1 },
      })
    );
    expect(mockedCreate).toHaveBeenCalled();
    expect(zap.githubWebhookId).toBe(99);
  });

  it('skips GitHub registration in forward mode', async () => {
    mutableEnv.webhookDelivery = 'forward';
    const zap = githubZap();

    await ensureGitHubWebhookForZap(zap);

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(zap.githubWebhookId).toBeUndefined();
  });

  it('removes the previous hook when turning a zap off', async () => {
    const previous = githubZap({ githubWebhookId: 42 });
    const next = githubZap({ isOn: false, githubWebhookId: 42 });

    await syncGitHubWebhookAfterChange(previous, next);

    expect(mockedDelete).toHaveBeenCalledWith(
      'github-access-token',
      'octocat',
      'Hello-World',
      42
    );
    expect(next.githubWebhookId).toBeUndefined();
  });

  it('deletes the old repo hook then creates on the new repo when the trigger changes', async () => {
    const previous = githubZap({
      githubWebhookId: 42,
      trigger: {
        app: 'GitHub',
        event: 'New Pull Request',
        configuration: { repository: 'octocat/Old-Repo' },
      },
    });
    const next = githubZap({
      githubWebhookId: 42,
      trigger: {
        app: 'GitHub',
        event: 'New Pull Request',
        configuration: { repository: 'octocat/New-Repo' },
      },
    });

    await syncGitHubWebhookAfterChange(previous, next);

    expect(mockedDelete).toHaveBeenCalledWith(
      'github-access-token',
      'octocat',
      'Old-Repo',
      42
    );
    expect(mockedCreate).toHaveBeenCalledWith(
      'github-access-token',
      'octocat',
      'New-Repo',
      expect.objectContaining({
        url: 'https://api.example.com/api/webhooks/github/zap1',
      })
    );
    expect(next.githubWebhookId).toBe(99);
  });

  it('does not recreate when an on zap is saved without a repo change', async () => {
    const previous = githubZap({ githubWebhookId: 42, isOn: true });
    const next = githubZap({ githubWebhookId: 42, isOn: true });

    await syncGitHubWebhookAfterChange(previous, next);

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});
