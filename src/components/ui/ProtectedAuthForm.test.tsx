import type { FormEvent } from 'react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ isMockMode: false }));
import { isCaptchaBypassAllowed, readCaptchaToken } from './ProtectedAuthForm';
describe('CAPTCHA form token', () => {
  it('allows bypass only when explicitly requested on a non-production Vercel hostname', () => {
    expect(isCaptchaBypassAllowed('qualitrack-develop-example.vercel.app', true)).toBe(true);
    expect(isCaptchaBypassAllowed('qualitrack-develop-example.vercel.app', false)).toBe(false);
    expect(isCaptchaBypassAllowed('qualitrack.vercel.app', true)).toBe(false);
    expect(isCaptchaBypassAllowed('qualitrack.com.br', true)).toBe(false);
  });
  it('fails before requesting authentication when the challenge is missing', () => {
    const currentTarget = document.createElement('form');
    expect(() => readCaptchaToken({ currentTarget } as unknown as FormEvent)).toThrow('Confirme');
  });
  it('reads the widget response from the submitted form', () => {
    const currentTarget = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'cf-turnstile-response';
    input.value = 'single-use-test-response';
    currentTarget.append(input);
    expect(readCaptchaToken({ currentTarget } as unknown as FormEvent)).toBe('single-use-test-response');
  });
});
