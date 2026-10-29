import crypto from 'crypto';
import { env } from '../config/env';
import { IZap, IZapStep, Zap } from '../models/zap.model';
import { User } from '../models/user.model';
import {
  createRepoWebhook,
  deleteRepoWebhook,
  parseOwnerRepo,
} from './github-api.service';
import { decryptSecret, encryptSecret } from '../utils/secret-crypto';

const GITHUB_APP = 'GitHub';
const NEW_PULL_REQUEST = 'New Pull Request';

function isGitHubNewPullRequestTrigger(step: IZapStep): boolean {
  return (
    step.app.toLowerCase() === GITHUB_APP.toLowerCase() &&
    step.event === NEW_PULL_REQUEST
  );
}

/** Read a configuration value whether stored as Map or plain object. */
export function stepConfigurationValue(
  step: IZapStep,
  key: string
): string | undefined {
  const config = step.configuration;
  if (!config) {
    return undefined;
  }
  if (config instanceof Map) {
    const value = config.get(key);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
  const value = (config as Record<string, string>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function webhookUrlForZap(zapId: string): string {
  return `${env.publicBaseUrl}/api/webhooks/github/${zapId}`;
}

/**
 * CLI command to forward repo events to this Zap locally.
 * @see https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/using-the-github-cli-to-forward-webhooks-for-testing
 */
export function buildWebhookForwardCommand(zap: IZap): string | null {
  if (!isGitHubNewPullRequestTrigger(zap.trigger)) {
    return null;
  }
  const repository = stepConfigurationValue(zap.trigger, 'repository');
  if (!repository) {
    return null;
  }
  return `gh webhook forward --repo=${repository} --events=pull_request --url=${webhookUrlForZap(zap.id)}`;
}

export function isWebhookForwardMode(): boolean {
  return env.webhookDelivery === 'forward';
}

async function loadUserAccessToken(userId: string): Promise<string> {
  const user = await User.findById(userId).select('+accessToken');
  if (!user?.accessToken) {
    throw new Error(
      'GitHub access token missing; sign out and sign in again'
    );
  }
  return decryptSecret(user.accessToken, env.tokenEncryptionKey);
}

async function clearWebhookFields(zapId: string): Promise<void> {
  await Zap.updateOne(
    { _id: zapId },
    { $unset: { githubWebhookId: 1, githubWebhookSecret: 1 } }
  );
}

/**
 * Delete the GitHub webhook for a Zap if one is registered.
 * Idempotent: missing hook / missing token fields are ignored where safe.
 */
export async function removeGitHubWebhookForZap(zap: IZap): Promise<void> {
  if (typeof zap.githubWebhookId !== 'number') {
    await clearWebhookFields(zap.id);
    return;
  }

  const repository = stepConfigurationValue(zap.trigger, 'repository');
  const parsed = repository ? parseOwnerRepo(repository) : null;

  if (parsed) {
    try {
      const accessToken = await loadUserAccessToken(String(zap.userId));
      await deleteRepoWebhook(
        accessToken,
        parsed.owner,
        parsed.repo,
        zap.githubWebhookId
      );
    } catch (err) {
      // Still clear local fields so the Zap can be turned off / deleted.
      console.error('Failed to delete GitHub webhook:', err);
    }
  }

  await clearWebhookFields(zap.id);
  zap.githubWebhookId = undefined;
  zap.githubWebhookSecret = undefined;
}

/**
 * Ensure a Zap that is on has a live GitHub webhook for New Pull Request.
 * Re-registers when the trigger repository changes.
 * In `forward` delivery mode, skips GitHub API registration (use `gh webhook forward`).
 */
export async function ensureGitHubWebhookForZap(zap: IZap): Promise<void> {
  if (!zap.isOn || !isGitHubNewPullRequestTrigger(zap.trigger)) {
    return;
  }

  const repository = stepConfigurationValue(zap.trigger, 'repository');
  if (!repository) {
    throw new Error('GitHub trigger is missing repository');
  }

  const parsed = parseOwnerRepo(repository);
  if (!parsed) {
    throw new Error(`Invalid repository "${repository}"`);
  }

  if (isWebhookForwardMode()) {
    const command = buildWebhookForwardCommand(zap);
    console.info(
      `[webhooks] WEBHOOK_DELIVERY=forward — not registering a GitHub webhook (localhost is not reachable). Forward events with:\n  ${command}`
    );
    return;
  }

  const accessToken = await loadUserAccessToken(String(zap.userId));

  // Drop an existing hook on this repo before creating a replacement.
  if (typeof zap.githubWebhookId === 'number') {
    try {
      await deleteRepoWebhook(
        accessToken,
        parsed.owner,
        parsed.repo,
        zap.githubWebhookId
      );
    } catch {
      // Best-effort; continue to create a new hook.
    }
  }

  const plaintextSecret = crypto.randomBytes(32).toString('hex');
  const encryptedSecret = encryptSecret(
    plaintextSecret,
    env.tokenEncryptionKey
  );

  // Persist the secret before calling GitHub so the ping delivery can be verified.
  await Zap.updateOne(
    { _id: zap.id },
    {
      $set: { githubWebhookSecret: encryptedSecret },
      $unset: { githubWebhookId: 1 },
    }
  );
  zap.githubWebhookSecret = encryptedSecret;
  zap.githubWebhookId = undefined;

  const created = await createRepoWebhook(
    accessToken,
    parsed.owner,
    parsed.repo,
    {
      url: webhookUrlForZap(zap.id),
      secret: plaintextSecret,
      events: ['pull_request'],
    }
  );

  // Keep in-memory id before the DB write so create/update rollback can delete the hook.
  zap.githubWebhookId = created.id;

  await Zap.updateOne(
    { _id: zap.id },
    {
      $set: {
        githubWebhookId: created.id,
        githubWebhookSecret: encryptedSecret,
      },
    }
  );
}

/**
 * Sync GitHub webhook state after create/update based on previous vs next Zap.
 */
export async function syncGitHubWebhookAfterChange(
  previous: IZap | null,
  next: IZap
): Promise<void> {
  const shouldHaveHook =
    next.isOn && isGitHubNewPullRequestTrigger(next.trigger);

  if (!shouldHaveHook) {
    if (
      typeof previous?.githubWebhookId === 'number' ||
      typeof next.githubWebhookId === 'number'
    ) {
      // Prefer previous for delete when turning off (has webhook fields).
      const source =
        typeof previous?.githubWebhookId === 'number' ? previous : next;
      await removeGitHubWebhookForZap(source);
      next.githubWebhookId = undefined;
      next.githubWebhookSecret = undefined;
    }
    return;
  }

  // Local forward mode: no GitHub-managed hook to create/update.
  if (isWebhookForwardMode()) {
    await ensureGitHubWebhookForZap(next);
    return;
  }

  const previousRepo = previous
    ? stepConfigurationValue(previous.trigger, 'repository')
    : undefined;
  const nextRepo = stepConfigurationValue(next.trigger, 'repository');
  const repoChanged =
    typeof previous?.githubWebhookId === 'number' && previousRepo !== nextRepo;

  if (repoChanged && previous) {
    // Delete from the old repository before creating on the new one.
    try {
      const accessToken = await loadUserAccessToken(String(previous.userId));
      const oldParsed = previousRepo ? parseOwnerRepo(previousRepo) : null;
      if (oldParsed && typeof previous.githubWebhookId === 'number') {
        await deleteRepoWebhook(
          accessToken,
          oldParsed.owner,
          oldParsed.repo,
          previous.githubWebhookId
        );
      }
    } catch (err) {
      console.error('Failed to delete previous GitHub webhook:', err);
    }
    await clearWebhookFields(next.id);
    next.githubWebhookId = undefined;
    next.githubWebhookSecret = undefined;
  }

  const needsCreate =
    typeof next.githubWebhookId !== 'number' ||
    !previous?.isOn ||
    repoChanged;

  if (needsCreate) {
    await ensureGitHubWebhookForZap(next);
  }
}

/**
 * Load a Zap including webhook secret (for signature verification).
 */
export async function findZapWithWebhookSecret(
  zapId: string
): Promise<IZap | null> {
  return Zap.findById(zapId).select('+githubWebhookSecret');
}
