# PRD Master — QualiTrack

## 1. Visão do Produto

**QualiTrack** é um sistema de gestão de qualidade para operações de suporte ao cliente. Permite que equipes de qualidade avaliem a performance de atendentes através de monitorias estruturadas, com fluxo de contestação, prazos de ação automatizados e dashboards analíticos por perfil.

## 2. Problema

Centros de suporte precisam:
- Avaliar a qualidade do atendimento de forma padronizada
- Garantir que agentes revisem suas avaliações dentro de prazos
- Permitir contestação justa com múltiplas instâncias
- Fornecer visibilidade de performance para diferentes stakeholders
- Configurar metas e faixas de qualidade de forma flexível

## 3. Público-Alvo

| Persona | Role | Necessidade Principal |
|---|---|---|
| Monitor de Qualidade | `qualidade` | Criar monitorias, reavaliar contestações |
| Agente de Atendimento | `suporte` | Revisar monitorias, contestar avaliações |
| Supervisor de Atendimento | `gestor_suporte` | Acompanhar equipe, escalar contestações |
| Supervisor de Qualidade | `gestor_qualidade` | Visão global, configurar metas |
| Administrador | `admin` | Gerenciar usuários, equipes, formulários |

## 4. Features Principais

### 4.1 Autenticação e Acesso
- Login com email/senha (Supabase Auth)
- Solicitação de acesso self-service
- Convite administrativo com e-mail
- Recuperação de senha
- Aprovação/rejeição de solicitações

### 4.2 Monitorias (Core)
- Formulários de avaliação configuráveis (pilares + critérios + pesos)
- Criação em 4 etapas (stepper): Dados → Pilar → Resumo → Salvar
- **Seleção Agente↔Equipe com vinculação protegida**: campos filtram listas um do outro, nunca limpam automaticamente; troca incompatível bloqueada com toast
- **Type-ahead em selects**: digitar no dropdown filtra opções em tempo real (sem campo de busca)
- Cálculo automático de score com pesos e NA
- Erros críticos zeram a nota (0%)
- Fluxo de contestação multi-nível (agente → auditor → gestor suporte → gestor qualidade)
- Prazos de ação com horário comercial e feriados
- Histórico completo de todas as ações (audit trail)
- Reavaliação com comparativo de scores

### 4.3 Dashboard Analytics
- 5 dashboards diferentes (um por perfil)
- Filtros globais: data, equipe, agente, auditor, status, canal
- Widgets: StatCards, TrendChart, DistributionChart, RankingWidget, etc.
- Média global vs. média filtrada
- Proteção de identidade: agentes veem "Equipe de Qualidade" (anônimo)

### 4.4 Administração
- CRUD de Usuários com convite via Supabase
- CRUD de Equipes
- Editor de Formulários (pilares + critérios + pesos + erros críticos)
- Gestão de Solicitações de Acesso

### 4.5 Configuração de Qualidade
- Faixas de classificação (Excelente ≥ X%, Aceitável ≥ Y%, Ruim < Y%)
- Meta de desempenho (target %)
- Prazo de ação por etapa (em horas úteis)
- Horário comercial configurável
- Feriados com recálculo automático de deadlines

## 5. Regras de Negócio Críticas

### Score
- Score = Σ(pontos_obtidos × peso_pilar) / Σ(pontos_possíveis × peso_pilar) × 100
- Critérios marcados como N/A são excluídos do cálculo
- Se qualquer erro crítico é marcado → Score = 0%

### Prazo de Ação (Action Deadline)
- Prazos calculados em **horas úteis** (horário comercial)
- Fins de semana e feriados não contam
- Vencimento do prazo → resolução automática (cron job)
- Qualidade perde prazo → nota vira 100%
- Suporte perde prazo → nota mantida

### RBAC (Visibilidade)
- `suporte` → vê apenas suas monitorias + equipe
- `qualidade` → vê apenas monitorias que criou
- `gestor_suporte` → vê monitorias das suas equipes
- `gestor_qualidade` / `admin` → vê tudo

## 6. Métricas de Sucesso
- Tempo médio de resolução de monitorias (dentro do prazo)
- Taxa de contestação
- Score médio por equipe/agente
- Volume de monitorias por auditor

## 7. Roadmap Futuro (Não implementado)
- [ ] Integração com Gemini AI para sugestões de feedback
- [ ] Exportação de relatórios (PDF/Excel)
- [ ] Notificações push/email para prazo próximo do vencimento
- [ ] Routing com URLs e deep-linking
- [ ] Testes automatizados (unit + integration)
- [ ] CI/CD pipeline
