import type { FormEvent } from 'react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ isMockMode: false }));
import { readCaptchaToken } from './ProtectedAuthForm';
describe('CAPTCHA form token', () => {
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
