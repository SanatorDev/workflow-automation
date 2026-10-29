import {
  MIN_SECRET_LENGTH,
  resolveSecret,
  resolveWebhookDelivery,
  isLocalPublicBaseUrl,
} from './env';

describe('resolveWebhookDelivery', () => {
  it('defaults to forward for localhost in development', () => {
    expect(
      resolveWebhookDelivery(undefined, {
        nodeEnv: 'development',
        publicBaseUrl: 'http://localhost:3000',
      })
    ).toBe('forward');
  });

  it('defaults to github when PUBLIC_BASE_URL is public in development', () => {
    expect(
      resolveWebhookDelivery(undefined, {
        nodeEnv: 'development',
        publicBaseUrl: 'https://example.ngrok-free.app',
      })
    ).toBe('github');
  });

  it('defaults to github in production', () => {
    expect(
      resolveWebhookDelivery(undefined, {
        nodeEnv: 'production',
        publicBaseUrl: 'https://api.example.com',
      })
    ).toBe('github');
  });

  it('rejects forward in production', () => {
    expect(() =>
      resolveWebhookDelivery('forward', {
        nodeEnv: 'production',
        publicBaseUrl: 'https://api.example.com',
      })
    ).toThrow(/forward/);
  });

  it('rejects forward when PUBLIC_BASE_URL is not localhost', () => {
    expect(() =>
      resolveWebhookDelivery('forward', {
        nodeEnv: 'development',
        publicBaseUrl: 'https://example.ngrok-free.app',
      })
    ).toThrow(/localhost/);
  });

  it('honors an explicit github override in development', () => {
    expect(
      resolveWebhookDelivery('github', {
        nodeEnv: 'development',
        publicBaseUrl: 'http://localhost:3000',
      })
    ).toBe('github');
  });
});

describe('isLocalPublicBaseUrl', () => {
  it('detects localhost and loopback hosts', () => {
    expect(isLocalPublicBaseUrl('http://localhost:3000')).toBe(true);
    expect(isLocalPublicBaseUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalPublicBaseUrl('https://example.com')).toBe(false);
  });
});

describe('resolveSecret', () => {
  it('returns the configured value in development', () => {
    expect(
      resolveSecret('SESSION_SECRET', 'my-dev-secret', {
        nodeEnv: 'development',
        fallback: 'fallback',
      })
    ).toBe('my-dev-secret');
  });

  it('uses the fallback in development when unset', () => {
    expect(
      resolveSecret('SESSION_SECRET', undefined, {
        nodeEnv: 'development',
        fallback: 'dev-fallback-value',
      })
    ).toBe('dev-fallback-value');
  });

  it('rejects missing values in production', () => {
    expect(() =>
      resolveSecret('SESSION_SECRET', undefined, { nodeEnv: 'production' })
    ).toThrow(/SESSION_SECRET/);
  });

  it('rejects example placeholders in production', () => {
    expect(() =>
      resolveSecret('SESSION_SECRET', 'change-me-to-a-long-random-string', {
        nodeEnv: 'production',
      })
    ).toThrow(/SESSION_SECRET/);
  });

  it('rejects short secrets in production', () => {
    expect(() =>
      resolveSecret('TOKEN_ENCRYPTION_KEY', 'short-but-not-placeholder', {
        nodeEnv: 'production',
      })
    ).toThrow(new RegExp(String(MIN_SECRET_LENGTH)));
  });

  it('accepts a long random secret in production', () => {
    const secret = 'a'.repeat(MIN_SECRET_LENGTH);
    expect(
      resolveSecret('TOKEN_ENCRYPTION_KEY', secret, { nodeEnv: 'production' })
    ).toBe(secret);
  });
});
