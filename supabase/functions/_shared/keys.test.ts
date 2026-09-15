import { describe, it, expect } from 'vitest';
import { resolveApiKey } from './keys';
describe('Supabase key portability', () => {
  it('prefers the default new key and supports legacy-only projects', () => {
    expect(resolveApiKey('legacy', '{"default":"public-new"}')).toBe('public-new');
    expect(resolveApiKey('legacy', undefined)).toBe('legacy');
  });
  it('fails closed without a configured default key', () => {
    expect(() => resolveApiKey(undefined, '{"unrelated":"key"}')).toThrow();
    expect(() => resolveApiKey(undefined, undefined)).toThrow();
  });
  it('does not expose key material when configuration JSON is invalid', () => {
    expect(() => resolveApiKey(undefined, 'private-value')).toThrow('Mapa de chaves Supabase inválido');
  });
});
