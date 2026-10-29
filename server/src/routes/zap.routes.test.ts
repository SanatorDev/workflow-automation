import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { signValue } from '../utils/cookies';

const SESSION_SECRET = 'a'.repeat(32);
const SESSION_COOKIE = 'session';

jest.mock('../config/env', () => ({
  env: {
    nodeEnv: 'development',
    clientOrigin: 'http://localhost:4200',
    sessionSecret: 'a'.repeat(32),
    publicBaseUrl: 'http://localhost:3000',
    tokenEncryptionKey: 'a'.repeat(32),
    webhookDelivery: 'forward',
  },
}));

jest.mock('../models/zap.model', () => ({
  Zap: {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

jest.mock('../services/zap-webhook.service', () => ({
  syncGitHubWebhookAfterChange: jest.fn().mockResolvedValue(undefined),
  removeGitHubWebhookForZap: jest.fn().mockResolvedValue(undefined),
  isWebhookForwardMode: jest.fn().mockReturnValue(true),
  buildWebhookForwardCommand: jest
    .fn()
    .mockReturnValue(
      'gh webhook forward --repo=octocat/Hello-World --events=pull_request --url=http://localhost:3000/api/webhooks/github/zap1'
    ),
}));

import zapRoutes from './zap.routes';
import { Zap } from '../models/zap.model';
import {
  removeGitHubWebhookForZap,
  syncGitHubWebhookAfterChange,
} from '../services/zap-webhook.service';

const mockedZap = Zap as jest.Mocked<typeof Zap>;
const mockedSyncWebhook = syncGitHubWebhookAfterChange as jest.MockedFunction<
  typeof syncGitHubWebhookAfterChange
>;
const mockedRemoveWebhook = removeGitHubWebhookForZap as jest.MockedFunction<
  typeof removeGitHubWebhookForZap
>;
const userId = new Types.ObjectId().toString();
const zapId = new Types.ObjectId().toString();

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/zaps', zapRoutes);
  return app;
}

function sessionCookie(forUserId = userId): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(signValue(forUserId, SESSION_SECRET))}`;
}

const githubZapBody = {
  name: 'PR comment',
  isOn: false,
  trigger: {
    app: 'GitHub',
    event: 'New Pull Request',
    configuration: { repository: 'octocat/Hello-World' },
  },
  action: {
    app: 'GitHub',
    event: 'Create Comment',
    configuration: {
      repository: 'octocat/Hello-World',
      body: 'Hi {{author}}',
    },
    fieldMappings: [{ targetField: 'body', sourceField: 'author' }],
  },
};

describe('zap routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/zaps');
    expect(res.status).toBe(401);
  });

  it('lists zaps for the current user', async () => {
    const sort = jest.fn().mockResolvedValue([
      {
        id: 'zap1',
        name: 'PR comment',
        isOn: true,
        trigger: {
          app: 'GitHub',
          event: 'New Pull Request',
          configuration: new Map([['repository', 'octocat/Hello-World']]),
        },
        action: {
          app: 'GitHub',
          event: 'Create Comment',
          configuration: new Map([
            ['repository', 'octocat/Hello-World'],
            ['body', 'Hi {{author}}'],
          ]),
          fieldMappings: [{ targetField: 'body', sourceField: 'author' }],
        },
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      },
    ]);
    mockedZap.find.mockReturnValue({ sort } as never);

    const res = await request(app)
      .get('/api/zaps')
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('PR comment');
    expect(res.body[0].trigger.configuration).toEqual({
      repository: 'octocat/Hello-World',
    });
    expect(res.body[0].action.fieldMappings).toEqual([
      { targetField: 'body', sourceField: 'author' },
    ]);
    expect(mockedZap.find).toHaveBeenCalledWith({ userId });
  });

  it('rejects create without trigger app/event', async () => {
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', sessionCookie())
      .send({
        name: 'Incomplete',
        isOn: false,
        trigger: { app: 'Gmail' },
        action: { app: 'Slack', event: 'Send Channel Message' },
      });

    expect(res.status).toBe(400);
    expect(mockedZap.create).not.toHaveBeenCalled();
  });

  it('rejects create when isOn is not a boolean', async () => {
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', sessionCookie())
      .send({ ...githubZapBody, isOn: 'false' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/isOn/i);
    expect(mockedZap.create).not.toHaveBeenCalled();
  });

  it('rejects GitHub steps without a repository', async () => {
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', sessionCookie())
      .send({
        ...githubZapBody,
        trigger: {
          app: 'GitHub',
          event: 'New Pull Request',
          configuration: {},
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/repository/i);
    expect(mockedZap.create).not.toHaveBeenCalled();
  });

  it('rejects github casing variants without a repository', async () => {
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', sessionCookie())
      .send({
        ...githubZapBody,
        trigger: {
          app: 'github',
          event: 'New Pull Request',
          configuration: {},
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/repository/i);
    expect(mockedZap.create).not.toHaveBeenCalled();
  });

  it('rejects GitHub trigger and action on different repositories', async () => {
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', sessionCookie())
      .send({
        ...githubZapBody,
        action: {
          ...githubZapBody.action,
          configuration: {
            ...githubZapBody.action.configuration,
            repository: 'octocat/Other-Repo',
          },
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/same repository/i);
    expect(mockedZap.create).not.toHaveBeenCalled();
  });

  it('normalizes github app casing on create', async () => {
    const created = {
      id: 'new-zap',
      ...githubZapBody,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    mockedZap.create.mockResolvedValue(created as never);
    mockedZap.findById.mockResolvedValue(created as never);

    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', sessionCookie())
      .send({
        ...githubZapBody,
        trigger: {
          ...githubZapBody.trigger,
          app: 'GITHUB',
        },
        action: {
          ...githubZapBody.action,
          app: 'GitHub',
        },
      });

    expect(res.status).toBe(201);
    expect(mockedZap.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ app: 'GitHub' }),
        action: expect.objectContaining({ app: 'GitHub' }),
      })
    );
    expect(mockedSyncWebhook).toHaveBeenCalled();
  });

  it('creates a zap for the current user and strips trigger fieldMappings', async () => {
    const created = {
      id: 'new-zap',
      ...githubZapBody,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    mockedZap.create.mockResolvedValue(created as never);
    mockedZap.findById.mockResolvedValue(created as never);

    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', sessionCookie())
      .send({
        ...githubZapBody,
        trigger: {
          ...githubZapBody.trigger,
          fieldMappings: [{ targetField: 'x', sourceField: 'y' }],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-zap');
    expect(mockedZap.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        name: 'PR comment',
        isOn: false,
        trigger: expect.not.objectContaining({
          fieldMappings: expect.anything(),
        }),
        action: expect.objectContaining({
          fieldMappings: [{ targetField: 'body', sourceField: 'author' }],
        }),
      })
    );
  });

  it('returns 400 for an invalid Zap id', async () => {
    const res = await request(app)
      .get('/api/zaps/not-an-id')
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(400);
    expect(mockedZap.findOne).not.toHaveBeenCalled();
  });

  it('gets one zap owned by the current user', async () => {
    mockedZap.findOne.mockResolvedValue({
      id: zapId,
      ...githubZapBody,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as never);

    const res = await request(app)
      .get(`/api/zaps/${zapId}`)
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(zapId);
    expect(mockedZap.findOne).toHaveBeenCalledWith({ _id: zapId, userId });
  });

  it('returns 404 when the zap is missing or owned by another user', async () => {
    mockedZap.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/zaps/${zapId}`)
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(404);
    expect(mockedZap.findOne).toHaveBeenCalledWith({ _id: zapId, userId });
  });

  it('updates a zap and can clear fieldMappings', async () => {
    const existing = {
      id: zapId,
      userId,
      ...githubZapBody,
      isOn: false,
      set: jest.fn(function (this: Record<string, unknown>, data: object) {
        Object.assign(this, data);
      }),
      save: jest.fn().mockResolvedValue(undefined),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    const select = jest.fn().mockResolvedValue(existing);
    mockedZap.findOne.mockReturnValue({ select } as never);

    const updated = {
      id: zapId,
      name: 'PR comment',
      isOn: true,
      trigger: githubZapBody.trigger,
      action: {
        app: 'GitHub',
        event: 'Create Comment',
        configuration: {
          repository: 'octocat/Hello-World',
          body: 'Static only',
        },
      },
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    };
    mockedZap.findById.mockResolvedValue(updated as never);

    const res = await request(app)
      .put(`/api/zaps/${zapId}`)
      .set('Cookie', sessionCookie())
      .send({
        name: 'PR comment',
        isOn: true,
        trigger: githubZapBody.trigger,
        action: {
          app: 'GitHub',
          event: 'Create Comment',
          configuration: {
            repository: 'octocat/Hello-World',
            body: 'Static only',
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.isOn).toBe(true);
    expect(res.body.action.fieldMappings).toBeUndefined();
    expect(existing.set).toHaveBeenCalledWith(
      expect.objectContaining({
        isOn: true,
        action: expect.not.objectContaining({
          fieldMappings: expect.anything(),
        }),
      })
    );
    expect(existing.save).toHaveBeenCalled();
    expect(mockedSyncWebhook).toHaveBeenCalled();
  });

  it('returns 404 when updating another user\'s zap', async () => {
    const select = jest.fn().mockResolvedValue(null);
    mockedZap.findOne.mockReturnValue({ select } as never);

    const res = await request(app)
      .put(`/api/zaps/${zapId}`)
      .set('Cookie', sessionCookie())
      .send(githubZapBody);

    expect(res.status).toBe(404);
    expect(mockedZap.findOne).toHaveBeenCalledWith({ _id: zapId, userId });
  });

  it('deletes a zap owned by the current user', async () => {
    const existing = { id: zapId, userId, githubWebhookId: 1 };
    const select = jest.fn().mockResolvedValue(existing);
    mockedZap.findOne.mockReturnValue({ select } as never);
    mockedZap.deleteOne.mockResolvedValue({ deletedCount: 1 } as never);

    const res = await request(app)
      .delete(`/api/zaps/${zapId}`)
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(204);
    expect(mockedRemoveWebhook).toHaveBeenCalledWith(existing);
    expect(mockedZap.deleteOne).toHaveBeenCalledWith({
      _id: zapId,
      userId,
    });
  });

  it('returns 404 when deleting a missing zap', async () => {
    const select = jest.fn().mockResolvedValue(null);
    mockedZap.findOne.mockReturnValue({ select } as never);

    const res = await request(app)
      .delete(`/api/zaps/${zapId}`)
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(404);
  });
});
