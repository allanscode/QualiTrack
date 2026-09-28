import { describe, expect, it } from 'vitest';
import { canAccessApp } from './accessPolicy';

describe('temporary access policy', () => {
  it('holds agent access while preserving manager and quality access', () => {
    expect(canAccessApp('suporte')).toBe(false);
    expect(canAccessApp('gestor_suporte')).toBe(true);
    expect(canAccessApp('gestor_qualidade')).toBe(true);
    expect(canAccessApp('qualidade')).toBe(true);
    expect(canAccessApp('admin')).toBe(true);
  });
});
