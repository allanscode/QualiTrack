import React, { useState } from 'react';
import { 
  Target, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Users, 
  History, 
  Activity, 
  ClipboardCheck,
  Clock,
  LayoutGrid
} from 'lucide-react';
import Card from './ui/Card';
import StatCard from './dashboard/widgets/StatCard';
import TrendChart from './dashboard/widgets/TrendChart';
import DistributionChart from './dashboard/widgets/DistributionChart';
import RankingWidget from './dashboard/widgets/RankingWidget';
import ActionDeadlineWidget from './dashboard/widgets/ActionDeadlineWidget';
import ComparativeBarChart from './dashboard/widgets/ComparativeBarChart';
import OfensoresChart from './dashboard/widgets/OfensoresChart';

export default function CustomDashboardManagement() {
  const [selectedProfile, setSelectedProfile] = useState<'admin' | 'gestor_qualidade' | 'gestor_suporte' | 'qualidade' | 'suporte'>('admin');
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);

  // High fidelity mock datasets (no real DB data to prevent leaks)
  const mockTrendData = [
    { name: '01/05', ScoreMedio: 82.3, MeuScore: 84.5, ScoreEquipe: 81.2, MediaEquipe: 81.5 },
    { name: '05/05', ScoreMedio: 84.1, MeuScore: 83.2, ScoreEquipe: 82.5, MediaEquipe: 82.1 },
    { name: '10/05', ScoreMedio: 83.8, MeuScore: 86.1, ScoreEquipe: 83.1, MediaEquipe: 82.8 },
    { name: '15/05', ScoreMedio: 85.2, MeuScore: 87.4, ScoreEquipe: 84.8, MediaEquipe: 83.5 },
    { name: '20/05', ScoreMedio: 86.5, MeuScore: 85.9, ScoreEquipe: 85.2, MediaEquipe: 84.2 },
    { name: '25/05', ScoreMedio: 87.0, MeuScore: 88.2, ScoreEquipe: 86.1, MediaEquipe: 85.0 }
  ];

  const mockDistributionData = [
    { name: 'Excelente (90-100%)', value: 35, color: '#10B981' },
    { name: 'Aceitável (75-89%)', value: 18, color: '#3B82F6' },
    { name: 'Atenção (50-74%)', value: 5, color: '#F59E0B' },
    { name: 'Ruim (0-49%)', value: 2, color: '#EF4444' }
  ];

  const mockPrecisionData = [
    { name: 'Estáveis', value: 54, color: '#10B981' },
    { name: 'Reavaliadas', value: 6, color: '#F59E0B' }
  ];

  const mockTopAgents = [
    { id: '1', name: 'Ana Silva', score: 96.5, count: 12 },
    { id: '2', name: 'Bruno Costa', score: 94.2, count: 10 },
    { id: '3', name: 'Carla Souza', score: 92.8, count: 11 },
    { id: '4', name: 'Daniel Oliveira', score: 91.5, count: 14 },
    { id: '5', name: 'Eduarda Lima', score: 90.1, count: 9 }
  ];

  const mockBottomAgents = [
    { id: '6', name: 'Fabio Santos', score: 71.2, count: 8 },
    { id: '7', name: 'Gabriela Melo', score: 72.5, count: 11 },
    { id: '8', name: 'Hugo Rocha', score: 73.8, count: 9 },
    { id: '9', name: 'Isabela Cruz', score: 74.2, count: 10 },
    { id: '10', name: 'João Alves', score: 74.8, count: 12 }
  ];

  const mockAuditorRanking = [
    { id: '11', name: 'Mariana Santos', score: 86.5, count: 42 },
    { id: '12', name: 'Rodrigo Lima', score: 85.2, count: 38 },
    { id: '13', name: 'Amanda Costa', score: 87.1, count: 35 },
    { id: '14', name: 'Felipe Souza', score: 84.8, count: 31 },
    { id: '15', name: 'Juliana Oliveira', score: 86.0, count: 28 }
  ];

  const mockComparativeData = [
    { name: 'Seg', meuVolume: 5, mediaEquipe: 4.2 },
    { name: 'Ter', meuVolume: 6, mediaEquipe: 4.5 },
    { name: 'Qua', meuVolume: 4, mediaEquipe: 4.0 },
    { name: 'Qui', meuVolume: 7, mediaEquipe: 4.8 },
    { name: 'Sex', meuVolume: 5, mediaEquipe: 4.3 }
  ];

  const mockReevaluationsByAuditor = [
    { name: 'Mariana Santos', Aceitas: 4, Recusadas: 2 },
    { name: 'Rodrigo Lima', Aceitas: 2, Recusadas: 5 },
    { name: 'Amanda Costa', Aceitas: 3, Recusadas: 1 },
    { name: 'Felipe Souza', Aceitas: 1, Recusadas: 3 }
  ];

  const mockContestationsApproved = [
    { id: '1', name: 'Ana Silva', count: 4 },
    { id: '2', name: 'Bruno Costa', count: 2 },
    { id: '3', name: 'Daniel Oliveira', count: 1 }
  ];

  const mockContestationsRejected = [
    { id: '6', name: 'Fabio Santos', count: 5 },
    { id: '7', name: 'Gabriela Melo', count: 3 },
    { id: '8', name: 'João Alves', count: 2 }
  ];

  // Forms and Monitorias structures for OfensoresChart calculation
  const mockForms = [
    {
      id: 'f1',
      sections: [
        {
          questions: [
            { id: 'q1', text: 'Conhecimento Técnico e Permissionamento' },
            { id: 'q2', text: 'Postura e Empatia no Atendimento' },
            { id: 'q3', text: 'Resolução no Primeiro Contato (FCR)' },
            { id: 'q4', text: 'Confirmação de Dados Cadastrais' },
            { id: 'q5', text: 'Segurança e Confidencialidade' }
          ]
        }
      ]
    }
  ] as any[];

  const mockMonitoriasOfensores = [
    { answers: { q1: 'NAO', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
    { answers: { q1: 'NAO', q2: 'NAO', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
    { answers: { q1: 'NAO', q2: 'NAO', q3: 'NAO', q4: 'SIM', q5: 'SIM' } },
    { answers: { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO', q5: 'SIM' } },
    { answers: { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'NAO' } }
  ] as any[];

  // Deadlines mock list
  const mockMonitoriasDeadlines = [
    {
      id: 'm1',
      display_id: '001',
      ticket_id: '10239',
      status: 'pendente_revisao',
      evaluator_name: 'Mariana Santos',
      created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      action_deadline_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
    },
    {
      id: 'm2',
      display_id: '002',
      ticket_id: '10482',
      status: 'em_contestacao',
      evaluated_name: 'Ana Silva',
      created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      action_deadline_at: new Date(Date.now() + 14 * 3600 * 1000).toISOString()
    }
  ] as any[];

  return (
    <div className="space-y-6">
      {/* Title & Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-card rounded-3xl border border-surface-border p-6 shadow-premium">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-brand-accent animate-pulse" />
            <h1 className="text-xl font-black text-brand-primary uppercase tracking-widest">
              Customizar Dashboards
            </h1>
          </div>
          <p className="text-xs text-brand-muted font-bold uppercase tracking-wider">
            Personalize as descrições explicativas dos blocos e gráficos por perfil de acesso.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
            Perfil de Acesso:
          </span>
          <select
            value={selectedProfile}
            onChange={(e) => {
              setSelectedProfile(e.target.value as any);
              setActiveEditingId(null);
            }}
            className="h-10 px-4 rounded-xl border border-surface-border bg-surface-bg text-xs font-bold text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/50 cursor-pointer"
          >
            <option value="admin">Executivo (Administrador)</option>
            <option value="gestor_qualidade">Gestor de Qualidade</option>
            <option value="gestor_suporte">Gestor de Suporte</option>
            <option value="qualidade">Visão Monitor</option>
            <option value="suporte">Visão Agente</option>
          </select>
        </div>
      </div>

      {/* Guide Banner */}
      <div className="bg-brand-accent/5 border border-brand-accent/20 rounded-2xl p-4 flex items-start gap-3">
        <span className="relative flex h-2 w-2 mt-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-accent"></span>
        </span>
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">
            Instruções de Customização:
          </h4>
          <p className="text-[11px] text-brand-muted font-medium leading-relaxed">
            O painel abaixo é uma simulação segura em tempo real (dados fictícios de alta fidelidade). Passe o mouse sobre o ícone nativo de qualquer cartão ou gráfico para ver a explicação atual e clique diretamente no ícone para editá-la. O limite máximo é de 35 caracteres. Suas alterações se aplicam instantaneamente a todos os usuários reais daquele perfil de acesso.
          </p>
        </div>
      </div>

      {/* Dynamic Wireframe Grid rendering according to the selected profile */}
      <div className="space-y-6">
        {selectedProfile === 'admin' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Média Geral"
                value="85.42%"
                sub="Performance global da operação"
                good={true}
                icon={<Target />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Total Pendentes"
                value="4"
                sub="Ações em todos os perfis"
                good={false}
                icon={<AlertTriangle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Usuários Online"
                value="8"
                sub="Pessoas conectadas agora"
                good={true}
                icon={<Activity />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Tendência"
                value="+2.45%"
                sub="Evolução global"
                good={true}
                icon={<TrendingUp />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Reavaliações"
                value="12"
                sub="Total de contestações"
                good={true}
                icon={<History />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Taxa Reversão"
                value="8.33%"
                sub="Qualidade das monitorias"
                good={true}
                icon={<Target />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Reav. Aprovadas"
                value="1"
                sub="Contestações procedentes"
                good={true}
                icon={<CheckCircle2 />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Reav. Recusadas"
                value="11"
                sub="Contestações improcedentes"
                good={true}
                icon={<XCircle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[380px]">
                <TrendChart
                  title="Performance Histórica"
                  subtitle="Visão administrativa de score global"
                  data={mockTrendData}
                  dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: '#10B981' }]}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[380px]">
                <DistributionChart
                  title="Curva de Qualidade"
                  data={mockDistributionData}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-[420px] lg:col-span-1">
                <RankingWidget
                  title="Melhores Suportes"
                  subtitle="Top 5 por score médio"
                  data={mockTopAgents}
                  type="score"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[420px] lg:col-span-1">
                <RankingWidget
                  title="Maiores Ofensores"
                  subtitle="Pontos de melhoria"
                  data={mockBottomAgents}
                  type="score"
                  icon={<AlertTriangle />}
                  accent="text-functional-error"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[420px] lg:col-span-1">
                <RankingWidget
                  title="Volume por Auditor"
                  subtitle="Engajamento na plataforma"
                  data={mockAuditorRanking}
                  type="count"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="h-[420px]">
              <OfensoresChart 
                title="Maiores Ofensores"
                subtitle="Critérios com mais falhas no período"
                monitorias={mockMonitoriasOfensores} 
                forms={mockForms}
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
          </div>
        )}

        {selectedProfile === 'gestor_qualidade' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Média Geral"
                value="85.42%"
                sub="Meta atingida"
                good={true}
                icon={<Target />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Minhas Ações"
                value="1"
                sub="Aguardando sua decisão"
                good={false}
                icon={<AlertTriangle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Monitorias"
                value="85"
                sub="Volume total do período"
                good={true}
                icon={<ClipboardCheck />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Tendência"
                value="+2.45%"
                sub="Evolução no período"
                good={true}
                icon={<TrendingUp />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Total Pendentes"
                value="3"
                sub="Ações abertas no sistema"
                good={false}
                icon={<AlertTriangle />}
                accent="text-functional-warning"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Taxa de Reversão"
                value="8.33%"
                sub="Contestações Procedentes"
                good={true}
                icon={<Target />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Reav. Aceitas"
                value="1"
                sub="Nota alterada"
                good={true}
                icon={<CheckCircle2 />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Reav. Negadas"
                value="11"
                sub="Nota mantida"
                good={true}
                icon={<XCircle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[380px]">
                <TrendChart
                  title="Evolução de Scores"
                  subtitle="Visão tática de score médio"
                  data={mockTrendData}
                  dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: '#3B82F6' }]}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[380px]">
                <DistributionChart
                  title="Curva de Qualidade"
                  data={mockDistributionData}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-[420px]">
                <RankingWidget
                  title="Melhores Suportes"
                  subtitle="Top 5 por score médio"
                  data={mockTopAgents}
                  type="score"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[420px]">
                <RankingWidget
                  title="Oportunidades de Suporte"
                  subtitle="Pontos de atenção para coaching"
                  data={mockBottomAgents}
                  type="score"
                  icon={<AlertTriangle />}
                  accent="text-functional-error"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[420px]">
                <ComparativeBarChart
                  title="Reavaliações por Avaliador"
                  subtitle="Taxa de contestação aceita vs recusada"
                  data={mockReevaluationsByAuditor}
                  dataKeys={[
                    { key: 'Aceitas', name: 'Aceitas', color: '#10B981' },
                    { key: 'Recusadas', name: 'Recusadas', color: '#EF4444' }
                  ]}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-[400px]">
                <DistributionChart
                  title="Precisão da Qualidade"
                  data={mockPrecisionData}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[400px]">
                <RankingWidget
                  title="Contestações Aceitas (Top 5)"
                  subtitle="Principais agentes com notas alteradas"
                  data={mockContestationsApproved}
                  type="count"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[400px]">
                <RankingWidget
                  title="Contestações Negadas (Top 5)"
                  subtitle="Principais agentes com notas mantidas"
                  data={mockContestationsRejected}
                  type="count"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="h-[420px]">
              <OfensoresChart 
                title="Maiores Ofensores"
                subtitle="Critérios com mais falhas no período"
                monitorias={mockMonitoriasOfensores} 
                forms={mockForms}
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
          </div>
        )}

        {selectedProfile === 'gestor_suporte' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Média Equipe"
                value="84.20%"
                sub="Performance média do grupo"
                good={true}
                icon={<Target />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Minhas Ações"
                value="1"
                sub="Aguardando sua decisão"
                good={false}
                icon={<AlertTriangle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Pendentes Agente"
                value="2"
                sub="Aguardando ciente do agente"
                good={false}
                icon={<Clock />}
                accent="text-functional-warning"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Tendência"
                value="+1.85%"
                sub="Evolução da equipe"
                good={true}
                icon={<TrendingUp />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Reavaliações"
                value="8"
                sub="Total de contestações"
                good={true}
                icon={<History />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Taxa Reversão"
                value="12.50%"
                sub="Qualidade das monitorias"
                good={true}
                icon={<Target />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Reav. Aprovadas"
                value="1"
                sub="Contestações procedentes"
                good={true}
                icon={<CheckCircle2 />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Reav. Recusadas"
                value="7"
                sub="Contestações improcedentes"
                good={true}
                icon={<XCircle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[380px]">
                <TrendChart
                  title="Evolução do Score"
                  subtitle="Histórico de notas médias das equipes"
                  data={mockTrendData}
                  dataKeys={[{ key: 'ScoreEquipe', name: 'Score Equipe', color: '#10B981' }]}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[380px]">
                <ActionDeadlineWidget
                  title="Ações Expirando"
                  monitorias={mockMonitoriasDeadlines}
                  targetStatus={['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte']}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="h-[420px] lg:col-span-1">
                <RankingWidget
                  title="Melhores Resultados"
                  subtitle="Top agentes por score"
                  data={mockTopAgents}
                  type="score"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[420px] lg:col-span-1">
                <RankingWidget
                  title="Oportunidades de Melhoria"
                  subtitle="Apoio necessário"
                  data={mockBottomAgents}
                  type="score"
                  icon={<AlertTriangle />}
                  accent="text-functional-error"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[420px] lg:col-span-1">
                <RankingWidget
                  title="Contestações Procedentes"
                  subtitle="Mais procedências"
                  data={mockContestationsApproved}
                  type="count"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[420px] lg:col-span-1">
                <RankingWidget
                  title="Contestações Improcedentes"
                  subtitle="Mais improcedências"
                  data={mockContestationsRejected}
                  type="count"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>
          </div>
        )}

        {selectedProfile === 'qualidade' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard
                title="Meu Volume"
                value="48"
                sub="no período"
                good={true}
                icon={<ClipboardCheck />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Nota Média"
                value="86.15%"
                sub="Média das notas aplicadas"
                good={true}
                icon={<Target />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Pendente Ação"
                value="2"
                sub="Aguardando reanálise"
                good={false}
                icon={<AlertTriangle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard
                title="Reav. Aceitas"
                value="3"
                sub="Procedentes (Nota alterada)"
                good={true}
                icon={<CheckCircle2 />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Reav. Recusadas"
                value="5"
                sub="Improcedentes (Nota mantida)"
                good={true}
                icon={<XCircle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Total Reav Recebidas"
                value="8"
                sub="Total de contestações"
                good={true}
                icon={<History />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[340px]">
                <ComparativeBarChart
                  title="Volumetria Diária"
                  subtitle="Comparativo com a média da equipe"
                  data={mockComparativeData}
                  dataKeys={[
                    { key: 'meuVolume', name: 'Meu Volume', color: '#3B82F6' },
                    { key: 'mediaEquipe', name: 'Média Equipe', color: '#94a3b8' }
                  ]}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[340px]">
                <StatCard
                  title="Auditorias Pendentes"
                  value="1"
                  sub="Aguardando Conclusão"
                  good={false}
                  icon={<AlertTriangle />}
                  accent="text-functional-warning"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-[400px]">
                <DistributionChart
                  title="Minha Curva de Qualidade"
                  data={mockDistributionData}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[400px]">
                <DistributionChart
                  title="Precisão da Qualidade"
                  data={mockPrecisionData}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="h-[400px]">
                <ActionDeadlineWidget
                  title="Minhas Reavaliações Pendentes"
                  monitorias={mockMonitoriasDeadlines}
                  targetStatus="em_contestacao"
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="h-[420px]">
              <OfensoresChart 
                title="Maiores Ofensores"
                subtitle="Itens que você mais despontuou"
                monitorias={mockMonitoriasOfensores} 
                forms={mockForms}
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
          </div>
        )}

        {selectedProfile === 'suporte' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Minha Média"
                value="88.20%"
                sub="Excelente"
                good={true}
                icon={<Target />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Média Equipe"
                value="83.50%"
                sub="Acima da média"
                good={true}
                icon={<Users />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Média Global"
                value="82.80%"
                sub="Empresa"
                good={true}
                icon={<Users />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Tendência"
                value="+3.2%"
                sub="Evolução no período"
                good={true}
                icon={<TrendingUp />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard
                title="Monitorias"
                value="15"
                sub="Total no período"
                good={true}
                icon={<ClipboardCheck />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Total Pendentes"
                value="1"
                sub="Aguardando sua ação"
                good={false}
                icon={<AlertTriangle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Solicitadas"
                value="2"
                sub="Contestações abertas"
                good={true}
                icon={<ClipboardCheck />}
                accent="text-slate-500"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Aprovadas"
                value="1"
                sub="Nota Alterada"
                good={true}
                icon={<CheckCircle2 />}
                accent="text-functional-success"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
              <StatCard
                title="Recusadas"
                value="1"
                sub="Nota Mantida"
                good={false}
                icon={<XCircle />}
                accent="text-functional-error"
                isCustomizing={true}
                profile={selectedProfile}
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[380px]">
                <TrendChart
                  title="Evolução Comparativa"
                  subtitle="Meu Score vs Média da Equipe"
                  data={mockTrendData}
                  dataKeys={[
                    { key: 'MeuScore', name: 'Meu Score', color: '#10B981' },
                    { key: 'MediaEquipe', name: 'Média Equipe', color: '#3B82F6' }
                  ]}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="lg:col-span-1 h-[380px]">
                <DistributionChart
                  title="Minha Classificação"
                  data={mockDistributionData}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-[420px]">
                <OfensoresChart
                  title="Meus Ofensores"
                  subtitle="Critérios onde você mais falhou"
                  monitorias={mockMonitoriasOfensores}
                  forms={mockForms}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
              <div className="lg:col-span-1 h-[420px]">
                <ActionDeadlineWidget
                  title="Aguardando Minha Ação"
                  monitorias={mockMonitoriasDeadlines}
                  targetStatus={['pendente_revisao', 'contestacao_negada']}
                  isCustomizing={true}
                  profile={selectedProfile}
                  activeEditingId={activeEditingId}
                  setActiveEditingId={setActiveEditingId}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
