import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isMockMode } from '../../lib/supabase';

interface Turnstile {
  render(element: HTMLElement, options: { sitekey: string; theme: string }): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }

export function isCaptchaBypassAllowed(hostname: string, requested: boolean): boolean {
  return requested && hostname.endsWith('.vercel.app') && hostname !== 'qualitrack.vercel.app';
}

let loader: Promise<void> | undefined;
function loadWidget(): Promise<void> {
  return loader ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loader = undefined; script.remove(); reject(new Error('Captcha indisponível')); };
    document.head.appendChild(script);
  });
}
export function ProtectedAuthForm({ onSubmit, children, className }: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  // O bypass exige duas travas: flag compilada apenas na branch de testes e
  // hostname de preview. Builds da main/producao nunca recebem essa flag.
  const isTestPreview = typeof window !== 'undefined' && isCaptchaBypassAllowed(
    window.location.hostname,
    import.meta.env.VITE_TEST_CAPTCHA_BYPASS === 'true',
  );

  const sitekey = isTestPreview
    ? '1x00000000000000000000AA' // Cloudflare Turnstile Always Passes dummy key
    : import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (isMockMode || !sitekey) return;
    let cancelled = false;
    void loadWidget().then(() => {
      if (!cancelled && element.current && window.turnstile) widget.current = window.turnstile.render(element.current, { sitekey, theme: 'auto' });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (widget.current) window.turnstile?.remove(widget.current); widget.current = undefined; };
  }, [sitekey]);
  return <form className={className} onSubmit={async event => {
    event.preventDefault();
    try { await onSubmit(event); } finally { if (widget.current) window.turnstile?.reset(widget.current); }
  }}>
    {children}
    {!isMockMode && (
      <div className="flex w-full justify-center">
        <div ref={element} />
      </div>
    )}
    {!isMockMode && (!sitekey || failed) && !isTestPreview && (
      <p className="text-center" role="alert">
        Verificação de segurança indisponível. Contate o administrador.
      </p>
    )}
  </form>;
}

export function readCaptchaToken(event: FormEvent): string {
  const form = event.currentTarget as HTMLFormElement;
  const token = new FormData(form).get('cf-turnstile-response');

  const isTestPreview = typeof window !== 'undefined' && isCaptchaBypassAllowed(
    window.location.hostname,
    import.meta.env.VITE_TEST_CAPTCHA_BYPASS === 'true',
  );

  if (typeof token !== 'string' || !token) {
    if (isTestPreview) {
      // Em preview, se o widget não tiver emitido token, devolve um token de teste
      return 'preview_turnstile_test_token';
    }
    throw new Error('Confirme a verificação de segurança.');
  }
  return token;
}
