import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import type { User, UserRole } from '../../types';
import { ROLE_LABELS } from '../../types';
import {
  NOTIFICATION_KINDS, fetchRoleNotificationPreferences, saveRoleNotificationPreference,
  type NotificationKind, type NotificationPreferences,
} from '../../lib/notificationPreferences';

interface Props { currentUser: User; }

const ROLES: UserRole[] = ['admin', 'gestor_suporte', 'gestor_qualidade', 'qualidade', 'suporte'];

export default function NotificationSettingsManagement({ currentUser }: Props) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('qualidade');
  const [preferences, setPreferences] = useState<NotificationPreferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<NotificationKind | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchRoleNotificationPreferences(selectedRole)
      .then(next => { if (active) setPreferences(next); })
      .catch(() => { if (active) toast.error('Não foi possível carregar as notificações deste cargo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedRole]);

  const setEnabled = async (kind: NotificationKind, enabled: boolean) => {
    setSaving(kind);
    try {
      await saveRoleNotificationPreference(selectedRole, kind, enabled, currentUser.id);
      setPreferences(previous => ({ ...previous, [kind]: enabled }));
      toast.success('Preferência de notificação salva para o cargo.');
    } catch {
      toast.error('Não foi possível salvar a preferência.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 text-brand-accent" />
          <div>
            <h2 className="text-lg font-bold text-brand-primary">Notificações por cargo</h2>
            <p className="mt-1 text-sm text-brand-muted">Cada configuração vale para todas as pessoas com o cargo selecionado. As tarefas e os prazos continuam funcionando; chamados filhos só geram aviso quando pedem revisão humana.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        <label htmlFor="notification-role" className="block max-w-sm text-[10px] font-black uppercase tracking-widest text-brand-muted">
          Configurar avisos para o cargo
          <select id="notification-role" value={selectedRole} onChange={event => setSelectedRole(event.target.value as UserRole)}
            className="mt-2 w-full rounded-xl border border-surface-border bg-surface-subtle px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-brand-primary">
            {ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </label>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        <div className="mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Avisos recebidos por todas as pessoas com o cargo</span>
          <h3 className="mt-1 text-base font-bold text-brand-primary">{ROLE_LABELS[selectedRole]}</h3>
        </div>
        {loading ? <p className="text-sm text-brand-muted">Carregando preferências…</p> : (
          <div className="divide-y divide-surface-border">
            {NOTIFICATION_KINDS.map(item => (
              <label key={item.kind} className="flex cursor-pointer items-center justify-between gap-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-brand-primary">{item.label}</span>
                  <span className="block text-xs text-brand-muted">{item.detail}</span>
                </span>
                <input type="checkbox" checked={preferences[item.kind] !== false}
                  disabled={saving !== null}
                  onChange={event => { void setEnabled(item.kind, event.target.checked); }}
                  aria-label={`${item.label} para ${ROLE_LABELS[selectedRole]}`}
                  className="h-4 w-4 shrink-0 accent-brand-accent" />
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
