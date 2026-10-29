import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const MIN_SECRET_LENGTH = 32;

const EXAMPLE_SECRETS = new Set([
  'change-me-to-a-long-random-string',
  'dev-session-secret-change-me',
  'dev-session-secret-change-me-32b!',
  'dev-token-encryption-key-change-me!',
]);

const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:4200';
const nodeEnv = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT) || 3000;

/**
 * Resolves a secret used for crypto. In production, rejects missing, placeholder,
 * and short values. In development, allows an explicit fallback.
 */
export function resolveSecret(
  name: string,
  value: string | undefined,
  options: { nodeEnv: string; fallback?: string }
): string {
  const secret = value?.trim();

  if (options.nodeEnv === 'production') {
    if (
      !secret ||
      EXAMPLE_SECRETS.has(secret) ||
      secret.length < MIN_SECRET_LENGTH
    ) {
      throw new Error(
        `${name} must be set to a random value of at least ${MIN_SECRET_LENGTH} characters in production (not an example placeholder)`
      );
    }
    return secret;
  }

  if (secret) {
    return secret;
  }

  if (options.fallback) {
    return options.fallback;
  }

  throw new Error(`${name} is required`);
}

/** In production the callback URL must be explicit; in dev it defaults through the Angular proxy. */
function resolveGithubCallbackUrl(): string {
  const configured = process.env.GITHUB_CALLBACK_URL?.trim();
  if (configured) {
    return configured;
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'GITHUB_CALLBACK_URL is required in production (e.g. https://your.host/api/auth/github/callback)'
    );
  }

  return `${clientOrigin}/api/auth/github/callback`;
}

/**
 * Public base URL GitHub can reach for webhooks.
 * Production requires an explicit value; development defaults to local server.
 */
function resolvePublicBaseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (configured) {
    return configured;
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'PUBLIC_BASE_URL is required in production (e.g. https://your.host)'
    );
  }

  return `http://localhost:${port}`;
}

export type WebhookDeliveryMode = 'github' | 'forward';

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

export function isLocalPublicBaseUrl(baseUrl: string): boolean {
  try {
    return isLocalHostname(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * How webhooks are delivered.
 * - `github`: register a real repo webhook (needs a publicly reachable PUBLIC_BASE_URL)
 * - `forward`: skip registration; use `gh webhook forward` for local testing
 *
 * Defaults to `forward` in development when PUBLIC_BASE_URL is localhost.
 */
export function resolveWebhookDelivery(
  value: string | undefined,
  options: { nodeEnv: string; publicBaseUrl: string }
): WebhookDeliveryMode {
  const configured = value?.trim().toLowerCase();
  if (configured === 'github' || configured === 'forward') {
    if (configured === 'forward') {
      if (options.nodeEnv === 'production') {
        throw new Error(
          'WEBHOOK_DELIVERY=forward is not allowed in production'
        );
      }
      if (!isLocalPublicBaseUrl(options.publicBaseUrl)) {
        throw new Error(
          'WEBHOOK_DELIVERY=forward requires a localhost PUBLIC_BASE_URL (HMAC is skipped in forward mode)'
        );
      }
    }
    return configured;
  }

  if (options.nodeEnv === 'production') {
    return 'github';
  }

  return isLocalPublicBaseUrl(options.publicBaseUrl) ? 'forward' : 'github';
}

const publicBaseUrl = resolvePublicBaseUrl();

export const env = {
  port,
  mongodbUri: process.env.MONGODB_URI,
  clientOrigin,
  nodeEnv,
  publicBaseUrl,
  /**
   * `github` = create GitHub webhooks via API.
   * `forward` = local testing with `gh webhook forward` (no API registration).
   */
  webhookDelivery: resolveWebhookDelivery(process.env.WEBHOOK_DELIVERY, {
    nodeEnv,
    publicBaseUrl,
  }),
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  githubCallbackUrl: resolveGithubCallbackUrl(),
  sessionSecret: resolveSecret('SESSION_SECRET', process.env.SESSION_SECRET, {
    nodeEnv,
    fallback: 'dev-session-secret-change-me-32b!',
  }),
  /** Dedicated key for encrypting OAuth access tokens (independent of session signing). */
  tokenEncryptionKey: resolveSecret(
    'TOKEN_ENCRYPTION_KEY',
    process.env.TOKEN_ENCRYPTION_KEY,
    {
      nodeEnv,
      fallback: 'dev-token-encryption-key-change-me!',
    }
  ),
};
