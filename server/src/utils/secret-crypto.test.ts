import { decryptSecret, encryptSecret } from './secret-crypto';

describe('encryptSecret / decryptSecret', () => {
  const secret = 'unit-test-session-secret';

  it('round-trips plaintext', () => {
    const encrypted = encryptSecret('gho_example_token', secret);
    expect(encrypted).not.toBe('gho_example_token');
    expect(decryptSecret(encrypted, secret)).toBe('gho_example_token');
  });

  it('produces different ciphertext for the same input (random IV)', () => {
    const a = encryptSecret('same', secret);
    const b = encryptSecret('same', secret);
    expect(a).not.toBe(b);
  });

  it('fails with the wrong secret', () => {
    const encrypted = encryptSecret('secret-token', secret);
    expect(() => decryptSecret(encrypted, 'wrong-secret')).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptSecret('not-valid', secret)).toThrow();
  });
});
