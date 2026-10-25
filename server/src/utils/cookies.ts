import crypto from 'crypto';
import { Request, Response } from 'express';

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      // Ignore malformed percent-encoding rather than failing the request.
      cookies[key] = rawValue;
    }
  }

  return cookies;
}

export function signValue(value: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url');
  return `${value}.${signature}`;
}

export function unsignValue(signed: string, secret: string): string | null {
  const separatorIndex = signed.lastIndexOf('.');
  if (separatorIndex === -1) {
    return null;
  }

  const value = signed.slice(0, separatorIndex);
  const provided = signed.slice(separatorIndex + 1);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url');

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  return value;
}

export function getCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  maxAgeMs?: number;
  path?: string;
};

export function setCookie(
  res: Response,
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  parts.push(`Path=${options.path ?? '/'}`);

  if (options.maxAgeMs !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAgeMs / 1000)}`);
  }

  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  parts.push(`SameSite=${options.sameSite ?? 'lax'}`);

  res.append('Set-Cookie', parts.join('; '));
}

/** Clear a cookie. Pass the same secure/sameSite/path used when setting it. */
export function clearCookie(
  res: Response,
  name: string,
  options: CookieOptions = {}
): void {
  setCookie(res, name, '', { ...options, maxAgeMs: 0 });
}
