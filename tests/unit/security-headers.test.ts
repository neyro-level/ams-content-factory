import { describe, expect, it } from 'vitest';
import nextConfig from '../../apps/web/next.config';
import { securityHeaders } from '../../apps/web/security-headers';

const headers = new Map(securityHeaders.map((header) => [header.key, header.value]));

describe('web security headers', () => {
  it('attaches the policy to every direct web response', async () => {
    const configured = await nextConfig.headers?.();
    expect(configured).toEqual([{ source: '/:path*', headers: securityHeaders }]);
  });

  it('defines the required response policy at the application edge', () => {
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('keeps the practical CSP same-origin and frame/object fail-closed', () => {
    const csp = headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('*');
  });
});
