import React, { useState, useEffect } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { EvaluationForm, User, Team, MonitoriaHistoryEntry } from '../types';
import { ChevronRight, ChevronLeft, Save, X, AlertOctagon, Info, CheckCircle2, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

const CHANNELS = ['Chat', 'Email', 'Telefone', 'WhatsApp'] as const;

export default function MonitoriaForm({ user, onCancel, onSaved }: { user: User | null; onCancel: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(1);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const [header, setHeader] = useState({
    form_id: '',
    evaluated_id: '',
    team_id: '',
    ticket_id: '',
    channel: 'Chat' as typeof CHANNELS[number],
    ticket_date: today,
    analysis_date: today,
    satisfaction_result: '' as 'Positiva' | 'Negativa' | 'Sem pesquisa' | '',
    satisfaction_has_record: false,
    satisfaction_record_text: '',
  });

  const [scores, setScores] = useState<Record<string, 'SIM' | 'NAO' | 'NA'>>({});
  const [criticalErrors, setCriticalErrors] = useState<Record<string, boolean>>({ c1: false, c2: false, c3: false });

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!supabase) {
          const fRes = await mockDb.get('forms');
          const aRes = await mockDb.get('users');
          const tRes = await mockDb.get('teams');
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

  // Show all active teams — team_ids on agent is optional (column may not exist yet)
  // The auditor picks which team context applies to this monitoria
  const selectedAgent = agents.find(a => a.id === header.evaluated_id);

  useEffect(() => {
    setHeader(h => ({ ...h, team_id: '' }));
  }, [header.evaluated_id]);

  const selectedForm = forms.find(f => f.id === header.form_id);

  const criticalSection = {
    questions: [
      { id: 'c1', text: 'Falhas Éticas e de Segurança' },
      { id: 'c2', text: 'Falhas de Resolutividade e Atendimento' },
      { id: 'c3', text: 'Fraudes e Burlas de Procedimento' },
    ],
  };

  const calculateScore = () => {
    if (Object.values(criticalErrors).some(v => v)) return 0;
    if (!selectedForm?.sections?.length) return 0;
    let earnedScore = 0;
    selectedForm.sections.forEach(s => {
      let yes = 0, answered = 0;
      s.questions.forEach(q => {
        const v = scores[q.id];
        if (v === 'SIM' || v === 'NAO') { if (v === 'SIM') yes++; answered++; }
      });
      if (answered > 0) earnedScore += (yes / answered) * (s.weight || 0);
    });
    return Math.round(earnedScore);
  };

  const score = calculateScore();
  const scoreColor = score >= 90 ? 'text-[#2D3A3A]' : score >= 70 ? 'text-amber-600' : 'text-red-600';
  const scoreBarColor = score >= 90 ? 'bg-[#A7C0A5]' : score >= 70 ? 'bg-amber-400' : 'bg-red-400';

  const canProceed = header.form_id && header.evaluated_id && header.ticket_id && header.ticket_date;

  const handleSave = async () => {
    if (!user || !canProceed) { toast.error('Preencha todos os campos obrigatórios.'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const historyEntry: MonitoriaHistoryEntry = { action: 'Monitoria criada', by_id: user.id, by_name: user.name, at: now };
      const payload = {
        form_id: header.form_id,
        evaluator_id: user.id,
        evaluated_id: header.evaluated_id,
        team_id: header.team_id || null,
        ticket_id: header.ticket_id,
        channel: header.channel,
        ticket_date: header.ticket_date,
        analysis_date: today,
        satisfaction_result: header.satisfaction_result || null,
        satisfaction_has_record: header.satisfaction_has_record,
        satisfaction_record_text: header.satisfaction_has_record ? header.satisfaction_record_text : null,
        answers: scores,
        score,
        status: 'pendente_revisao',
        deadline_at: new Date(Date.now() + 48 * 3600000).toISOString(),
        history: [historyEntry],
        created_at: now,
        updated_at: now,
      };
      if (!supabase) {
        await mockDb.insert('monitorias', payload);
      } else {
        const { error } = await supabase.from('monitorias').insert([payload]);
        if (error) throw error;
      }
      toast.success('Monitoria criada! O técnico auditado será notificado.', { duration: 5000 });
      onSaved();
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao salvar monitoria: ' + (e.message || JSON.stringify(e)));
    } finally { setSaving(false); }
  };

  return (
    // Full-screen overlay — blurs background, traps navigation
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-[40px] border border-[#E2E4D8] shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        {/* Fixed Header */}
        <div className="px-8 pt-7 pb-5 border-b border-[#F0F1E8] bg-[#FBFBF9] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-2xl text-[#2D3A3A]">Nova Monitoria</h2>
            <p className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase mt-1">
              {step === 1 ? 'Passo 1 de 2 — Identificação' : 'Passo 2 de 2 — Avaliação'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${step === 1 ? 'bg-[#2D3A3A] text-white border-[#2D3A3A]' : 'bg-[#A7C0A5] text-white border-[#A7C0A5]'}`}>
                {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : '1'}
              </div>
              <div className={`w-10 h-0.5 ${step > 1 ? 'bg-[#A7C0A5]' : 'bg-[#E2E4D8]'}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${step === 2 ? 'bg-[#2D3A3A] text-white border-[#2D3A3A]' : 'border-[#E2E4D8] text-[#7A7D71]'}`}>2</div>
            </div>
            <button onClick={onCancel} className="p-2.5 rounded-xl hover:bg-[#F0F1E8] text-[#7A7D71] transition-all ml-2" title="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="step1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-8">

                {/* Configuração */}
                <section className="space-y-4">
                  <SectionTitle>Configuração da Avaliação</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SelectField label="Ficha de Avaliação *" value={header.form_id} onChange={v => setHeader({ ...header, form_id: v })}>
                      <option value="">Selecione o modelo...</option>
                      {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                    </SelectField>

                    <SelectField label="Técnico Auditado *" value={header.evaluated_id} onChange={v => setHeader({ ...header, evaluated_id: v })}>
                      <option value="">Selecione o técnico...</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </SelectField>

                    {/* Team selector — always visible when agent is selected */}
                    {header.evaluated_id && (
                      <SelectField label="Equipe *" value={header.team_id} onChange={v => setHeader({ ...header, team_id: v })}>
                        <option value="">Selecione a equipe...</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </SelectField>
                    )}
                  </div>
                </section>

                {/* Dados do Ticket */}
                <section className="space-y-4">
                  <SectionTitle>Dados do Ticket</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputField label="ID do Ticket *" value={header.ticket_id} onChange={v => setHeader({ ...header, ticket_id: v })} placeholder="Ex: #12345" />
                    <SelectField label="Canal de Atendimento" value={header.channel} onChange={v => setHeader({ ...header, channel: v as any })}>
                      {CHANNELS.map(c => <option key={c}>{c}</option>)}
                    </SelectField>
                    <div className="space-y-2">
                      <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">Data do Ticket *</label>
                      <input type="date" value={header.ticket_date} onChange={e => setHeader({ ...header, ticket_date: e.target.value })}
                        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none" />
                    </div>
                    <ReadonlyField label="Data da Análise">
                      {new Date(today).toLocaleDateString('pt-BR')}
                    </ReadonlyField>
                  </div>
                </section>

                {/* Pesquisa de Satisfação */}
                <section className="space-y-4">
                  <SectionTitle>Pesquisa de Satisfação</SectionTitle>
                  <div className="grid grid-cols-3 gap-3">
                    {(['Positiva', 'Negativa', 'Sem pesquisa'] as const).map(opt => {
                      const isSelected = header.satisfaction_result === opt;
                      const baseStyle = isSelected
                        ? opt === 'Positiva' ? 'bg-green-50 border-green-400 text-green-800' : opt === 'Negativa' ? 'bg-red-50 border-red-400 text-red-800' : 'bg-[#E2E4D8] border-[#7A7D71] text-[#2D3A3A]'
                        : 'bg-[#F9F9F6] border-[#E2E4D8] text-[#7A7D71] hover:bg-white';
                      return (
                        <button key={opt} onClick={() => setHeader({ ...header, satisfaction_result: opt, satisfaction_has_record: false, satisfaction_record_text: '' })}
                          className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all flex flex-col items-center gap-2 ${baseStyle}`}>
                          <span className="text-xl">{opt === 'Positiva' ? '😊' : opt === 'Negativa' ? '😞' : '🔇'}</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {(header.satisfaction_result === 'Positiva' || header.satisfaction_result === 'Negativa') && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden space-y-3">
                      <label className="flex items-center gap-3 p-4 bg-[#F9F9F6] rounded-2xl border border-[#E2E4D8] cursor-pointer hover:bg-white transition-colors">
                        <input type="checkbox" checked={header.satisfaction_has_record} onChange={e => setHeader({ ...header, satisfaction_has_record: e.target.checked, satisfaction_record_text: '' })}
                          className="w-5 h-5 rounded border-[#E2E4D8] text-[#A7C0A5] focus:ring-[#A7C0A5]" />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#2D3A3A]">Cliente deixou registro escrito</p>
                          <p className="text-xs text-[#7A7D71]">O cliente descreveu o motivo da avaliação {header.satisfaction_result.toLowerCase()}</p>
                        </div>
                        <MessageSquare className="w-5 h-5 text-[#7A7D71]" />
                      </label>

                      {header.satisfaction_has_record && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                          <textarea
                            value={header.satisfaction_record_text}
                            onChange={e => setHeader({ ...header, satisfaction_record_text: e.target.value })}
                            placeholder="Cole ou digite aqui o registro deixado pelo cliente..."
                            rows={3}
                            className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl p-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none resize-none placeholder:text-[#A7A9A0]"
                          />
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </section>
              </motion.div>
            ) : (
              <motion.div key="step2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-10">
                {/* Score Banner */}
                <div className="bg-[#F9F9F6] rounded-3xl border border-[#E2E4D8] p-6 flex items-center justify-between gap-6">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase mb-1">Score em tempo real</p>
                    <p className={`text-5xl font-bold ${scoreColor}`}>{score}<span className="text-2xl">%</span></p>
                  </div>
                  <div className="flex-1">
                    <div className="h-3 bg-[#E2E4D8] rounded-full overflow-hidden">
                      <div className={`h-full ${scoreBarColor} transition-all duration-500 rounded-full`} style={{ width: `${score}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-[#7A7D71] mt-1">
                      <span>0%</span><span>70% mín.</span><span>100%</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-[#7A7D71] max-w-[160px]">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Abaixo de 70% ou erro crítico = nota zero</span>
                  </div>
                </div>

                {!selectedForm ? (
                  <p className="text-center text-[#7A7D71] py-8">Nenhum formulário selecionado.</p>
                ) : (
                  selectedForm.sections?.map((section, idx) => {
                    const count = section.questions.length;
                    const perQ = count > 0 ? Math.round(((section.weight || 0) / count) * 10) / 10 : 0;
                    return (
                      <div key={idx} className="space-y-4">
                        <div className="flex items-center gap-4 pb-3 border-b border-[#E2E4D8]">
                          <div className="w-8 h-8 rounded-full bg-[#2D3A3A] flex items-center justify-center text-xs font-bold text-white">{String(idx + 1).padStart(2, '0')}</div>
                          <div>
                            <h3 className="font-bold text-lg text-[#2D3A3A]">{section.title}</h3>
                            <p className="text-xs text-[#7A7D71]">Peso: <strong>{section.weight || 0}%</strong> · {count} critérios · {perQ}% cada</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {section.questions.map(q => (
                            <div key={q.id} className="p-5 rounded-2xl border border-[#E2E4D8] bg-[#FBFBF9] hover:bg-white transition-all">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <p className="text-sm font-medium text-[#3D4035] md:w-2/3">{q.text}</p>
                                <div className="flex items-center gap-1 bg-[#F0F1E8] p-1.5 rounded-2xl">
                                  {(['SIM', 'NAO', 'NA'] as const).map(opt => (
                                    <button key={opt} onClick={() => setScores({ ...scores, [q.id]: opt })}
                                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${scores[q.id] === opt ? (opt === 'SIM' ? 'bg-[#A7C0A5] text-[#2D3A3A] shadow-sm' : opt === 'NAO' ? 'bg-red-400 text-white shadow-sm' : 'bg-white text-[#2D3A3A] shadow-sm') : 'text-[#7A7D71] hover:bg-white hover:text-[#2D3A3A]'}`}>
                                      {opt === 'NAO' ? 'NÃO' : opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Erros Críticos */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-red-100">
                    <div className="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                      <AlertOctagon className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-red-600">Erros Críticos</h3>
                      <p className="text-xs text-red-400">Marcar qualquer item abaixo zera a nota automaticamente</p>
                    </div>
                  </div>
                  {criticalSection.questions.map(q => (
                    <label key={q.id} className="flex items-center justify-between p-5 rounded-2xl border border-red-100 bg-red-50/40 hover:bg-red-50 transition-all cursor-pointer">
                      <span className="text-sm font-medium text-red-900">{q.text}</span>
                      <input type="checkbox" checked={criticalErrors[q.id]} onChange={e => setCriticalErrors({ ...criticalErrors, [q.id]: e.target.checked })}
                        className="w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500 accent-red-600 cursor-pointer" />
                    </label>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Fixed Footer */}
        <div className="px-8 py-5 border-t border-[#F0F1E8] bg-[#FBFBF9] flex items-center justify-between flex-shrink-0">
          {step === 1 ? (
            <>
              <button onClick={onCancel} className="px-5 py-2.5 text-sm font-bold text-[#7A7D71] hover:text-[#2D3A3A] transition-colors">Cancelar</button>
              <button
                onClick={() => { if (!canProceed) { toast.error('Preencha Ficha, Técnico, ID e Data do Ticket.'); return; } setStep(2); }}
                className="bg-[#2D3A3A] text-white px-8 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all flex items-center gap-2"
              >
                Iniciar Avaliação <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(1)} className="px-5 py-2.5 text-sm font-bold text-[#7A7D71] hover:text-[#2D3A3A] transition-colors flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${scoreColor}`}>Score: {score}%</span>
                <button onClick={handleSave} disabled={saving}
                  className="bg-[#2D3A3A] text-white px-8 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 disabled:opacity-50 transition-all flex items-center gap-2">
                  <Save className="w-4 h-4" />{saving ? 'Enviando...' : 'Salvar e Enviar para Revisão'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase border-b border-[#E2E4D8] pb-2">{children}</h3>;
}

function ReadonlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">{label}</label>
      <div className="w-full bg-[#F0F1E8] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm text-[#7A7D71] font-medium">{children}</div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none placeholder:text-[#A7A9A0]" />
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none appearance-none">
        {children}
      </select>
    </div>
  );
}
