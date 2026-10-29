import { env } from '../config/env';
import { IFieldMapping, IZap } from '../models/zap.model';
import { User } from '../models/user.model';
import {
  createIssueComment,
  parseOwnerRepo,
} from './github-api.service';
import { stepConfigurationValue } from './zap-webhook.service';
import { decryptSecret } from '../utils/secret-crypto';

export type TriggerFieldData = Record<string, string>;

type GitHubPullRequestPayload = {
  action?: string;
  number?: number;
  pull_request?: {
    number?: number;
    user?: { login?: string };
    head?: { ref?: string };
    base?: { ref?: string };
  };
};

/** Map a GitHub `pull_request` webhook payload into Zap trigger field tokens. */
export function mapPullRequestTriggerFields(
  payload: unknown
): TriggerFieldData | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const event = payload as GitHubPullRequestPayload;
  const pr = event.pull_request;
  if (!pr) {
    return null;
  }

  const author = pr.user?.login?.trim();
  // GitHub PR branch names live on head.ref / base.ref (not *.repo.default_branch).
  const headBranch = pr.head?.ref?.trim();
  const baseBranch = pr.base?.ref?.trim();
  const number = pullRequestNumber(payload);

  const data: TriggerFieldData = {};
  if (author) {
    data.author = author;
  }
  if (headBranch) {
    data.headBranch = headBranch;
  }
  if (baseBranch) {
    data.baseBranch = baseBranch;
  }
  if (number !== null) {
    data.number = String(number);
  }

  return data;
}

export function pullRequestNumber(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const event = payload as GitHubPullRequestPayload;
  const fromPr = event.pull_request?.number;
  if (typeof fromPr === 'number' && fromPr > 0) {
    return fromPr;
  }
  if (typeof event.number === 'number' && event.number > 0) {
    return event.number;
  }
  return null;
}

export function isNewPullRequestEvent(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  return (payload as GitHubPullRequestPayload).action === 'opened';
}

/**
 * Replace `{{token}}` placeholders in a template using trigger field data.
 * Token lookup is case-insensitive. Unknown tokens are left unchanged.
 */
export function interpolateTemplate(
  template: string,
  data: TriggerFieldData
): string {
  const lowerData: TriggerFieldData = {};
  for (const [key, value] of Object.entries(data)) {
    lowerData[key.toLowerCase()] = value;
  }

  return template.replace(
    /\{\{([a-zA-Z0-9_]+)\}\}/g,
    (match, token: string) => {
      const value = lowerData[token.toLowerCase()];
      return value !== undefined ? value : match;
    }
  );
}

/**
 * Build the final action body from configuration + optional fieldMappings.
 * Prefer interpolating the authored template (supports multiple tokens in one field).
 */
export function resolveActionBody(
  zap: IZap,
  triggerData: TriggerFieldData
): string {
  const template =
    stepConfigurationValue(zap.action, 'body') ??
    bodyFromFieldMappings(zap.action.fieldMappings, triggerData);

  return interpolateTemplate(template, triggerData);
}

function bodyFromFieldMappings(
  mappings: IFieldMapping[] | undefined,
  triggerData: TriggerFieldData
): string {
  if (!mappings?.length) {
    return '';
  }

  const bodyMappings = mappings.filter((m) => m.targetField === 'body');
  const parts: string[] = [];
  for (const mapping of bodyMappings) {
    if (mapping.sourceField && triggerData[mapping.sourceField] !== undefined) {
      parts.push(triggerData[mapping.sourceField]);
    } else if (mapping.value !== undefined) {
      parts.push(mapping.value);
    }
  }
  return parts.join(' ');
}

/**
 * Execute a Zap action for a verified GitHub webhook delivery.
 * Currently supports GitHub Create Comment on a new pull request.
 */
export async function executeZapFromGitHubEvent(
  zap: IZap,
  payload: unknown
): Promise<void> {
  if (!zap.isOn) {
    return;
  }

  if (!isNewPullRequestEvent(payload)) {
    return;
  }

  if (
    zap.action.app.toLowerCase() !== 'github' ||
    zap.action.event !== 'Create Comment'
  ) {
    console.warn(
      `Zap ${zap.id}: unsupported action ${zap.action.app}/${zap.action.event}`
    );
    return;
  }

  const triggerData = mapPullRequestTriggerFields(payload);
  if (!triggerData) {
    throw new Error('Webhook payload was missing pull_request fields');
  }

  const prNumber = pullRequestNumber(payload);
  if (prNumber === null) {
    throw new Error('Webhook payload was missing pull request number');
  }

  const repository = stepConfigurationValue(zap.action, 'repository');
  if (!repository) {
    throw new Error('Zap action is missing repository');
  }

  const parsed = parseOwnerRepo(repository);
  if (!parsed) {
    throw new Error(`Invalid action repository "${repository}"`);
  }

  const body = resolveActionBody(zap, triggerData);
  if (!body.trim()) {
    throw new Error('Resolved comment body is empty');
  }

  const user = await User.findById(zap.userId).select('+accessToken');
  if (!user?.accessToken) {
    throw new Error('GitHub access token missing for Zap owner');
  }

  const accessToken = decryptSecret(user.accessToken, env.tokenEncryptionKey);
  await createIssueComment(
    accessToken,
    parsed.owner,
    parsed.repo,
    prNumber,
    body
  );
}
