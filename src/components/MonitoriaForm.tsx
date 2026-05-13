import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { EvaluationForm, User, Team, MonitoriaHistoryEntry, Monitoria, MonitoriaStatus } from '../types';
import { 
  ChevronRight, 
  ChevronLeft, 
  Save, 
  X, 
  AlertOctagon, 
  Info, 
  CheckCircle2, 
  MessageSquare, 
  Hash,
  Clock,
  User as UserIcon,
  Tag,
  Calendar,
  AlertTriangle,
  History,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { addBusinessHours } from '../lib/businessHours';
import { useQualityConfig } from '../lib/useQualityConfig';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Select from './ui/Select';
import CustomSelect from './ui/CustomSelect';

const CHANNELS = ['Chat', 'Email', 'Telefone', 'WhatsApp'] as const;

export default function MonitoriaForm({ 
  user, 
  onCancel, 
  onSaved,
  initialData 
}: { 
  user: User | null; 
  onCancel: () => void; 
  onSaved: () => void;
  initialData?: Monitoria;
}) {
  const { config: qualityConfig, getLevelForScore, isAboveTarget } = useQualityConfig();
  const isAdmin = user?.role === 'admin';
  const isViewOnly = !!initialData && !(initialData as any)?._reevaluate && !(initialData as any)?._adminEdit;
  const isReevaluating = !!(initialData as any)?._reevaluate;
  const isAdminEdit = !!(initialData as any)?._adminEdit;
  
  const [step, setStep] = useState(1);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const [header, setHeader] = useState({
    form_id: initialData?.form_id || '',
    evaluated_id: initialData?.evaluated_id || '',
    team_id: initialData?.team_id || '',
    ticket_id: initialData?.ticket_id || '',
    channel: (initialData?.channel as any) || 'Chat',
    ticket_date: initialData?.ticket_date || today,
    analysis_date: initialData?.analysis_date || today,
    satisfaction_result: (initialData?.satisfaction_result as any) || '',
    satisfaction_has_record: initialData?.satisfaction_has_record || false,
    satisfaction_record_text: initialData?.satisfaction_record_text || '',
    evaluator_note: initialData?.evaluator_note || '',
    client_contact_log: initialData?.client_contact_log || '',
    client_contact_success: initialData?.client_contact_success || false,
    reevaluation_justification: '',
  });

  const [scores, setScores] = useState<Record<string, 'SIM' | 'NAO' | 'NA'>>(initialData?.answers || {});
  const [observations, setObservations] = useState<Record<string, string>>(initialData?.question_observations || {});
  const [criticalErrorObservations, setCriticalErrorObservations] = useState<Record<string, string>>(initialData?.critical_error_observations || {});
  const [criticalErrors, setCriticalErrors] = useState<Record<string, boolean>>(
    (initialData?.selected_critical_errors || []).reduce((acc: any, id: string) => ({ ...acc, [id]: true }), {})
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!supabase) {
          const [fRes, aRes, tRes] = await Promise.all([
            mockDb.get('forms'),
            mockDb.get('users'),
            mockDb.get('teams')
          ]);
          setForms((fRes.data || []).filter((f: any) => f.active !== false));
          const usersList = (aRes.data || []) as User[];
          setAllUsers(usersList);
          setAgents(usersList.filter((u: User) => u.role === 'suporte' && u.active !== false));
          setTeams((tRes.data || []).filter((t: any) => t.active !== false));
        } else {
          const [{ data: fData }, { data: aData }, { data: tData }] = await Promise.all([
            supabase.from('forms').select('*').eq('active', true),
            supabase.from('users').select('*'), // Fetch all for history/anonymity
            supabase.from('teams').select('*').eq('active', true),
          ]);
          setForms(fData || []);
          const usersList = (aData || []) as User[];
          setAllUsers(usersList);
          setAgents(usersList.filter(u => u.role === 'suporte' && u.active === true));
          setTeams(tData || []);
        }
      } catch (e) { console.error('Erro ao carregar dados:', e); }
    };
    loadData();
  }, []);

  const selectedForm = forms.find(f => f.id === header.form_id);

  const calculateScore = () => {
    // 1. Check for any failed critical questions (from the new system)
    let anyCriticalFailed = false;
    selectedForm?.sections?.forEach(s => {
      s.questions.forEach(q => {
        if (q.is_critical && scores[q.id] === 'NAO') anyCriticalFailed = true;
      });
    });
    
    // 2. Check for any checked items in the old critical errors list
    if (Object.values(criticalErrors).some(v => v)) anyCriticalFailed = true;

    if (anyCriticalFailed) return 0;
    if (!selectedForm?.sections?.length) return 0;

    let totalScore = 100;
    
    selectedForm.sections.forEach(s => {
      const sectionWeight = s.weight || 0;
      // We only consider questions that are NOT 'NA'
      const activeQuestions = s.questions.filter(q => scores[q.id] !== 'NA');
      
      if (activeQuestions.length === 0) {
        // If all questions in a section are NA, that section doesn't subtract anything from the 100.
        // This is equivalent to redistributing the weight to the rest of the form.
        return;
      }
      
      const weightPerQuestion = sectionWeight / activeQuestions.length;
      activeQuestions.forEach(q => {
        if (scores[q.id] === 'NAO') {
          totalScore -= weightPerQuestion;
        }
      });
    });
    
    return Math.max(0, Number(totalScore.toFixed(2)));
  };

  const score = calculateScore();
  const isAllAnswered = () => {
    if (!selectedForm) return false;
    return selectedForm.sections.every(s => 
      s.questions.every(q => !!scores[q.id])
    );
  };

  const validateStep = (s: number) => {
    if (s === 1) {
      if (!header.form_id || !header.evaluated_id || !header.team_id || !header.ticket_id || !header.ticket_date || !header.channel) {
        toast.error('Preencha todos os campos obrigatórios da Identificação.');
        return false;
      }
    }
    if (s === 2) {
      if (!header.satisfaction_result) {
        toast.error('Selecione o resultado da pesquisa de satisfação.');
        return false;
      }
      if (header.satisfaction_result !== 'Sem pesquisa') {
        if (header.satisfaction_has_record && !header.satisfaction_record_text.trim()) {
          toast.error('Informe o registro deixado pelo cliente.');
          return false;
        }
        if (header.satisfaction_result === 'Negativa' && !header.client_contact_log.trim()) {
          toast.error('Informe o registro de contato para a pesquisa negativa.');
          return false;
        }
      }
    }
    if (s === 3) {
      if (!isAllAnswered()) {
        toast.error('Responda todos os itens da avaliação antes de prosseguir.');
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!user) return;
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    if (isReevaluating && !header.reevaluation_justification.trim()) {
      toast.error('Informe a justificativa da reavaliação.');
      return;
    }
    
    setSaving(true);
    try {
      const nowTs = new Date().toISOString();
      const scoreNote = isReevaluating ? `[DE ${initialData?.score}% PARA ${score}%] ` : '';
      let historyNote = isReevaluating ? `${scoreNote}${header.reevaluation_justification}` : undefined;
      
      if (isAdminEdit && initialData) {
        const changes: string[] = [];
        if (header.ticket_id !== initialData.ticket_id) changes.push(`Ticket: ${initialData.ticket_id} → ${header.ticket_id}`);
        if (header.ticket_date !== initialData.ticket_date) changes.push(`Data do ticket: ${initialData.ticket_date} → ${header.ticket_date}`);
        if (score !== initialData.score) changes.push(`Score: ${initialData.score}% → ${score}%`);
        historyNote = changes.length > 0 ? changes.join(' | ') : 'Edição administrativa';
      }

      const historyEntry: MonitoriaHistoryEntry = { 
        action: isAdminEdit ? 'Edição pelo Administrador' : (isReevaluating ? 'Monitoria Reavaliada' : 'Monitoria Criada'), 
        by_id: user.id, 
        by_name: user.name, 
        at: nowTs,
        note: historyNote
      };
      
      const getDeadline = () => {
        const now = new Date();
        const sla = qualityConfig.sla;
        const bh = qualityConfig.businessHours;
        if (isReevaluating) return addBusinessHours(now, sla?.auditorReevaluation || 25, bh).toISOString();
        return addBusinessHours(now, sla?.agentReview || 50, bh).toISOString();
      };

      const payload = {
        form_id: header.form_id,
        evaluator_id: initialData?.evaluator_id || user.id,
        evaluated_id: header.evaluated_id,
        team_id: header.team_id || null,
        ticket_id: header.ticket_id,
        channel: header.channel,
        ticket_date: header.ticket_date,
        analysis_date: header.analysis_date,
        satisfaction_result: header.satisfaction_result || null,
        satisfaction_has_record: header.satisfaction_has_record,
        satisfaction_record_text: header.satisfaction_record_text,
        answers: scores,
        question_observations: observations,
        critical_error_observations: criticalErrorObservations,
        selected_critical_errors: Object.keys(criticalErrors).filter(id => criticalErrors[id]),
        score,
        status: isAdminEdit ? (initialData?.status || 'pendente_revisao') : (isReevaluating ? 'pendente_revisao' : (initialData?.status || 'pendente_revisao')),
        evaluator_note: header.evaluator_note,
        client_contact_log: header.client_contact_log,
        client_contact_success: header.client_contact_success,
        active: true,
        history: [...(initialData?.history || []), historyEntry],
        deadline_at: (initialData?.deadline_at && !isReevaluating && !isAdminEdit) ? initialData.deadline_at : getDeadline(),
        updated_at: nowTs,
      };

      if (!supabase) {
        if (initialData?.id) await mockDb.update('monitorias', initialData.id, payload);
        else await mockDb.insert('monitorias', payload);
      } else {
        if (initialData?.id) await supabase.from('monitorias').update(payload).eq('id', initialData.id);
        else await supabase.from('monitorias').insert([payload]);
      }
      toast.success('Monitoria salva com sucesso!');
      onSaved();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        className="bg-surface-bg rounded-[32px] shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden" 
        style={{ height: '92vh' }}
      >
        {/* Top Header */}
        <div className="p-6 border-b border-surface-border flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-subtle flex items-center justify-center text-brand-primary">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-brand-primary tracking-tight uppercase">
                {isViewOnly ? 'Visualizar' : isAdminEdit ? 'Editar (Admin)' : isReevaluating ? 'Reavaliar' : 'Nova'} Monitoria
              </h2>
              {initialData?.display_id && <Badge variant="info" className="mt-1">Mon: {initialData.display_id}</Badge>}
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-surface-subtle rounded-xl transition-all text-brand-muted"><X className="w-6 h-6" /></button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar">
          {/* Stepper Progress */}
          <div className="flex items-center justify-center gap-6 md:gap-10">
            {[
              { n: 1, label: 'Identificação' },
              { n: 2, label: 'Pesquisa' },
              { n: 3, label: 'Avaliação' },
              { n: 4, label: 'Registro/Log' }
            ].map(s => (
              <div key={s.n} className="flex flex-col items-center gap-2 group">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black transition-all ${step >= s.n ? 'bg-brand-primary text-white' : 'bg-surface-subtle text-brand-muted'}`}>
                  {s.n}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${step >= s.n ? 'text-brand-primary' : 'text-brand-muted hidden md:block'}`}>{s.label}</span>
              </div>
            ))}
          </div>

          {step === 1 && (
            <section className="animate-fade-in space-y-8 max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <h3 className="text-xl font-black text-brand-primary uppercase tracking-tight">Dados da Avaliação</h3>
                <p className="text-xs font-bold text-brand-muted uppercase tracking-widest mt-1">Preencha as informações básicas do ticket</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Ficha de Avaliação *</label>
                  <CustomSelect 
                    value={header.form_id} 
                    onChange={val => setHeader({...header, form_id: val})} 
                    options={[{ value: '', label: 'Selecione a ficha...' }, ...forms.map(f => ({ value: f.id, label: f.title }))]}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Suporte *</label>
                  <CustomSelect 
                    value={header.evaluated_id} 
                    onChange={val => setHeader({...header, evaluated_id: val})} 
                    options={[{ value: '', label: 'Selecione o colaborador...' }, ...agents.map(a => ({ value: a.id, label: a.name }))]}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Equipe *</label>
                  <CustomSelect 
                    value={header.team_id} 
                    onChange={val => setHeader({...header, team_id: val})} 
                    options={[{ value: '', label: 'Selecione a equipe...' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Número do Ticket *</label>
                  <div className="relative">
                    <Hash className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted/50" />
                    <input 
                      type="text" 
                      value={header.ticket_id} 
                      onChange={e => setHeader({...header, ticket_id: e.target.value})} 
                      disabled={isViewOnly || isReevaluating} 
                      className="w-full bg-white border border-surface-border rounded-2xl pl-11 pr-4 h-10 text-xs font-bold text-brand-primary placeholder:text-brand-muted/40 focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all outline-none" 
                      placeholder="Digite o número do ticket" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Canal *</label>
                  <CustomSelect 
                    value={header.channel} 
                    onChange={val => setHeader({...header, channel: val as any})} 
                    options={CHANNELS.map(c => ({ value: c, label: c }))}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Data do Ticket *</label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted/50" />
                    <input 
                      type="date" 
                      value={header.ticket_date} 
                      onChange={e => setHeader({...header, ticket_date: e.target.value})} 
                      disabled={isViewOnly} 
                      className="w-full bg-white border border-surface-border rounded-2xl pl-11 pr-4 h-10 text-xs font-bold text-brand-primary focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all outline-none" 
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 text-center block">Data Atual (Análise)</label>
                  <div className="bg-brand-subtle/30 rounded-2xl py-3 text-center border border-brand-subtle">
                    <span className="text-xs font-black text-brand-primary uppercase tracking-widest">
                      {header.analysis_date.split('-').reverse().join('/')}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="animate-fade-in space-y-10 max-w-4xl mx-auto">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-brand-muted tracking-widest ml-1 text-center">Pesquisa de Satisfação</p>
                <div className="grid grid-cols-3 gap-4">
                  {(['Positiva', 'Negativa', 'Sem pesquisa'] as const).map(opt => (
                    <button 
                      key={opt} 
                      onClick={() => !isViewOnly && !isReevaluating && setHeader({...header, satisfaction_result: opt})} 
                      className={`p-6 rounded-[24px] border-2 flex flex-col items-center gap-3 transition-all ${header.satisfaction_result === opt ? 'bg-brand-primary border-brand-primary text-white shadow-premium' : 'bg-white border-surface-border text-brand-muted hover:border-brand-highlight'}`} 
                      disabled={isViewOnly || isReevaluating}
                    >
                      <span className="text-sm font-black uppercase tracking-tight">{opt}</span>
                    </button>
                  ))}
                </div>
              </div>

              {header.satisfaction_result && header.satisfaction_result !== 'Sem pesquisa' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  <Card className="bg-white p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-brand-primary">O cliente deixou algum registro (elogio/reclamação)?</p>
                      <div className="flex gap-2 bg-surface-bg p-1 rounded-xl border border-surface-border">
                        {[true, false].map(v => (
                          <button key={v ? 'y' : 'n'} onClick={() => !isViewOnly && setHeader({...header, satisfaction_has_record: v})} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${header.satisfaction_has_record === v ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-muted hover:bg-white'}`} disabled={isViewOnly}>{v ? 'SIM' : 'NÃO'}</button>
                        ))}
                      </div>
                    </div>

                    {header.satisfaction_has_record && (
                      <div className="space-y-2 animate-fade-in">
                        <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Registro do Cliente</label>
                        <textarea 
                          value={header.satisfaction_record_text} 
                          onChange={e => setHeader({...header, satisfaction_record_text: e.target.value})} 
                          disabled={isViewOnly}
                          className="w-full bg-surface-bg border border-surface-border rounded-2xl p-4 text-sm font-medium min-h-[100px] focus:border-brand-accent focus:outline-none" 
                          placeholder="Transcreva aqui o comentário do cliente..."
                        />
                      </div>
                    )}
                  </Card>

                  {header.satisfaction_result === 'Negativa' && (
                    <Card className="bg-red-50/30 border-red-100 p-8 space-y-6">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-error">Conseguimos contato com o cliente?</p>
                        <div className="flex gap-2 bg-white p-1 rounded-xl border border-red-100">
                          {[true, false].map(v => (
                            <button key={v ? 'y' : 'n'} onClick={() => !isViewOnly && setHeader({...header, client_contact_success: v})} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${header.client_contact_success === v ? 'bg-error text-white shadow-sm' : 'text-brand-muted hover:bg-red-50'}`} disabled={isViewOnly}>{v ? 'SIM' : 'NÃO'}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Registro de Contato/Tentativa</label>
                        <textarea 
                          value={header.client_contact_log} 
                          onChange={e => setHeader({...header, client_contact_log: e.target.value})} 
                          disabled={isViewOnly}
                          className="w-full bg-white border border-red-100 rounded-2xl p-4 text-sm font-medium min-h-[100px] focus:border-error focus:outline-none" 
                          placeholder="Descreva como foi o contato ou o motivo do insucesso..."
                        />
                      </div>
                    </Card>
                  )}
                </motion.div>
              )}
            </section>
          )}

          {step === 3 && selectedForm && (
            <section className="space-y-10 animate-fade-in max-w-4xl mx-auto">
              {(() => {
                const level = getLevelForScore(score);
                const isTarget = isAboveTarget(score);
                
                // Mapeamento para cores sólidas vibrantes baseadas na configuração
                const getSolidBg = (textColor: string) => {
                  if (textColor.includes('indigo')) return 'bg-indigo-600';
                  if (textColor.includes('emerald')) return 'bg-emerald-600';
                  if (textColor.includes('amber')) return 'bg-amber-500';
                  if (textColor.includes('red')) return 'bg-red-600';
                  if (textColor.includes('purple')) return 'bg-purple-600';
                  if (textColor.includes('blue')) return 'bg-blue-600';
                  return 'bg-brand-primary';
                };

                return (
                  <div className={`p-10 rounded-[40px] flex flex-col md:flex-row items-center justify-between text-white shadow-premium transition-all duration-700 relative overflow-hidden ${getSolidBg(level.color)}`}>
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <Target className="w-32 h-32" />
                    </div>
                    <div className="relative z-10 text-center md:text-left mb-6 md:mb-0">
                      <p className="text-[10px] font-black uppercase opacity-70 tracking-[0.3em] mb-2">{level.label}</p>
                      <p className="text-7xl font-black tabular-nums">{score.toFixed(2)}<span className="text-2xl opacity-50 ml-1">%</span></p>
                    </div>
                    <div className="relative z-10 text-center md:text-right">
                      <Badge variant="secondary" className="bg-white/20 text-white border-white/30 px-6 py-2 text-xs backdrop-blur-sm">
                        {isTarget ? 'Meta Atingida' : 'Abaixo da Meta'}
                      </Badge>
                      <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-4">Calculado automaticamente</p>
                    </div>
                  </div>
                );
              })()}

              {selectedForm.sections.map((section, sIdx) => (
                <div key={section.id} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-brand-primary text-white flex items-center justify-center font-black">{sIdx + 1}</div>
                    <div>
                      <h3 className="text-lg font-black text-brand-primary tracking-tight uppercase">{section.title}</h3>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Peso desta seção: {section.weight}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {section.questions.map(q => (
                      <Card key={q.id} className={`bg-white hover:border-brand-accent transition-all group ${q.is_critical && scores[q.id] === 'NAO' ? 'border-error ring-4 ring-error/5' : ''}`}>
                        <div className="flex flex-col md:flex-row justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-start gap-3">
                              {q.is_critical && (
                                <Badge variant="error" size="sm" className="mt-1 flex-shrink-0 animate-pulse">ERRO CRÍTICO</Badge>
                              )}
                              <p className="text-sm font-bold text-brand-primary leading-relaxed">{q.text}</p>
                            </div>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-[9px] font-black text-brand-muted uppercase tracking-widest">
                                Impacto: {((section.weight || 0) / (section.questions.filter(qu => scores[qu.id] !== 'NA').length || section.questions.length)).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1 bg-surface-bg p-1 rounded-2xl h-fit border border-surface-border">
                            {(['SIM', 'NAO', 'NA'] as const).map(opt => (
                              <button key={opt} onClick={() => !isViewOnly && setScores({...scores, [q.id]: opt})} className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${scores[q.id] === opt ? (opt === 'NAO' && q.is_critical ? 'bg-error text-white shadow-premium' : 'bg-brand-primary text-white shadow-premium') : 'text-brand-muted hover:bg-white'}`} disabled={isViewOnly}>{opt}</button>
                            ))}
                          </div>
                        </div>
                        <textarea value={observations[q.id] || ''} onChange={e => !isViewOnly && setObservations({...observations, [q.id]: e.target.value})} placeholder="Adicionar observação específica para este item..." className="w-full mt-4 bg-surface-bg border border-surface-border rounded-xl p-4 text-xs font-medium focus:border-brand-accent focus:outline-none transition-all" disabled={isViewOnly} />
                      </Card>
                    ))}
                  </div>
                </div>
              ))}

              {selectedForm.critical_errors?.length > 0 && (
                <div className="pt-10 border-t border-error/10">
                  <h3 className="text-lg font-black text-error flex items-center gap-2 mb-6 uppercase tracking-tight"><AlertOctagon className="w-6 h-6" /> Itens Fatais (Erros Críticos)</h3>
                  <div className="grid grid-cols-1 gap-6">
                    {selectedForm.critical_errors.map(ce => (
                      <div key={ce.id} className="space-y-3">
                        <label className={`flex items-center gap-4 p-5 rounded-[24px] border-2 transition-all cursor-pointer ${criticalErrors[ce.id] ? 'bg-red-50 border-error' : 'bg-white border-surface-border hover:border-error/30'}`}>
                          <input type="checkbox" checked={!!criticalErrors[ce.id]} onChange={e => !isViewOnly && setCriticalErrors({...criticalErrors, [ce.id]: e.target.checked})} disabled={isViewOnly} className="w-6 h-6 rounded-lg text-error focus:ring-error" />
                          <span className="text-sm font-black text-brand-primary uppercase tracking-tight">{ce.text}</span>
                        </label>
                        {criticalErrors[ce.id] && (
                          <textarea value={criticalErrorObservations[ce.id] || ''} onChange={e => !isViewOnly && setCriticalErrorObservations({...criticalErrorObservations, [ce.id]: e.target.value})} placeholder="Justificativa técnica obrigatória para a aplicação deste erro crítico..." className="w-full border-error/20 border-2 rounded-2xl p-4 text-sm font-medium focus:border-error focus:outline-none bg-red-50/20" disabled={isViewOnly} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="space-y-10 animate-fade-in max-w-4xl mx-auto w-full">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-brand-muted tracking-widest ml-1">Registro do Auditor</p>
                <textarea 
                  value={header.evaluator_note} 
                  onChange={e => setHeader({...header, evaluator_note: e.target.value})} 
                  disabled={isViewOnly} 
                  className="w-full bg-white border border-surface-border rounded-[24px] p-8 text-sm font-medium min-h-[200px] focus:border-brand-accent focus:outline-none shadow-premium-sm" 
                  placeholder="Escreva aqui as observações gerais da auditoria..." 
                />
              </div>

              {isReevaluating && (
                <Card className="bg-brand-subtle border-brand-highlight p-6">
                  <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-3">Justificativa da Reavaliação *</p>
                  <textarea value={header.reevaluation_justification} onChange={e => setHeader({...header, reevaluation_justification: e.target.value})} className="w-full bg-white border border-surface-border rounded-2xl p-4 text-sm font-medium focus:border-brand-accent focus:outline-none" placeholder="Explique por que os itens foram alterados..." />
                </Card>
              )}

              {initialData?.history && initialData.history.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 px-1">
                    <History className="w-4 h-4 text-brand-primary" />
                    <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest">Histórico de Interações</h3>
                  </div>
                  <div className="space-y-4">
                    {initialData.history.map((h, i) => (
                      <div key={i} className="flex items-start gap-4 bg-white/60 p-6 rounded-[24px] border border-surface-border shadow-sm">
                        <div className="w-10 h-10 rounded-2xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-muted">
                          <UserIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-black text-brand-primary uppercase tracking-tight">{h.action}</p>
                            <p className="text-[10px] font-bold text-brand-muted uppercase">{new Date(h.at).toLocaleString('pt-BR')}</p>
                          </div>
                          <p className="text-[10px] font-bold text-brand-muted uppercase mb-3">
                            {(() => {
                              if (user?.role === 'suporte' || user?.role === 'gestor_suporte') {
                                const actor = allUsers.find(u => u.id === h.by_id);
                                if (actor && ['qualidade', 'gestor_qualidade', 'admin'].includes(actor.role)) {
                                  return 'Equipe de Qualidade';
                                }
                              }
                              return h.by_name;
                            })()}
                          </p>
                          {h.note && (
                            <div className="bg-surface-bg/50 rounded-xl p-4 border border-surface-border/50">
                              <p className="text-xs text-brand-primary font-medium italic leading-relaxed">"{h.note}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-8 bg-white border-t border-surface-border flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} icon={<ChevronLeft className="w-4 h-4" />}>
            Voltar
          </Button>
          
          <div className="flex gap-4">
            {step < 4 ? (
              <Button onClick={() => { if (validateStep(step)) setStep(s => Math.min(4, s + 1)); }} icon={<ChevronRight className="w-4 h-4" />}>
                Continuar
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving || isViewOnly} className="bg-brand-accent text-white px-12" icon={<Save className="w-4 h-4" />}>
                {saving ? 'Processando...' : 'Finalizar Monitoria'}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
