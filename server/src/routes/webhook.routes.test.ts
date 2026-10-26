import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { encryptSecret } from '../utils/secret-crypto';

const TOKEN_ENCRYPTION_KEY = 'a'.repeat(32);

jest.mock('../config/env', () => ({
  env: {
    nodeEnv: 'development',
    clientOrigin: 'http://localhost:4200',
    publicBaseUrl: 'http://localhost:3000',
    tokenEncryptionKey: 'a'.repeat(32),
    webhookDelivery: 'github',
  },
}));

jest.mock('../services/zap-webhook.service', () => ({
  findZapWithWebhookSecret: jest.fn(),
  isWebhookForwardMode: jest.fn().mockReturnValue(false),
}));

jest.mock('../services/zap-runner.service', () => ({
  executeZapFromGitHubEvent: jest.fn().mockResolvedValue(undefined),
}));

import webhookRoutes, {
  clearSeenDeliveryIds,
  verifyGitHubSignature,
} from './webhook.routes';
import { env } from '../config/env';
import {
  findZapWithWebhookSecret,
  isWebhookForwardMode,
} from '../services/zap-webhook.service';
import { executeZapFromGitHubEvent } from '../services/zap-runner.service';

const mockedFindZap = findZapWithWebhookSecret as jest.MockedFunction<
  typeof findZapWithWebhookSecret
>;
const mockedIsForward = isWebhookForwardMode as jest.MockedFunction<
  typeof isWebhookForwardMode
>;
const mockedExecute = executeZapFromGitHubEvent as jest.MockedFunction<
  typeof executeZapFromGitHubEvent
>;
const mutableEnv = env as { webhookDelivery: 'github' | 'forward' };

const zapId = new Types.ObjectId().toString();
const webhookSecret = 'webhook-secret-value';

function createApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use('/api/webhooks', webhookRoutes);
  return app;
}

function sign(body: string, secret: string): string {
  return (
    'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('hex')
  );
}

describe('verifyGitHubSignature', () => {
  it('accepts a valid HMAC signature', () => {
    const raw = Buffer.from('{"ok":true}', 'utf8');
    const signature = sign(raw.toString('utf8'), webhookSecret);
    expect(verifyGitHubSignature(raw, signature, webhookSecret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const raw = Buffer.from('{"ok":true}', 'utf8');
    expect(
      verifyGitHubSignature(raw, 'sha256=deadbeef', webhookSecret)
    ).toBe(false);
  });
});

describe('webhook routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    clearSeenDeliveryIds();
    mutableEnv.webhookDelivery = 'github';
    mockedIsForward.mockReturnValue(false);
  });

  it('returns 400 for an invalid zap id', async () => {
    const res = await request(app).post('/api/webhooks/github/not-an-id');
    expect(res.status).toBe(400);
  });

  it('acks verified ping events without executing', async () => {
    mockedFindZap.mockResolvedValue({
      id: zapId,
      isOn: true,
      githubWebhookSecret: encryptSecret(webhookSecret, TOKEN_ENCRYPTION_KEY),
    } as never);

    const body = { zen: 'keep it logically awesome' };
    const raw = JSON.stringify(body);

    const res = await request(app)
      .post(`/api/webhooks/github/${zapId}`)
      .set('X-GitHub-Event', 'ping')
      .set('X-Hub-Signature-256', sign(raw, webhookSecret))
      .set('Content-Type', 'application/json')
      .send(raw);

    expect(res.status).toBe(200);
    expect(mockedFindZap).toHaveBeenCalled();
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('rejects deliveries with a bad signature', async () => {
    mockedFindZap.mockResolvedValue({
      id: zapId,
      isOn: true,
      githubWebhookSecret: encryptSecret(webhookSecret, TOKEN_ENCRYPTION_KEY),
    } as never);

    const body = { action: 'opened' };
    const res = await request(app)
      .post(`/api/webhooks/github/${zapId}`)
      .set('X-GitHub-Event', 'pull_request')
      .set('X-Hub-Signature-256', 'sha256=invalid')
      .send(body);

    expect(res.status).toBe(401);
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('verifies signature and executes the zap for opened PRs', async () => {
    mockedFindZap.mockResolvedValue({
      id: zapId,
      isOn: true,
      githubWebhookSecret: encryptSecret(webhookSecret, TOKEN_ENCRYPTION_KEY),
    } as never);

    const body = {
      action: 'opened',
      pull_request: {
        number: 1,
        user: { login: 'SanatorDev' },
        head: { ref: 'feature' },
        base: { ref: 'main' },
      },
    };
    const raw = JSON.stringify(body);

    const res = await request(app)
      .post(`/api/webhooks/github/${zapId}`)
      .set('X-GitHub-Event', 'pull_request')
      .set('X-Hub-Signature-256', sign(raw, webhookSecret))
      .set('Content-Type', 'application/json')
      .send(raw);

    expect(res.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalled();
  });

  it('skips duplicate deliveries with the same X-GitHub-Delivery after success', async () => {
    mockedFindZap.mockResolvedValue({
      id: zapId,
      isOn: true,
      githubWebhookSecret: encryptSecret(webhookSecret, TOKEN_ENCRYPTION_KEY),
    } as never);

    const body = {
      action: 'opened',
      pull_request: {
        number: 1,
        user: { login: 'SanatorDev' },
        head: { ref: 'feature' },
        base: { ref: 'main' },
      },
    };
    const raw = JSON.stringify(body);
    const headers = {
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature-256': sign(raw, webhookSecret),
      'X-GitHub-Delivery': 'delivery-1',
      'Content-Type': 'application/json',
    };

    const first = await request(app)
      .post(`/api/webhooks/github/${zapId}`)
      .set(headers)
      .send(raw);
    const second = await request(app)
      .post(`/api/webhooks/github/${zapId}`)
      .set(headers)
      .send(raw);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledTimes(1);
  });

  it('allows redelivery when the first execution fails', async () => {
    mockedFindZap.mockResolvedValue({
      id: zapId,
      isOn: true,
      githubWebhookSecret: encryptSecret(webhookSecret, TOKEN_ENCRYPTION_KEY),
    } as never);
    mockedExecute
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);

    const body = {
      action: 'opened',
      pull_request: {
        number: 1,
        user: { login: 'SanatorDev' },
        head: { ref: 'feature' },
        base: { ref: 'main' },
      },
    };
    const raw = JSON.stringify(body);
    const headers = {
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature-256': sign(raw, webhookSecret),
      'X-GitHub-Delivery': 'delivery-fail-then-ok',
      'Content-Type': 'application/json',
    };

    await request(app).post(`/api/webhooks/github/${zapId}`).set(headers).send(raw);
    await request(app).post(`/api/webhooks/github/${zapId}`).set(headers).send(raw);

    expect(mockedExecute).toHaveBeenCalledTimes(2);
  });

  it('in forward mode accepts deliveries without a webhook secret or signature', async () => {
    mutableEnv.webhookDelivery = 'forward';
    mockedIsForward.mockReturnValue(true);
    mockedFindZap.mockResolvedValue({
      id: zapId,
      isOn: true,
    } as never);

    const res = await request(app)
      .post(`/api/webhooks/github/${zapId}`)
      .set('X-GitHub-Event', 'pull_request')
      .send({
        action: 'opened',
        pull_request: {
          number: 1,
          user: { login: 'SanatorDev' },
          head: { ref: 'feature' },
          base: { ref: 'main' },
        },
      });

    expect(res.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalled();
  });
});
