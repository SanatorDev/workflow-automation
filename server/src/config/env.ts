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

export const env = {
  port,
  mongodbUri: process.env.MONGODB_URI,
  clientOrigin,
  nodeEnv,
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
