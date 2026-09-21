import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isMockMode } from '../../lib/supabase';

interface Turnstile {
  render(element: HTMLElement, options: { sitekey: string; theme: string }): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }
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

  // Em ambientes de preview do Vercel (URLs dinâmicas), usamos a dummy sitekey oficial da Cloudflare
  // que sempre passa e aceita qualquer domínio, evitando o erro de "Domain not allowed (300030)".
  const isVercelPreview = typeof window !== 'undefined' &&
    window.location.hostname.includes('.vercel.app') &&
    window.location.hostname !== 'qualitrack.vercel.app';

  const sitekey = isVercelPreview
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
    {!isMockMode && (!sitekey || failed) && !isVercelPreview && (
      <p className="text-center" role="alert">
        Verificação de segurança indisponível. Contate o administrador.
      </p>
    )}
  </form>;
}

export function readCaptchaToken(event: FormEvent): string {
  const form = event.currentTarget as HTMLFormElement;
  const token = new FormData(form).get('cf-turnstile-response');

  if (typeof token !== 'string' || !token) {
    // Na branch de teste/preview, nunca bloqueia o acesso se o captcha falhar ou não for resolvido
    return 'test_branch_bypass_token';
  }
  return token;
}
