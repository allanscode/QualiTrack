import React, { useState, useEffect } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { EvaluationForm, User, Team, MonitoriaHistoryEntry, Monitoria, MonitoriaStatus } from '../types';
import { ChevronRight, ChevronLeft, Save, X, AlertOctagon, Info, CheckCircle2, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

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
  const isViewOnly = !!initialData && !(initialData as any)?._reevaluate;
  const isReevaluating = !!(initialData as any)?._reevaluate;
  
  const [step, setStep] = useState(1);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);

  const today = new Date().toLocaleDateString('sv-SE');

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
    reevaluation_justification: '', // New field for reevaluation
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
          setAgents((aRes.data || []).filter((u: User) => u.role === 'suporte' && u.active !== false));
          setTeams((tRes.data || []).filter((t: any) => t.active !== false));
        } else {
          const [{ data: fData }, { data: aData }, { data: tData }] = await Promise.all([
            supabase.from('forms').select('*').eq('active', true),
            supabase.from('users').select('*').eq('role', 'suporte').eq('active', true),
            supabase.from('teams').select('*').eq('active', true),
          ]);
          setForms(fData || []);
          setAgents(aData || []);
          setTeams(tData || []);
        }
      } catch (e) { console.error('Erro ao carregar dados:', e); }
    };
    loadData();
  }, []);

  const selectedForm = forms.find(f => f.id === header.form_id);

  const calculateScore = () => {
    if (Object.values(criticalErrors).some(v => v)) return 0;
    if (!selectedForm?.sections?.length) return 0;
    let totalReduction = 0;
    selectedForm.sections.forEach(s => {
      const sectionWeight = s.weight || 0;
      const questionCount = s.questions.length;
      if (questionCount === 0) return;
      const weightPerQuestion = sectionWeight / questionCount;
      s.questions.forEach(q => {
        if (scores[q.id] === 'NAO') totalReduction += weightPerQuestion;
      });
    });
    return Math.max(0, Math.round(100 - totalReduction));
  };

  const score = calculateScore();
  const canProceed = header.form_id && header.evaluated_id && header.team_id && header.ticket_id && header.ticket_date;

  const isAllAnswered = () => {
    if (!selectedForm) return false;
    return selectedForm.sections.every(s => 
      s.questions.every(q => !!scores[q.id])
    );
  };

  const handleSave = async () => {
    if (!user || !canProceed) { toast.error('Preencha os campos obrigatórios do cabeçalho.'); return; }
    if (!isAllAnswered()) { toast.error('Preencha todos os itens da avaliação (Sim, Não ou N/A).'); return; }
    if (isReevaluating && !header.reevaluation_justification.trim()) {
      toast.error('Informe a justificativa da reavaliação.');
      return;
    }
    
    setSaving(true);
    try {
      const nowTs = new Date().toISOString();
      const scoreNote = isReevaluating ? `[DE ${initialData?.score}% PARA ${score}%] ` : '';
      const historyEntry: MonitoriaHistoryEntry = { 
        action: isReevaluating ? 'Monitoria Reavaliada' : 'Monitoria Criada', 
        by_id: user.id, 
        by_name: user.name, 
        at: nowTs,
        note: isReevaluating ? `${scoreNote}${header.reevaluation_justification}` : undefined
      };
      
      const getDeadline = () => {
        const d = new Date();
        if (isReevaluating) {
          d.setHours(d.getHours() + 24); // 24h after reevaluation
        } else {
          d.setHours(d.getHours() + 48); // 48h for initial review
        }
        return d.toISOString();
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
        status: isReevaluating ? 'pendente_revisao' : (initialData?.status || 'pendente_revisao'),
        evaluator_note: header.evaluator_note,
        client_contact_log: header.client_contact_log,
        client_contact_success: header.client_contact_success,
        active: true,
        history: [...(initialData?.history || []), historyEntry],
        deadline_at: initialData?.deadline_at && !isReevaluating ? initialData.deadline_at : getDeadline(),
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
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-[#2D3A3A]">{isViewOnly ? 'Visualizar Monitoria' : isReevaluating ? 'Reavaliar Monitoria' : 'Nova Monitoria'}</h2>
            {!isViewOnly && <p className="text-[10px] font-bold text-[#7A7D71] uppercase tracking-widest mt-1">Passo {step} de 3 — {step === 1 ? 'Identificação' : step === 2 ? 'Avaliação' : 'Encerramento'}</p>}
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-[#7A7D71]" /></button>
        </div>

        {/* Stepper Progress */}
        {!isViewOnly && (
          <div className="px-10 py-4 flex gap-2 bg-white">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? 'bg-[#A7C0A5]' : 'bg-gray-100'}`} />
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
          {initialData?.contestation_reason && (
            <div className="bg-orange-50 border border-orange-100 p-5 rounded-xl">
              <p className="text-[10px] font-bold text-orange-700 uppercase mb-1 flex items-center gap-2"><Info className="w-3 h-3" /> Motivo da Contestação</p>
              <p className="text-sm text-orange-900 font-medium italic">"{initialData.contestation_reason}"</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">Ficha de Avaliação *</label>
                  <select value={header.form_id} onChange={e => setHeader({...header, form_id: e.target.value})} disabled={isViewOnly || isReevaluating} className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:border-[#A7C0A5]">
                    <option value="">Selecione...</option>
                    {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">Técnico Auditado *</label>
                  <select value={header.evaluated_id} onChange={e => setHeader({...header, evaluated_id: e.target.value})} disabled={isViewOnly || isReevaluating} className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:border-[#A7C0A5]">
                    <option value="">Selecione...</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">ID do Ticket *</label>
                  <input type="text" value={header.ticket_id} onChange={e => setHeader({...header, ticket_id: e.target.value})} disabled={isViewOnly || isReevaluating} className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:border-[#A7C0A5]" placeholder="Ex: 123456" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">Equipe *</label>
                  <select value={header.team_id} onChange={e => setHeader({...header, team_id: e.target.value})} disabled={isViewOnly || isReevaluating} className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:border-[#A7C0A5] transition-all hover:border-gray-300">
                    <option value="">Selecione...</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">Canal</label>
                  <select value={header.channel} onChange={e => setHeader({...header, channel: e.target.value as any})} disabled={isViewOnly || isReevaluating} className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:border-[#A7C0A5] transition-all hover:border-gray-300">
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </section>

              <section className="space-y-6">
                <div className="space-y-4">
                  <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">Pesquisa de Satisfação</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['Positiva', 'Negativa', 'Sem pesquisa'] as const).map(opt => (
                      <button key={opt} onClick={() => !isViewOnly && !isReevaluating && setHeader({...header, satisfaction_result: opt})} className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${header.satisfaction_result === opt ? 'bg-[#2D3A3A] border-[#2D3A3A] text-white shadow-lg shadow-black/10' : 'bg-white border-gray-100 text-[#7A7D71] hover:border-gray-200'}`} disabled={isViewOnly || isReevaluating}>
                        {opt === 'Positiva' ? '😊 Positiva' : opt === 'Negativa' ? '😞 Negativa' : '🔇 Sem pesquisa'}
                      </button>
                    ))}
                  </div>
                </div>

                {header.satisfaction_result && header.satisfaction_result !== 'Sem pesquisa' && (
                  <div className="space-y-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#3D4035]">O cliente deixou algum registro?</p>
                      <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-100">
                        <button onClick={() => !isViewOnly && setHeader({...header, satisfaction_has_record: true})} className={`px-4 py-1 rounded-lg text-xs font-bold transition-all ${header.satisfaction_has_record ? 'bg-[#2D3A3A] text-white' : 'text-[#7A7D71]'}`} disabled={isViewOnly}>Sim</button>
                        <button onClick={() => !isViewOnly && setHeader({...header, satisfaction_has_record: false})} className={`px-4 py-1 rounded-lg text-xs font-bold transition-all ${!header.satisfaction_has_record ? 'bg-[#2D3A3A] text-white' : 'text-[#7A7D71]'}`} disabled={isViewOnly}>Não</button>
                      </div>
                    </div>
                    {header.satisfaction_has_record && (
                      <textarea value={header.satisfaction_record_text} onChange={e => setHeader({...header, satisfaction_record_text: e.target.value})} placeholder="O que o cliente registrou..." className="w-full bg-white border border-gray-100 rounded-xl p-4 text-sm focus:outline-none focus:border-[#A7C0A5] transition-all" disabled={isViewOnly} />
                    )}
                  </div>
                )}

                {header.satisfaction_result === 'Negativa' && (
                  <div className="space-y-4 bg-red-50/30 p-6 rounded-2xl border border-red-100 animate-in fade-in zoom-in-95">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Tratativa de Feedback Negativo</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-red-900">Conseguiu contato para tratativa?</p>
                      <div className="flex gap-1 bg-white p-1 rounded-xl border border-red-100">
                        <button onClick={() => !isViewOnly && setHeader({...header, client_contact_success: true})} className={`px-4 py-1 rounded-lg text-xs font-bold transition-all ${header.client_contact_success ? 'bg-red-600 text-white' : 'text-red-400'}`} disabled={isViewOnly}>Sim</button>
                        <button onClick={() => !isViewOnly && setHeader({...header, client_contact_success: false})} className={`px-4 py-1 rounded-lg text-xs font-bold transition-all ${!header.client_contact_success ? 'bg-red-600 text-white' : 'text-red-400'}`} disabled={isViewOnly}>Não</button>
                      </div>
                    </div>
                    {header.client_contact_success && (
                      <textarea value={header.client_contact_log} onChange={e => setHeader({...header, client_contact_log: e.target.value})} placeholder="Registro do contato com o cliente e resultado da tratativa..." className="w-full bg-white border border-red-100 rounded-xl p-4 text-sm focus:outline-none focus:border-red-400 transition-all animate-in fade-in zoom-in-95" disabled={isViewOnly} />
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
              <div className={`p-6 rounded-3xl flex items-center justify-between text-white shadow-xl transition-all duration-500 ${
                score === 100 ? 'bg-gradient-to-r from-indigo-600 to-purple-600' :
                score >= 75 ? 'bg-emerald-500' :
                'bg-red-500'
              }`}>
                <div>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-[0.2em] mb-1">{isReevaluating ? 'Novo Score' : 'Score Atual'}</p>
                  <div className="flex items-baseline gap-3">
                    <p className="text-5xl font-black">{score}<span className="text-xl opacity-40">%</span></p>
                    {isReevaluating && (
                      <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">
                        Anterior: {initialData?.score}%
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-white/80">{score >= 90 ? 'Excelente' : score >= 70 ? 'Bom' : 'Abaixo da Meta'}</p>
                </div>
              </div>

              {selectedForm?.sections.map((section, sIdx) => (
                <div key={section.id} className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-[#7A7D71]">{sIdx + 1}</div>
                    <h3 className="text-lg font-bold text-[#2D3A3A]">{section.title} <span className="text-xs font-normal text-[#7A7D71] ml-2">({section.weight}%)</span></h3>
                  </div>
                  <div className="space-y-4">
                    {section.questions.map(q => (
                      <div key={q.id} className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4 transition-all hover:shadow-md hover:bg-white group">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                          <p className="text-sm font-bold text-[#3D4035] flex-1 group-hover:text-black transition-colors">{q.text}</p>
                          <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-100 h-fit shadow-sm">
                            {(['SIM', 'NAO', 'NA'] as const).map(opt => (
                              <button key={opt} onClick={() => !isViewOnly && setScores({...scores, [q.id]: opt})} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scores[q.id] === opt ? 'bg-[#2D3A3A] text-white shadow-md' : 'text-[#7A7D71] hover:bg-gray-50'}`} disabled={isViewOnly}>{opt}</button>
                            ))}
                          </div>
                        </div>
                        <textarea value={observations[q.id] || ''} onChange={e => !isViewOnly && setObservations({...observations, [q.id]: e.target.value})} placeholder="Observações (opcional)..." className="w-full bg-white border border-gray-100 rounded-xl p-3 text-xs focus:outline-none focus:border-[#A7C0A5] transition-all hover:border-gray-300" disabled={isViewOnly} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {selectedForm?.critical_errors && selectedForm.critical_errors.length > 0 && (
                <div className="space-y-6 pt-6 border-t border-red-100">
                  <h3 className="text-lg font-bold text-red-600 flex items-center gap-2"><AlertOctagon className="w-5 h-5" /> Erros Críticos</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {selectedForm.critical_errors.map(ce => (
                      <div key={ce.id} className="space-y-3">
                        <label className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${criticalErrors[ce.id] ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-transparent'}`}>
                          <input type="checkbox" checked={!!criticalErrors[ce.id]} onChange={e => !isViewOnly && setCriticalErrors({...criticalErrors, [ce.id]: e.target.checked})} disabled={isViewOnly} className="w-5 h-5 rounded border-red-200 text-red-600" />
                          <span className="text-sm font-bold text-red-900">{ce.text}</span>
                        </label>
                        {criticalErrors[ce.id] && (
                          <textarea value={criticalErrorObservations[ce.id] || ''} onChange={e => !isViewOnly && setCriticalErrorObservations({...criticalErrorObservations, [ce.id]: e.target.value})} placeholder="Justificativa obrigatória do erro crítico..." className="w-full border-red-100 border rounded-xl p-3 text-xs focus:outline-none focus:border-red-300" disabled={isViewOnly} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <section className="space-y-4">
                <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">Considerações Finais</label>
                <textarea value={header.evaluator_note} onChange={e => setHeader({...header, evaluator_note: e.target.value})} disabled={isViewOnly} className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-6 text-sm min-h-[140px] focus:outline-none focus:border-[#A7C0A5]" placeholder="Feedback para o técnico..." />
              </section>

              {isReevaluating && (
                <section className="space-y-4 bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                  <label className="text-xs font-bold text-blue-700 uppercase tracking-wider">Justificativa da Reavaliação *</label>
                  <textarea value={header.reevaluation_justification} onChange={e => setHeader({...header, reevaluation_justification: e.target.value})} className="w-full bg-white border border-blue-100 rounded-xl p-4 text-sm focus:outline-none focus:border-blue-400" placeholder="Descreva por que a nota foi alterada ou mantida após reanálise..." />
                </section>
              )}

              {isViewOnly && initialData?.history && initialData.history.length > 0 && (
                <section className="space-y-4 pt-6 border-t border-gray-100">
                  <label className="text-xs font-bold text-[#7A7D71] uppercase tracking-wider">Histórico de Ações</label>
                  <div className="space-y-3">
                    {initialData.history.map((h, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A7C0A5] mt-1.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-bold text-[#2D3A3A]">{h.action}</p>
                          <p className="text-[#7A7D71] mt-0.5">{h.by_name} · {new Date(h.at).toLocaleString('pt-BR')}</p>
                          {h.note && <p className="text-[#3D4035] mt-2 bg-white/60 p-2 rounded-lg italic">"{h.note}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="px-6 py-3 rounded-2xl font-bold text-[#7A7D71] disabled:opacity-30 flex items-center gap-2 hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          
          <div className="flex gap-3">
            {step < 3 ? (
              <button onClick={() => { if (step === 1 && !canProceed) { toast.error('Preencha os campos obrigatórios'); return; } setStep(s => Math.min(3, s + 1)); }} className="bg-[#2D3A3A] text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-colors shadow-lg shadow-black/5">
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving || isViewOnly} className="bg-[#A7C0A5] text-[#2D3A3A] px-10 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-[#96ae94] transition-all shadow-lg shadow-[#A7C0A5]/20">
                {saving ? 'Salvando...' : <><Save className="w-4 h-4" /> Finalizar</>}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
