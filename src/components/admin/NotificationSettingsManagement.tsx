import { useEffect, useMemo, useState } from 'react';
import { Bell, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '../../types';
import {
  NOTIFICATION_KINDS, fetchNotificationPreferences, saveNotificationPreference,
  type NotificationKind, type NotificationPreferences,
} from '../../lib/notificationPreferences';

interface Props {
  users: User[];
  currentUser: User;
}

export default function NotificationSettingsManagement({ users, currentUser }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(currentUser.id);
  const [preferences, setPreferences] = useState<NotificationPreferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<NotificationKind | null>(null);
  const selected = users.find(user => user.id === selectedId) || currentUser;
  const filteredUsers = useMemo(() => users
    .filter(user => `${user.name} ${user.email}`.toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [users, search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchNotificationPreferences(selectedId)
      .then(next => { if (active) setPreferences(next); })
      .catch(() => { if (active) toast.error('Não foi possível carregar as notificações deste usuário.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const setEnabled = async (kind: NotificationKind, enabled: boolean) => {
    setSaving(kind);
    try {
      await saveNotificationPreference(selectedId, kind, enabled, currentUser.id);
      setPreferences(previous => ({ ...previous, [kind]: enabled }));
      toast.success('Preferência de notificação salva.');
    } catch {
      toast.error('Não foi possível salvar a preferência.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-brand-accent mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-brand-primary">Notificações por usuário</h2>
            <p className="text-sm text-brand-muted mt-1">
              Escolha os avisos que cada pessoa vê no sino. As tarefas e os prazos continuam funcionando.
              Chamados filhos só geram aviso quando a avaliação pede revisão humana.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(240px,300px)_1fr]">
        <div className="rounded-2xl border border-surface-border bg-surface-card p-4 shadow-premium">
          <label htmlFor="notification-user-search" className="uppercase tracking-widest text-[10px] font-black text-brand-muted">
            Buscar pessoa
          </label>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-brand-muted" />
            <input id="notification-user-search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Nome ou e-mail"
              className="w-full rounded-xl border border-surface-border bg-surface-subtle py-2 pl-9 pr-3 text-sm text-brand-primary" />
          </div>
          <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto" aria-label="Usuários">
            {filteredUsers.map(user => (
              <button key={user.id} type="button" onClick={() => setSelectedId(user.id)}
                aria-pressed={selectedId === user.id}
                className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${selectedId === user.id
                  ? 'bg-brand-accent/10 text-brand-primary'
                  : 'text-brand-muted hover:bg-surface-subtle hover:text-brand-primary'}`}>
                <span className="block truncate text-sm font-semibold">{user.name}</span>
                <span className="block truncate text-xs opacity-75">{user.email}</span>
              </button>
            ))}
            {filteredUsers.length === 0 && <p className="p-3 text-sm text-brand-muted">Nenhuma pessoa encontrada.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
          <div className="mb-4">
            <span className="uppercase tracking-widest text-[10px] font-black text-brand-muted">Avisos recebidos por</span>
            <h3 className="text-base font-bold text-brand-primary">{selected.name}</h3>
            <p className="text-xs text-brand-muted">{selected.email}</p>
          </div>
          {loading ? <p className="text-sm text-brand-muted">Carregando preferências…</p> : (
            <div className="divide-y divide-surface-border">
              {NOTIFICATION_KINDS.map(item => (
                <label key={item.kind} className="flex items-center justify-between gap-4 py-3 cursor-pointer">
                  <span>
                    <span className="block text-sm font-semibold text-brand-primary">{item.label}</span>
                    <span className="block text-xs text-brand-muted">{item.detail}</span>
                  </span>
                  <input type="checkbox" checked={preferences[item.kind] !== false}
                    disabled={saving !== null}
                    onChange={event => { void setEnabled(item.kind, event.target.checked); }}
                    aria-label={`${item.label} para ${selected.name}`}
                    className="h-4 w-4 shrink-0 accent-brand-accent" />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
