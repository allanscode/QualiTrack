import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  Clock,
  Calendar,
  Users,
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { toast } from 'sonner';
import { useQualityConfig, EmailReportConfig } from '../../lib/useQualityConfig';
import { useAuth } from '../../providers/AuthProvider';
import { supabase, isMockMode } from '../../lib/supabase';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
];

export default function EmailConfigManagement() {
  const { config, saveConfig } = useQualityConfig();
  const { userData } = useAuth();

  const [localConfig, setLocalConfig] = useState<EmailReportConfig>(() => {
    return (
      config.emailReportConfig || {
        enabled: true,
        senderName: 'QualiTrack - Gestão da Qualidade',
        senderEmail: '',
        subjectTemplate: '[QualiTrack] Relatório Executivo de Qualidade · {{team}} ({{period}})',
        autoDispatchEnabled: false,
        frequency: 'weekly',
        dayOfWeek: 1,
        dayOfMonth: 1,
        dispatchTime: '08:00',
        targetRoleRecipients: ['gestor_suporte', 'gestor_qualidade'],
        extraRecipients: [],
      }
    );
  });

  const [extraRecipientsText, setExtraRecipientsText] = useState(
    () => (config.emailReportConfig?.extraRecipients || []).join('\n')
  );

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (config.emailReportConfig) {
      setLocalConfig(config.emailReportConfig);
      setExtraRecipientsText((config.emailReportConfig.extraRecipients || []).join('\n'));
    }
  }, [config.emailReportConfig]);

  const handleToggleTargetRole = (role: 'gestor_suporte' | 'gestor_qualidade' | 'admin') => {
    setLocalConfig(prev => {
      const current = prev.targetRoleRecipients || [];
      const updated = current.includes(role)
        ? current.filter(r => r !== role)
        : [...current, role];
      return { ...prev, targetRoleRecipients: updated };
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const parsedExtras = extraRecipientsText
        .split(/[\n,;]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

      const updatedConfig: EmailReportConfig = {
        ...localConfig,
        autoDispatchEnabled: false,
        extraRecipients: parsedExtras,
      };

      await saveConfig({
        ...config,
        emailReportConfig: updatedConfig,
      });

      setLocalConfig(updatedConfig);
      toast.success('Configurações de e-mail e relatórios salvas com sucesso!');
    } catch (err: unknown) {
      console.error('[EmailConfigManagement] Erro ao salvar:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!userData?.email) {
      toast.error('Não foi possível identificar o e-mail do seu usuário para o teste.');
      return;
    }
    setTesting(true);
    try {
      if (isMockMode || !supabase) {
        await new Promise(r => setTimeout(r, 800));
        toast.success(`[Simulação] E-mail de teste enviado com sucesso para ${userData.email}!`);
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'executive_report',
          recipients: [userData.email],
          subject: `[TESTE] ${localConfig.subjectTemplate.replace('{{team}}', 'Equipe Demonstração').replace('{{period}}', 'Mês Vigente')}`,
          teamTitle: 'Equipe Demonstração',
          periodLabel: 'Período Vigente (Teste)',
          customMessage: 'Este é um e-mail de teste disparado a partir das Configurações de Relatórios Executivos do QualiTrack.',
          kpiSummary: {
            avgScore: 92.5,
            targetScore: config.targetScore || 75,
            totalAudits: 45,
            criticalRate: 2.2,
          },
          reportNotes: 'Disparo de homologação validando layout responsivo e entrega SMTP.',
          senderName: localConfig.senderName || 'QualiTrack - Gestão da Qualidade',
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Falha ao enviar e-mail de teste.');
      }

      toast.success(`E-mail de teste disparado com sucesso para ${userData.email}! Verifique sua caixa de entrada.`);
    } catch (err: unknown) {
      console.error('[EmailConfigManagement] Erro no teste:', err);
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar e-mail de teste.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-card border border-surface-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-extrabold text-brand-primary">
              Configurações de E-mails & Relatórios Executivos
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-surface-subtle text-brand-muted border border-surface-border">
              Envio manual disponível
            </span>
          </div>
          <p className="text-xs text-brand-muted leading-relaxed">
            Configure o nome e o assunto dos relatórios enviados manualmente pelo sistema.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="secondary"
            onClick={handleSendTestEmail}
            disabled={testing || saving}
            className="flex-1 sm:flex-none text-xs font-bold flex items-center justify-center gap-1.5 min-h-[40px]"
            title={`Enviar relatório modelo para ${userData?.email || 'seu e-mail'}`}
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Testando...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Teste</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={() => handleSave()}
            disabled={saving || testing}
            className="flex-1 sm:flex-none text-xs font-bold flex items-center justify-center gap-1.5 min-h-[40px] bg-brand-accent text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Configurações</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bloco 1: Identidade do Remetente */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-surface-border">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary">
                Identidade do Remetente Institucional
              </h3>
              <p className="text-[11px] text-brand-muted">
                Nome e layout exibidos no cabeçalho dos e-mails
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
                Nome do Remetente
              </label>
              <input
                type="text"
                value={localConfig.senderName}
                onChange={e => setLocalConfig(prev => ({ ...prev, senderName: e.target.value }))}
                placeholder="Ex: QualiTrack - Gestão da Qualidade"
                className="w-full text-xs px-3 py-2 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary focus:outline-none focus:border-brand-accent transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
                E-mail de resposta personalizado — indisponível
              </label>
              <input
                type="email"
                disabled
                value={localConfig.senderEmail}
                onChange={e => setLocalConfig(prev => ({ ...prev, senderEmail: e.target.value }))}
                placeholder="Ex: qualidade@empresa.com.br (opcional)"
                className="w-full text-xs px-3 py-2 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary focus:outline-none focus:border-brand-accent transition-colors"
              />
              <span className="text-[10px] text-brand-muted mt-1 block">
                Os envios usam o remetente institucional configurado. Este campo ainda não altera o endereço de resposta.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
                Modelo de Assunto Padrão
              </label>
              <input
                type="text"
                value={localConfig.subjectTemplate}
                onChange={e => setLocalConfig(prev => ({ ...prev, subjectTemplate: e.target.value }))}
                placeholder="[QualiTrack] Relatório de Qualidade · {{team}} ({{period}})"
                className="w-full text-xs px-3 py-2 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary focus:outline-none focus:border-brand-accent transition-colors font-mono"
              />
              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-brand-muted">
                <Info className="w-3 h-3 text-brand-accent shrink-0" />
                <span>
                  Variáveis dinâmicas suportadas: <code className="text-brand-primary bg-surface-subtle px-1 rounded">{'{{team}}'}</code> e <code className="text-brand-primary bg-surface-subtle px-1 rounded">{'{{period}}'}</code>
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Bloco 2: Disparo Automático Agendado */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary">
                  Envio Automático Agendado
                </h3>
                <p className="text-[11px] text-brand-muted">
                  Ainda não disponível. Use o envio manual no relatório executivo.
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={false}
                disabled
                aria-label="Envio automático ainda não disponível"
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-surface-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <fieldset disabled className="space-y-3 opacity-60">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
                  Frequência
                </label>
                <select
                  disabled={!localConfig.autoDispatchEnabled}
                  value={localConfig.frequency}
                  onChange={e => setLocalConfig(prev => ({ ...prev, frequency: e.target.value as 'weekly' | 'monthly' }))}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary focus:outline-none focus:border-brand-accent transition-colors"
                >
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
                  Horário de Disparo
                </label>
                <input
                  type="time"
                  disabled={!localConfig.autoDispatchEnabled}
                  value={localConfig.dispatchTime}
                  onChange={e => setLocalConfig(prev => ({ ...prev, dispatchTime: e.target.value }))}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary focus:outline-none focus:border-brand-accent transition-colors"
                />
              </div>
            </div>

            {localConfig.frequency === 'weekly' ? (
              <div>
                <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
                  Dia da Semana
                </label>
                <select
                  disabled={!localConfig.autoDispatchEnabled}
                  value={localConfig.dayOfWeek}
                  onChange={e => setLocalConfig(prev => ({ ...prev, dayOfWeek: Number(e.target.value) }))}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary focus:outline-none focus:border-brand-accent transition-colors"
                >
                  {DAYS_OF_WEEK.map(d => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
                  Dia do Mês
                </label>
                <select
                  disabled={!localConfig.autoDispatchEnabled}
                  value={localConfig.dayOfMonth}
                  onChange={e => setLocalConfig(prev => ({ ...prev, dayOfMonth: Number(e.target.value) }))}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary focus:outline-none focus:border-brand-accent transition-colors"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>
                      Dia {day} de cada mês
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
        </Card>
      </div>

      {/* Bloco 3: Destinatários Padrão do Envio Automático */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-surface-border">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary">
              Destinatários do Relatório Automático
            </h3>
            <p className="text-[11px] text-brand-muted">
              Preferências para uso futuro. Nenhum envio automático será realizado.
            </p>
          </div>
        </div>

        <fieldset disabled className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-subtle border border-surface-border cursor-pointer hover:border-brand-accent/50 transition-colors">
            <input
              type="checkbox"
              checked={(localConfig.targetRoleRecipients || []).includes('gestor_suporte')}
              onChange={() => handleToggleTargetRole('gestor_suporte')}
              className="mt-0.5 rounded text-brand-accent focus:ring-brand-accent"
            />
            <div>
              <span className="text-xs font-bold text-brand-primary block">
                Gestores de Suporte
              </span>
              <span className="text-[10px] text-brand-muted block">
                Recebem o relatório individual da equipe que gerenciam
              </span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-subtle border border-surface-border cursor-pointer hover:border-brand-accent/50 transition-colors">
            <input
              type="checkbox"
              checked={(localConfig.targetRoleRecipients || []).includes('gestor_qualidade')}
              onChange={() => handleToggleTargetRole('gestor_qualidade')}
              className="mt-0.5 rounded text-brand-accent focus:ring-brand-accent"
            />
            <div>
              <span className="text-xs font-bold text-brand-primary block">
                Gestores de Qualidade
              </span>
              <span className="text-[10px] text-brand-muted block">
                Recebem cópia de alinhamento com visão global
              </span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-subtle border border-surface-border cursor-pointer hover:border-brand-accent/50 transition-colors">
            <input
              type="checkbox"
              checked={(localConfig.targetRoleRecipients || []).includes('admin')}
              onChange={() => handleToggleTargetRole('admin')}
              className="mt-0.5 rounded text-brand-accent focus:ring-brand-accent"
            />
            <div>
              <span className="text-xs font-bold text-brand-primary block">
                Administradores
              </span>
              <span className="text-[10px] text-brand-muted block">
                Acompanhamento executivo de toda a operação
              </span>
            </div>
          </label>
        </fieldset>

        <div>
          <label className="block text-[11px] font-bold text-brand-primary mb-1 uppercase tracking-wider">
            E-mails Adicionais de Liderança (Lista de Distribuição)
          </label>
          <textarea
            disabled
            rows={3}
            value={extraRecipientsText}
            onChange={e => setExtraRecipientsText(e.target.value)}
            placeholder="diretoria@empresa.com.br&#10;coordenacao@empresa.com.br"
            className="w-full text-xs p-3 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent transition-colors font-mono resize-none"
          />
          <span className="text-[10px] text-brand-muted mt-1 block">
            Lista reservada para o agendamento futuro. Selecione os destinatários a cada envio manual.
          </span>
        </div>
      </Card>
    </div>
  );
}
