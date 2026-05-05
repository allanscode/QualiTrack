import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { EvaluationForm, Monitoria, User } from '../types';
import { ChevronRight, Save, X, AlertOctagon, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export default function MonitoriaForm({ user, onCancel }: { user: User | null, onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [ticketInfo, setTicketInfo] = useState({
    externalId: '',
    canal: 'Chat',
    agentId: '',
    customer: ''
  });

  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  
  const [scores, setScores] = useState<{ [key: string]: 'SIM' | 'NAO' | 'NA' }>({});
  const [criticalErrors, setCriticalErrors] = useState<{ [key: string]: boolean }>({
    'c1': false, 'c2': false, 'c3': false
  });

  useEffect(() => {
    // Carregar formulários e agentes
    const unsubForms = onSnapshot(collection(db, 'forms'), (snapshot) => {
      const allForms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EvaluationForm));
      setForms(allForms.filter(f => f.active !== false));
    });
    
    // Buscar apenas os usuários que são "tecnico" ou "assistente"
    const unsubAgents = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['tecnico', 'assistente'])), (snapshot) => {
      const allAgents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setAgents(allAgents.filter(a => a.active !== false));
    });

    return () => { unsubForms(); unsubAgents(); };
  }, []);

  const selectedForm = forms.find(f => f.id === selectedFormId);

  const criticalSection = {
    title: "Erros Críticos (Invalidação Automática)",
    questions: [
      { id: 'c1', text: "Falhas Éticas e de Segurança" },
      { id: 'c2', text: "Falhas de Resolutividade e Atendimento" },
      { id: 'c3', text: "Fraudes e Burlas de Procedimento" }
    ]
  };

  const calculateScore = () => {
    if (Object.values(criticalErrors).some(v => v === true)) return 0;
    if (!selectedForm || !selectedForm.sections) return 0;

    let earnedScore = 0;
    
    selectedForm.sections.forEach(s => {
      let pillarScore = 0;
      let answeredCount = 0;
      
      s.questions.forEach(q => {
        const val = scores[q.id];
        if (val === 'SIM' || val === 'NAO') {
          if (val === 'SIM') pillarScore += 1;
          answeredCount++;
        }
      });

      if (answeredCount > 0) {
        const pillarPercentage = pillarScore / answeredCount;
        earnedScore += pillarPercentage * (s.weight || 0);
      }
    });

    const final = Math.round(earnedScore);
    if (final < 70) return 0;
    return final;
  };

  const handleSave = async (status: 'draft' | 'completed') => {
    if (!user) return;
    if (!selectedFormId || !ticketInfo.agentId) {
      toast.error("Preencha todos os dados obrigatórios primeiro.");
      return;
    }

    const finalScore = calculateScore();
    const monitoria: Omit<Monitoria, 'id'> = {
      ticketId: ticketInfo.externalId,
      agentId: ticketInfo.agentId,
      auditorId: user.email, // using email as ID
      formId: selectedFormId,
      scores,
      finalScore,
      feedback: '',
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'monitorias'), monitoria);
      toast.success(status === 'completed' ? 'Monitoria salva com sucesso!' : 'Rascunho salvo!');
      onCancel();
    } catch (e) {
      toast.error('Erro ao salvar monitoria.');
      handleFirestoreError(e, OperationType.CREATE, 'monitorias');
    }
  };

  return (
    <div className="bg-white rounded-[40px] border border-[#E2E4D8] shadow-sm p-4 max-w-4xl mx-auto overflow-hidden">
      <header className="p-6 border-b border-[#F0F1E8] bg-[#FBFBF9] rounded-[32px] flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-2xl text-[#2D3A3A]">Nova Monitoria</h2>
          <p className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase mt-1">Ferramenta de Avaliação</p>
        </div>
        <button onClick={onCancel} className="p-2.5 rounded-xl hover:bg-[#F0F1E8] text-[#7A7D71] transition-all">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="p-8">
        {step === 1 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <h3 className="text-sm font-bold tracking-widest text-[#2D3A3A] uppercase">Configuração da Avaliação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">Ficha de Avaliação (Formulário)</label>
                <select 
                  className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none appearance-none"
                  value={selectedFormId}
                  onChange={e => setSelectedFormId(e.target.value)}
                >
                  <option value="">Selecione o modelo...</option>
                  {forms.map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">Técnico / Assistente Avaliado</label>
                <select 
                  className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none appearance-none"
                  value={ticketInfo.agentId}
                  onChange={e => setTicketInfo({...ticketInfo, agentId: e.target.value})}
                >
                  <option value="">Selecione o agente...</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                  ))}
                </select>
              </div>

              <InputGroup label="ID do Ticket (Zendesk / TomTicket)" value={ticketInfo.externalId} onChange={v => setTicketInfo({...ticketInfo, externalId: v})} placeholder="Ex: #12345" />
              
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">Canal de Atendimento</label>
                <select 
                  className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none appearance-none"
                  value={ticketInfo.canal}
                  onChange={e => setTicketInfo({...ticketInfo, canal: e.target.value})}
                >
                  <option>Chat</option>
                  <option>Email</option>
                  <option>Telefone</option>
                  <option>WhatsApp</option>
                </select>
              </div>
              
            </div>
            <button 
              onClick={() => {
                if (!selectedFormId || !ticketInfo.agentId || !ticketInfo.externalId) {
                  toast.error("Preencha todos os dados!");
                  return;
                }
                setStep(2);
              }}
              className="mt-8 bg-[#2D3A3A] text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 w-full md:w-auto"
            >
              Iniciar Avaliação <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
            {!selectedForm ? (
              <p className="text-center text-[#7A7D71] py-12">Nenhum formulário selecionado.</p>
            ) : (
              selectedForm.sections?.map((section, idx) => (
                <div key={idx} className="space-y-6">
                  <div className="flex items-center gap-4 border-b border-[#F0F1E8] pb-4">
                    <div className="w-8 h-8 rounded-full bg-[#F9F9F6] border border-[#E2E4D8] flex items-center justify-center text-sm font-bold text-[#7A7D71]">0{idx + 1}</div>
                    <h3 className="font-bold text-xl text-[#2D3A3A]">Pilar {section.title} ({section.weight}%)</h3>
                  </div>
                  <div className="space-y-4">
                    {section.questions.map(q => (
                      <div key={q.id} className="p-6 rounded-3xl border border-[#E2E4D8] bg-[#FBFBF9] hover:bg-white transition-all shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <p className="text-sm font-medium text-[#3D4035] w-full md:w-2/3">{q.text}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-[#F0F1E8] p-1.5 rounded-2xl">
                              <button 
                                onClick={() => setScores({...scores, [q.id]: 'SIM'})}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${scores[q.id] === 'SIM' ? 'bg-[#A7C0A5] text-[#2D3A3A] shadow-sm' : 'text-[#7A7D71] hover:bg-white hover:text-[#2D3A3A]'}`}
                              >
                                SIM
                              </button>
                              <button 
                                onClick={() => setScores({...scores, [q.id]: 'NAO'})}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${scores[q.id] === 'NAO' ? 'bg-red-400 text-white shadow-sm' : 'text-[#7A7D71] hover:bg-white hover:text-[#2D3A3A]'}`}
                              >
                                NÃO
                              </button>
                              <button 
                                onClick={() => setScores({...scores, [q.id]: 'NA'})}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${scores[q.id] === 'NA' ? 'bg-white text-[#2D3A3A] shadow-sm' : 'text-[#7A7D71] hover:bg-white hover:text-[#2D3A3A]'}`}
                              >
                                N/A
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            <div className="space-y-6">
              <div className="flex items-center gap-4 border-b border-red-100 pb-4">
                <div className="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-sm font-bold text-red-600">
                  <AlertOctagon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xl text-red-600">{criticalSection.title}</h3>
              </div>
              <div className="space-y-4">
                {criticalSection.questions.map(q => (
                  <label key={q.id} className="flex items-center justify-between p-6 rounded-3xl border border-red-100 bg-red-50/50 hover:bg-red-50 transition-all shadow-sm cursor-pointer">
                    <span className="text-sm font-medium text-red-900 w-full md:w-2/3">{q.text}</span>
                    <input 
                      type="checkbox" 
                      className="w-6 h-6 rounded border-red-300 text-red-600 focus:ring-red-600 accent-red-600 cursor-pointer"
                      checked={criticalErrors[q.id]}
                      onChange={(e) => setCriticalErrors({...criticalErrors, [q.id]: e.target.checked})}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="text-center md:text-left bg-[#F9F9F6] p-4 rounded-3xl border border-[#E2E4D8] min-w-[140px]">
                  <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase mb-1">Score Atual</p>
                  <p className={`text-3xl font-bold ${calculateScore() >= 90 ? 'text-[#2D3A3A]' : calculateScore() >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                    {calculateScore()}%
                  </p>
                </div>
                <div className="bg-[#FBFBF9] rounded-2xl border border-[#F0F1E8] p-4 flex items-center gap-3 max-w-sm">
                  <div className="w-8 h-8 rounded-full bg-[#E2E4D8] flex items-center justify-center flex-shrink-0 text-[#7A7D71]">
                    <Info className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] text-[#7A7D71] leading-relaxed">
                    Pontuação inferior a 70% resulta em invalidação automática (0%). Erros críticos zeram a nota.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => handleSave('draft')}
                  className="px-6 py-3 font-bold text-sm text-[#2D3A3A] bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl hover:bg-[#E2E4D8] transition-colors"
                >
                  Salvar Rascunho
                </button>
                <button 
                  onClick={() => handleSave('completed')}
                  className="px-6 py-3 bg-[#2D3A3A] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> Finalizar Avaliação
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, placeholder }: { label: string, value: string, onChange: (v: string) => void, placeholder: string }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold tracking-widest text-[#7A7D71] uppercase">{label}</label>
      <input 
        type="text" 
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none transition-all placeholder:text-[#A7A9A0]"
      />
    </div>
  );
}
