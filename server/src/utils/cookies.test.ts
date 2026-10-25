import {
  parseCookies,
  signValue,
  unsignValue,
} from './cookies';

describe('parseCookies', () => {
  it('parses a simple cookie header', () => {
    expect(parseCookies('a=1; b=two')).toEqual({ a: '1', b: 'two' });
  });

  it('decodes percent-encoded values', () => {
    expect(parseCookies('session=id%2Esig')).toEqual({ session: 'id.sig' });
  });

  it('tolerates malformed percent-encoding', () => {
    expect(parseCookies('bad=%E0%A4%A')).toEqual({ bad: '%E0%A4%A' });
  });

  it('returns an empty object for a missing header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('signValue / unsignValue', () => {
  const secret = 'test-secret';

  it('round-trips a value', () => {
    const signed = signValue('abc123', secret);
    expect(unsignValue(signed, secret)).toBe('abc123');
  });

  it('rejects a tampered value', () => {
    const signed = signValue('abc123', secret);
    const tampered = signed.replace('abc123', 'abc124');
    expect(unsignValue(tampered, secret)).toBeNull();
  });

  it('rejects the wrong secret', () => {
    const signed = signValue('abc123', secret);
    expect(unsignValue(signed, 'other-secret')).toBeNull();
  });

  it('rejects a value without a signature', () => {
    expect(unsignValue('nosig', secret)).toBeNull();
  });
});
