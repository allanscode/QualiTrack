import React, { useState, useEffect } from 'react';
import { supabase, mockDb } from '../../lib/supabase';
import { User, Team, AccessRequest } from '../../types';
import { 
  RefreshCw, 
  X, 
  Check, 
  Search, 
  AlertCircle,
  User as UserIcon
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CustomSelect from '../ui/CustomSelect';

interface RequestsManagementProps {
  requests: AccessRequest[];
  users: User[];
  teams: Team[];
  loadData: () => void;
}

export default function RequestsManagement({ requests: initialRequests, teams, loadData }: RequestsManagementProps) {
  const [requests, setRequests] = useState<AccessRequest[]>(initialRequests);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [approvingReq, setApprovingReq] = useState<any>(null);
  const [rejectingReq, setRejectingReq] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveData, setApproveData] = useState<{ name: string, email: string, role: string, team_ids: string[] }>({ name: '', email: '', role: 'suporte', team_ids: [] });
  const [saving, setSaving] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  useEffect(() => { setRequests(initialRequests); }, [initialRequests]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleApprove = async () => {
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (!supabase) {
          const payload = { name: approveData.name, email: approveData.email.toLowerCase(), role: approveData.role, active: true, team_ids: approveData.team_ids || [] };
          await mockDb.update('access_requests', approvingReq.id, { status: 'approved' });
          await mockDb.insert('users', { id: approveData.email, ...payload });
          return;
        }

        await supabase.auth.getSession();
        const userPayload = { name: approveData.name, email: approveData.email.toLowerCase(), role: approveData.role, active: true };

        const operation = (async () => {
          const { error: reqError } = await supabase.from('access_requests').update({ status: 'approved' }).eq('id', approvingReq.id);
          if (reqError) throw reqError;

          const { data, error: funcError } = await supabase.functions.invoke('admin-invite-user', { body: { ...userPayload, team_ids: approveData.team_ids || [] } });
          if (funcError) throw funcError;
          if (data?.success === false) throw new Error(data.details?.message || 'Erro ao convidar usuário');
        })();

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
        await Promise.race([operation, timeoutPromise]);
      } catch (err: any) {
        if (err.message === 'timeout' && retryCount < 2) {
          await new Promise(res => setTimeout(res, 1000 * (retryCount + 1)));
          return executeWithRetry(retryCount + 1);
        }
        throw err;
      }
    };

    try {
      await executeWithRetry();
      toast.success('Solicitação aprovada e e-mail de acesso enviado!');
      setIsApproveModalOpen(false);
      await handleRefresh();
    } catch (e: any) {
      console.error('Erro definitivo ao aprovar solicitação:', e);
      toast.error(e.message === 'timeout' ? 'O servidor não respondeu ao processar o convite. Tente novamente.' : (e.message || 'Não foi possível aprovar a solicitação no momento.'));
    } finally {
      setSaving(false);
    }
  };

  const handleReject = (req: any) => {
    setRejectingReq(req);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Por favor, informe o motivo da rejeição.');
      return;
    }

    setSaving(true);
    try {
      if (!supabase) {
        await mockDb.update('access_requests', rejectingReq.id, { status: 'rejected', rejection_reason: rejectReason });
      } else {
        const { error } = await supabase
          .from('access_requests')
          .update({ status: 'rejected', rejection_reason: rejectReason })
          .eq('id', rejectingReq.id);
        if (error) throw error;

        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            email: rejectingReq.email,
            name: rejectingReq.name,
            type: 'rejection',
            token: rejectReason
          }
        });
        if (emailError) console.error('Failed to send rejection email:', emailError);
      }

      toast.success('Solicitação rejeitada e e-mail enviado.');
      setIsRejectModalOpen(false);
      await handleRefresh();
    } catch (e: any) {
      toast.error('Não foi possível processar a rejeição da solicitação.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = requests.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-6 max-w-4xl w-full">
      <div className="flex items-center gap-3">
        <div className="w-[200px] flex-none">
          <CustomSelect 
            value={statusFilter} 
            onChange={val => setStatusFilter(val as any)} 
            options={[{ value: 'pending', label: 'Pendentes' }, { value: 'approved', label: 'Aprovadas' }, { value: 'rejected', label: 'Rejeitadas' }]} 
          />
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh} 
          disabled={refreshing} 
          icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          className="h-10 rounded-xl px-4 shrink-0"
        >
          {refreshing ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      <div className="flex flex-col gap-3 max-w-4xl w-full">
        {filtered.map(req => {
          return (
            <Card 
              key={req.id} 
              padding="none"
              className={`flex flex-col md:flex-row items-center justify-between gap-4 p-3.5 px-5 border-l-4 ${req.status === 'pending' ? 'border-l-warning' : req.status === 'approved' ? 'border-l-brand-accent' : 'border-l-error'}`}
            >
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="w-10 h-10 rounded-xl bg-surface-bg flex items-center justify-center text-brand-muted shrink-0">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-brand-primary text-sm uppercase tracking-tight truncate">{req.name}</h4>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 truncate">{req.email}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Solicitado em: {new Date(req.created_at).toLocaleDateString()}
                    </span>
                    <span className="bg-slate-900 border border-slate-800 text-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg">
                      Solicitação de Acesso
                    </span>
                  </div>
                </div>
              </div>
              {req.status === 'pending' && (
                <div className="flex items-center gap-3 w-full md:w-auto justify-end shrink-0">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleReject(req)} 
                    className="!text-error hover:!text-red-600 hover:!bg-red-500/10 font-bold h-9 rounded-xl px-4 flex items-center justify-center transition-colors"
                  >
                    Recusar
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => { 
                      setApprovingReq(req); 
                      setApproveData({ name: req.name, email: req.email, role: 'suporte', team_ids: [] }); 
                      setIsApproveModalOpen(true); 
                    }}
                    className="h-9 rounded-xl px-4 flex items-center justify-center"
                  >
                    Revisar e Aprovar
                  </Button>
                </div>
              )}
              {req.status !== 'pending' && (
                <div className="shrink-0 w-full md:w-auto flex justify-end">
                  <Badge variant={req.status === 'approved' ? 'success' : 'error'}>
                    {req.status === 'approved' ? 'Aprovado' : 'Recusado'}
                  </Badge>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="py-20 text-center">
            <p className="text-brand-muted font-bold">Nenhuma solicitação nesta categoria.</p>
          </Card>
        )}
      </div>

      <AnimatePresence>
        {isApproveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-md w-full">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">Aprovar Solicitação</h3>
                <button onClick={() => setIsApproveModalOpen(false)} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
              </header>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 ml-0.5 block">Nome</label>
                    <input type="text" className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm" value={approveData.name} onChange={e => setApproveData({...approveData, name: e.target.value})} />
                  </div>
                  <CustomSelect 
                    label="Perfil" 
                    value={approveData.role} 
                    onChange={val => setApproveData({...approveData, role: val})} 
                    options={[
                      { value: 'admin', label: 'Administrador' }, 
                      { value: 'suporte', label: 'Agente de Atendimento' }, 
                      { value: 'qualidade', label: 'Monitor de Qualidade' }, 
                      { value: 'gestor_suporte', label: 'Supervisor de Atendimento' }, 
                      { value: 'gestor_qualidade', label: 'Supervisor de Qualidade' }
                    ].sort((a, b) => a.label.localeCompare(b.label))} 
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between ml-1 mb-1">
                    <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold ml-0.5">Equipes</label>
                    {teams.length > 8 && (
                      <div className="relative w-32 h-7">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                        <input 
                          type="text" 
                          placeholder="Buscar..." 
                          className="w-full h-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg pl-6 pr-2 text-[10px] font-medium text-slate-900 dark:text-slate-50 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
                          value={teamSearch}
                          onChange={e => setTeamSearch(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-4 bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-xl max-h-40 overflow-y-auto scrollbar-thin">
                    {teams
                      .filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(t => (
                      <label key={t.id} className="flex items-center gap-3 py-1 px-1 cursor-pointer group">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-slate-500/20 focus:ring-offset-0 accent-slate-900 dark:accent-slate-50 transition-all cursor-pointer"
                          checked={approveData.team_ids?.includes(t.id) || false}
                          onChange={e => {
                            const newIds = e.target.checked
                              ? [...(approveData.team_ids || []), t.id]
                              : (approveData.team_ids || []).filter(id => id !== t.id);
                            setApproveData({ ...approveData, team_ids: newIds });
                          }}
                        />
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate">
                          {t.name}
                        </span>
                      </label>
                    ))}
                    {teams.length === 0 && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2 col-span-2 text-center">Nenhuma equipe cadastrada.</p>
                    )}
                    {teams.length > 0 && teams.filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2 col-span-2 text-center">Nenhuma equipe encontrada.</p>
                    )}
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={handleApprove} disabled={saving} icon={<Check className="w-4 h-4" />}>{saving ? 'Processando...' : 'Confirmar Aprovação'}</Button>
              </div>
            </Card>
          </div>
        )}

        {isRejectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-md w-full">
              <header className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-error">
                  <AlertCircle className="w-5 h-5" />
                  <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">Rejeitar Solicitação</h3>
                </div>
                <button onClick={() => setIsRejectModalOpen(false)} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
              </header>
              <div className="space-y-4">
                <p className="text-sm text-brand-muted font-medium">
                  Você está recusando o acesso de <span className="text-brand-primary font-bold">{rejectingReq?.name}</span>.
                  Informe abaixo o motivo da recusa, que será enviado por e-mail para o usuário.
                </p>
                <div className="flex flex-col">
                  <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 ml-0.5 block">Motivo da Rejeição</label>
                  <textarea 
                    className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-50 focus:border-red-500 dark:focus:border-red-500 focus:outline-none focus:ring-0 min-h-[120px] resize-none shadow-sm transition-all"
                    placeholder="Ex: E-mail não corporativo ou setor não autorizado."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsRejectModalOpen(false)}>Cancelar</Button>
                  <Button className="flex-1 bg-error hover:bg-red-700" onClick={confirmReject} disabled={saving}>
                    {saving ? 'Enviando...' : 'Confirmar Recusa'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
