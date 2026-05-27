# PRD Master — QualiTrack

## 1. Visão do Produto

**QualiTrack** é um sistema de gestão de qualidade para operações de suporte ao cliente. Permite que equipes de qualidade avaliem a performance de atendentes através de monitorias estruturadas, com fluxo de contestação multi-nível, prazos de ação automatizados e dashboards analíticos por perfil.

## 2. Problema

Centros de suporte precisam:
- Avaliar a qualidade do atendimento de forma padronizada
- Garantir que agentes revisem suas avaliações dentro de prazos
- Permitir contestação justa com múltiplas instâncias de recurso
- Fornecer visibilidade de performance para diferentes stakeholders
- Configurar metas e faixas de qualidade de forma flexível
- Calcular prazos apenas em horário comercial (justo para todas as partes)

## 3. Público-Alvo

| Persona | Role | Necessidade Principal |
|---|---|---|
| Monitor de Qualidade | `qualidade` | Criar monitorias, reavaliar contestações |
| Agente de Atendimento | `suporte` | Revisar monitorias, contestar avaliações |
| Supervisor de Atendimento | `gestor_suporte` | Acompanhar equipe, escalar contestações |
| Supervisor de Qualidade | `gestor_qualidade` | Visão global, configurar metas e faixas |
| Administrador | `admin` | Gerenciar usuários, equipes, formulários, sistema |

## 4. Features Principais

### 4.1 Autenticação e Acesso
- Login com email/senha (Supabase Auth)
- Solicitação de acesso self-service
- Convite administrativo com e-mail (Edge Function)
- Recuperação de senha
- Aprovação/rejeição de solicitações
- Gerenciamento de sessão (idle timeout, absolute timeout, proactive refresh)
- Detecção de hash para recovery/invite flows

### 4.2 Monitorias (Core)
- Formulários de avaliação configuráveis (pilares + critérios + pesos + erros críticos)
- Criação em 4 etapas (stepper): Dados → Pilar → Resumo → Salvar
- **Seleção Agente↔Equipe com vinculação protegida**: campos filtram listas um do outro, nunca limpam automaticamente; troca incompatível bloqueada com toast
- **CustomSelect com type-ahead**: input inline no dropdown filtra opções em tempo real
- Cálculo automático de score com pesos e NA
- Erros críticos zeram a nota (0%)
- Fluxo de contestação multi-nível (agente → auditor → gestor suporte → gestor qualidade)
- Prazos de ação com horário comercial e feriados
- Histórico completo de todas as ações (audit trail)
- Reavaliação com comparativo de scores
- Auto-finalização por prazo expirado (cron job)
- `resolution_type`: human | automatic
- `contestation_result`: approved | rejected | pending
- Campos de insatisfação (cliente + qualidade)

### 4.3 Dashboard Analytics
- 5 dashboards diferentes (um por perfil)
- Filtros globais: data, equipe, agente, auditor, status, canal
- RBAC nos filtros (cada role vê filtros e dados diferentes)
- 8 widgets: StatCard, TrendChart, DistributionChart, RankingWidget, RecentAuditsTable, PrecisionChart, TopOffendersChart, PendingActionsTable
- Média global vs. média filtrada
- Proteção de identidade: agentes veem "Equipe de Qualidade" (anônimo)
- Ícones por categoria semântica (Score, Volume, Pendência, Aprovação, Rejeição, Tendência, Info)
- Cores de gráfico via `chartColors.ts` (runtime CSS vars, light/dark)
- Presença online (local + Supabase Presence)

### 4.4 Administração
- 6 sub-tabs: Usuários, Equipes, Formulários, Solicitações, Configurações, Campos Extras
- CRUD de Usuários com convite via Edge Function + `syncUserTeams()`
- CRUD de Equipes (soft-delete)
- Editor de Formulários (pilares + critérios + pesos + erros críticos, auto-save drafts)
- Gestão de Solicitações de Acesso (aprovar/rejeitar)
- Configuração de Qualidade (faixas, meta, prazos, horário comercial, feriados)
- Campos de Insatisfação (cliente + qualidade, CRUD)

### 4.5 Configuração de Qualidade
- Faixas de classificação (Excelente ≥ X%, Aceitável ≥ Y%, Ruim < Y%)
- Meta de desempenho (target %)
- Prazo de ação por etapa (em horas úteis)
- Horário comercial configurável
- Feriados com recálculo automático de deadlines
- Context Provider singleton (`useQualityConfig`)
- Recálculo em massa ao alterar config

## 5. Regras de Negócio Críticas

### Score
- Score = Σ(pontos_obtidos × peso_pilar) / Σ(pontos_possíveis × peso_pilar) × 100
- Critérios marcados como N/A são excluídos do cálculo
- Se qualquer erro crítico é marcado → Score = 0%

### Prazo de Ação (Action Deadline)
- Prazos calculados em **horas úteis** (horário comercial)
- Fins de semana e feriados não contam
- Vencimento do prazo → resolução automática (cron job a cada 5 min)
- Qualidade perde prazo → nota vira 100% (beneficia agente)
- Suporte perde prazo → nota mantida (preserva avaliação)
- `resolution_type = 'automatic'` registrado

### RBAC (Visibilidade)
- `suporte` → vê apenas suas monitorias + equipe
- `qualidade` → vê apenas monitorias que criou
- `gestor_suporte` → vê monitorias das suas equipes (fallback UUID impossível se sem equipes)
- `gestor_qualidade` / `admin` → vê tudo

### Anonimização
- `suporte` e `gestor_suporte` veem avaliador como "Equipe de Qualidade"

### N:N Usuário↔Equipe
- Relacionamento via tabela `user_teams`
- `users.team_ids` coluna removida (migration M5)
- Frontend enriquece User com `team_ids` via `enrichUserWithTeamIds()`
- Nunca enviar `team_ids` em payload da tabela `users`

## 6. Métricas de Sucesso
- Tempo médio de resolução de monitorias (dentro do prazo)
- Taxa de contestação (aprovadas vs rejeitadas)
- Score médio por equipe/agente
- Volume de monitorias por auditor
- Precisão dos monitores (notas mantidas vs reavaliadas)
- Taxa de auto-finalização por prazo expirado

## 7. Tech Stack

| Camada | Tecnologia | Versão/Detalhes |
|--------|-----------|----------------|
| Framework | React | 19.x |
| Linguagem | TypeScript | 5.8.x (strict) |
| Build | Vite | 6.x |
| Estilo | TailwindCSS | v4 (CSS-native, `@theme` blocks) |
| Animações | Motion (Framer Motion) | `motion/react` |
| Gráficos | Recharts | 3.x |
| Ícones | Lucide React | Única lib permitida |
| Notificações | Sonner | Toast notifications |
| Datas | date-fns | ptBR locale |
| Backend | Supabase | Auth + PostgreSQL + Edge Functions |
| Estado | React Context + useState | Sem Redux/Zustand |
| Roteamento | State-based (`activeTab`) | Sem react-router-dom |

## 8. Roadmap Futuro (Não implementado)
- [ ] Integração com Gemini AI para sugestões de feedback
- [ ] Exportação de relatórios (PDF/Excel)
- [ ] Notificações push/email para prazo próximo do vencimento
- [ ] Routing com URLs e deep-linking
- [ ] Testes automatizados (unit + integration)
- [ ] CI/CD pipeline
