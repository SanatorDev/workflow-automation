import { MIN_SECRET_LENGTH, resolveSecret } from './env';

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
