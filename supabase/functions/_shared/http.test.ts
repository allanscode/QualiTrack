import { describe, it, expect } from 'vitest';
import { corsFor, configuredOrigin, rejectRequest, escapeHtml } from './http';
describe('Edge request boundary', () => {
  const headers = corsFor('https://quality.example.com');
  it('fails closed for missing or non-HTTPS configuration', () => {
    expect(() => corsFor(undefined)).toThrow();
    expect(() => corsFor('http://quality.example.com')).toThrow();
    expect(configuredOrigin('http://localhost:3001')).toBe('http://localhost:3001');
  });
  it('rejects another origin, including a lookalike domain', () => {
    expect(rejectRequest(new Request('https://api.example.com', { method: 'POST', headers: { Origin: 'https://quality.example.com.evil.test' } }), headers)?.status).toBe(403);
  });
  it('accepts the configured origin and server clients; auth is enforced separately', () => {
    expect(rejectRequest(new Request('https://api.example.com', { method: 'POST', headers: { Origin: 'https://quality.example.com' } }), headers)).toBeNull();
    expect(rejectRequest(new Request('https://api.example.com', { method: 'POST' }), headers)).toBeNull();
  });
  it('rejects unsupported methods', () => {
    expect(rejectRequest(new Request('https://api.example.com'), headers)?.status).toBe(405);
  });
  it('escapes untrusted email text', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">&')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;');
  });
});
