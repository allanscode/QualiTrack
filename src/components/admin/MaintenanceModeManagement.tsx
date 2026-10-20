import { useEffect, useState } from 'react';
import { Clock3, ShieldAlert, Save, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, mockDb } from '../../lib/supabase';
import { ROLE_LABELS, type User, type UserRole } from '../../types';

type Settings = { enabled: boolean; blocked_roles: UserRole[]; expected_duration_minutes: number; expected_return_at: string | null };
const BLOCKABLE_ROLES: UserRole[] = ['gestor_suporte', 'gestor_qualidade', 'qualidade', 'suporte'];
const DURATIONS = [{ minutes: 30, label: '30 minutos' }, { minutes: 60, label: '1 hora' }, { minutes: 120, label: '2 horas' }, { minutes: 180, label: '3 horas' }, { minutes: 240, label: '4 horas' }, { minutes: 480, label: '8 horas' }, { minutes: 1440, label: '24 horas' }];
const DEFAULT_SETTINGS: Settings = { enabled: false, blocked_roles: [], expected_duration_minutes: 60, expected_return_at: null };

export default function MaintenanceModeManagement({ currentUser }: { currentUser: User }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        let row: Partial<Settings> | null = null;
        if (!supabase) {
          const { data, error } = await mockDb.get('system_maintenance');
          if (error) throw error;
          row = data?.[0] ?? null;
        } else {
          const { data, error } = await supabase.from('system_maintenance').select('enabled, blocked_roles, expected_duration_minutes, expected_return_at').eq('id', 1).maybeSingle();
          if (error) throw error;
          row = data;
        }
        if (mounted && row) setSettings({ ...DEFAULT_SETTINGS, ...row, blocked_roles: (row.blocked_roles ?? []) as UserRole[] });
      } catch {
        if (mounted) toast.error('Não foi possível carregar o modo de manutenção.');
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const toggleRole = (role: UserRole) => setSettings(current => ({
    ...current,
    blocked_roles: current.blocked_roles.includes(role)
      ? current.blocked_roles.filter(item => item !== role)
      : [...current.blocked_roles, role],
  }));

  const save = async () => {
    setSaving(true);
    try {
      const enabled = settings.enabled && settings.blocked_roles.length > 0;
      const next: Settings = {
        ...settings,
        enabled,
        expected_return_at: enabled ? new Date(Date.now() + settings.expected_duration_minutes * 60_000).toISOString() : null,
      };
      if (!enabled && settings.enabled && settings.blocked_roles.length === 0) {
        toast.error('Selecione ao menos um cargo para ativar a manutenção.');
        return;
      }
      if (!supabase) {
        const { error } = await mockDb.upsert('system_maintenance', { id: '1', ...next, updated_by: currentUser.id }, 'id');
        if (error) throw error;
      } else {
        const { error } = await supabase.from('system_maintenance').upsert({ id: 1, ...next, updated_by: currentUser.id }, { onConflict: 'id' });
        if (error) throw error;
      }
      setSettings(next);
      toast.success(enabled ? 'Modo de manutenção ativado.' : 'Modo de manutenção desativado.');
    } catch {
      toast.error('Não foi possível salvar o modo de manutenção.');
    } finally { setSaving(false); }
  };

  const effectiveActive = settings.enabled && (!settings.expected_return_at || new Date(settings.expected_return_at).getTime() > Date.now());
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        <div className="flex items-start gap-3">
          <Wrench className="mt-0.5 h-5 w-5 text-brand-accent" />
          <div><h2 className="text-lg font-bold text-brand-primary">Modo de manutenção</h2>
            <p className="mt-1 text-sm text-brand-muted">Bloqueie o acesso de cargos selecionados após o login. A liberação acontece automaticamente no horário previsto.</p></div>
        </div>
        <div className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${effectiveActive ? 'border-amber-500/30 bg-amber-500/10 text-amber-600' : 'border-surface-border bg-surface-subtle text-brand-muted'}`}>
          <ShieldAlert className="h-4 w-4" /> {effectiveActive ? `Ativo · previsão ${settings.expected_return_at ? new Date(settings.expected_return_at).toLocaleString('pt-BR') : 'não definida'}` : 'Desativado'}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        {loading ? <p className="text-sm text-brand-muted">Carregando configuração...</p> : <>
          <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-surface-border pb-4">
            <span><span className="block text-sm font-bold text-brand-primary">Ativar manutenção</span><span className="block text-xs text-brand-muted">Administradores continuam com acesso para alterar esta configuração.</span></span>
            <input type="checkbox" checked={settings.enabled} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} className="h-5 w-5 accent-brand-accent" aria-label="Ativar modo de manutenção" />
          </label>
          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-black uppercase tracking-wider text-brand-muted">Cargos bloqueados</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {BLOCKABLE_ROLES.map(role => <label key={role} className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5 text-sm text-brand-primary hover:bg-surface-subtle">
                <input type="checkbox" checked={settings.blocked_roles.includes(role)} onChange={() => toggleRole(role)} className="h-4 w-4 accent-brand-accent" /> {ROLE_LABELS[role]}
              </label>)}
            </div>
          </fieldset>
          <label className="mt-5 block max-w-sm text-xs font-black uppercase tracking-wider text-brand-muted" htmlFor="maintenance-duration">Previsão para retorno
            <span className="relative mt-2 block"><Clock3 className="absolute left-3 top-2.5 h-4 w-4" />
              <select id="maintenance-duration" value={settings.expected_duration_minutes} onChange={event => setSettings(current => ({ ...current, expected_duration_minutes: Number(event.target.value) }))} className="w-full rounded-xl border border-surface-border bg-surface-subtle py-2.5 pl-10 pr-3 text-sm font-semibold normal-case tracking-normal text-brand-primary">
                {DURATIONS.map(item => <option key={item.minutes} value={item.minutes}>{item.label}</option>)}
              </select>
            </span>
          </label>
          <button type="button" disabled={loading || saving} onClick={() => void save()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-accent px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar configuração'}</button>
        </>}
      </section>
    </div>
  );
}
