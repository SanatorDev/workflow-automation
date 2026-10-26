import {
  interpolateTemplate,
  isNewPullRequestEvent,
  mapPullRequestTriggerFields,
  pullRequestNumber,
  resolveActionBody,
  executeZapFromGitHubEvent,
} from './zap-runner.service';
import { IZap } from '../models/zap.model';

jest.mock('../models/user.model', () => ({
  User: {
    findById: jest.fn(),
  },
}));

jest.mock('./github-api.service', () => ({
  createIssueComment: jest.fn().mockResolvedValue(undefined),
  parseOwnerRepo: jest.requireActual('./github-api.service').parseOwnerRepo,
}));

jest.mock('../config/env', () => ({
  env: {
    tokenEncryptionKey: 'a'.repeat(32),
  },
}));

jest.mock('../utils/secret-crypto', () => ({
  decryptSecret: jest.fn().mockReturnValue('github-access-token'),
}));

import { User } from '../models/user.model';
import { createIssueComment } from './github-api.service';

const mockedUserFindById = User.findById as jest.MockedFunction<
  typeof User.findById
>;
const mockedCreateComment = createIssueComment as jest.MockedFunction<
  typeof createIssueComment
>;

describe('zap-runner.service', () => {
  const prPayload = {
    action: 'opened',
    number: 42,
    pull_request: {
      number: 42,
      user: { login: 'SanatorDev' },
      head: { ref: 'feature' },
      base: { ref: 'develop' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps pull_request fields to trigger tokens from head.ref / base.ref', () => {
    expect(mapPullRequestTriggerFields(prPayload)).toEqual({
      author: 'SanatorDev',
      headBranch: 'feature',
      baseBranch: 'develop',
      number: '42',
    });
  });

  it('does not use repo default_branch for branch tokens', () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 7,
        user: { login: 'alice' },
        head: {
          ref: 'fix-bug',
          repo: { default_branch: 'main' },
        },
        base: {
          ref: 'release',
          repo: { default_branch: 'main' },
        },
      },
    };

    expect(mapPullRequestTriggerFields(payload)).toEqual({
      author: 'alice',
      headBranch: 'fix-bug',
      baseBranch: 'release',
      number: '7',
    });
  });

  it('detects new pull request opened events', () => {
    expect(isNewPullRequestEvent(prPayload)).toBe(true);
    expect(isNewPullRequestEvent({ ...prPayload, action: 'closed' })).toBe(
      false
    );
  });

  it('reads the pull request number', () => {
    expect(pullRequestNumber(prPayload)).toBe(42);
  });

  it('interpolates camelCase template tokens case-insensitively', () => {
    const body = interpolateTemplate(
      'PR #{{number}} by {{Author}} from {{headBranch}} to {{baseBranch}}',
      {
        author: 'SanatorDev',
        headBranch: 'feature',
        baseBranch: 'develop',
        number: '42',
      }
    );
    expect(body).toBe('PR #42 by SanatorDev from feature to develop');
  });

  it('resolves action body from configuration template', () => {
    const zap = {
      action: {
        app: 'GitHub',
        event: 'Create Comment',
        configuration: {
          repository: 'SanatorDev/workflow-automation',
          body: 'PR #{{number}} by {{author}} from {{headBranch}} to {{baseBranch}}',
        },
        fieldMappings: [
          { targetField: 'body', sourceField: 'number' },
          { targetField: 'body', sourceField: 'author' },
          { targetField: 'body', sourceField: 'headBranch' },
          { targetField: 'body', sourceField: 'baseBranch' },
        ],
      },
    } as unknown as IZap;

    expect(
      resolveActionBody(zap, {
        author: 'SanatorDev',
        headBranch: 'feature',
        baseBranch: 'develop',
        number: '42',
      })
    ).toBe('PR #42 by SanatorDev from feature to develop');
  });

  it('posts a comment for an opened pull request', async () => {
    mockedUserFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ accessToken: 'encrypted' }),
    } as never);

    const zap = {
      id: 'zap1',
      isOn: true,
      userId: 'user1',
      action: {
        app: 'GitHub',
        event: 'Create Comment',
        configuration: {
          repository: 'SanatorDev/workflow-automation',
          body: 'Hi {{author}} on {{headBranch}} → {{baseBranch}} (#{{number}})',
        },
      },
    } as unknown as IZap;

    await executeZapFromGitHubEvent(zap, prPayload);

    expect(mockedCreateComment).toHaveBeenCalledWith(
      'github-access-token',
      'SanatorDev',
      'workflow-automation',
      42,
      'Hi SanatorDev on feature → develop (#42)'
    );
  });

  it('skips non-opened pull request actions', async () => {
    const zap = {
      id: 'zap1',
      isOn: true,
      action: { app: 'GitHub', event: 'Create Comment', configuration: {} },
    } as unknown as IZap;

    await executeZapFromGitHubEvent(zap, { ...prPayload, action: 'closed' });

    expect(mockedUserFindById).not.toHaveBeenCalled();
    expect(mockedCreateComment).not.toHaveBeenCalled();
  });
});
