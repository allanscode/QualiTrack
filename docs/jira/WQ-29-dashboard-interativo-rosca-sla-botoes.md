# WQ-29: Dashboards Interativos, Rosca com Indicadores, SLA Clicável e Blindagem de Botões

**Projeto:** QualiTrack (WebPosto Qualidade)  
**Board:** WQ Board 896 (Parent: DB-427 / WQ-28)  
**Status:** Concluído / Pronto para Homologação  
**Responsável:** Equipe de Qualidade & Engenharia  

---

## 🎯 Objetivo da Demanda
Entregar o pacote consolidado de otimizações de interface, interatividade total de métricas operacionais, conformidade visual estrita aos padrões desenhados (Imagem 1, Imagem 2 e Imagem 3), blindagem da navegação por eventos de deep link e fluidez nos formulários e ações de monitoria.

---

## 📋 Divisão de Tarefas & Cards Jira

### 1. WQ-29A: Drilldown Completo nos Cards Operacionais (Imagem 1)
- **Componentes:** `AdminDashboardView.tsx`, `QualityManagerDashboard.tsx`, `SupportManagerDashboard.tsx`
- **Modelos:** GPT-5.6 Terra / Sol
- **Escopo:**
  - Tornar os cards `Total`, `Total Pendentes`, `Total Reavaliações`, `Reav. Aprovadas` e `Reav. Recusadas` clicáveis com feedback visual hover (`cursor-pointer`, `active:scale-[0.99]`).
  - Abrir o `SupportDrillDownModal` com listagens filtradas exatas (`scoredMonitorias`, `pendingActionsList`, `contestedMonitorias`, `reavAcceptedList`, `reavRejectedList`).
  - Permitir busca por ticket, atendente, equipe ou protocolo dentro do modal de drilldown.

### 2. WQ-29B: Rótulos e Indicadores de Rosca nos Arcos (Imagem 2)
- **Componentes:** `DistributionChart.tsx`, `AdminDashboardView.tsx`, `QualityManagerDashboard.tsx`, `SupportManagerDashboard.tsx`
- **Modelos:** Gemini 3.8 Flash (Mid)
- **Escopo:**
  - Remoção completa da legenda inferior horizontal com quebra de linha que poluía o rodapé dos gráficos.
  - Renderização de indicadores percentuais elegantes diretamente nos arcos do Donut (`label={renderArcLabel}` e `labelLine={false}`).
  - Disposição lateral estruturada (`w-[55%]` donut e `w-[45%]` itens alinhados com dots coloridos, contadores e percentuais).

### 3. WQ-29C: Fix de Insatisfação e Tickets de Ações Expirando Clicáveis (Imagem 3)
- **Componentes:** `DistributionChart.tsx`, `AdminDashboardView.tsx`, `QualityManagerDashboard.tsx`, `SupportManagerDashboard.tsx`
- **Modelos:** GPT-5.6 Luna / Terra
- **Escopo:**
  - Remoção do seletor dropdown `PIZZA v` no card `Insatisfação — Visão da Qualidade`.
  - Transformação das linhas de SLA do componente `SlaCountdownItem` em botões interativos acessíveis (com hover, chevron e enter/space).
  - Emissão do evento `qualitrack:focus_monitoria` para abertura imediata do chamado.

### 4. WQ-29D: Deep Linking Persistente e Ações de Monitoria Blindadas
- **Componentes:** `App.tsx`, `MonitoriaList.tsx`, `MonitoriaDetails.tsx`, `MonitoriaForm.tsx`
- **Modelos:** GPT-5.6 Sol / Terra
- **Escopo:**
  - Solução de race condition no `App.tsx`: persistência de `focusMonitoriaTarget` para garantir que o clique no Dashboard abra o card no `MonitoriaList` mesmo antes do primeiro render da aba.
  - Liberação do botão "Editar Avaliação" em `MonitoriaDetails.tsx` com `_adminEdit: true` para perfis `admin` e `gestor_qualidade`.
  - Fechamento automático de detalhes no `MonitoriaList.tsx` após confirmação no `actionModal`.
  - Inclusão do botão explícito "Fechar Visualização" no rodapé de `MonitoriaForm.tsx` no modo leitura.

### 5. WQ-29E: Revisão de Código, Espaçamentos e Blindagem de Segurança
- **Componentes:** `AGENTS.md`, `orca-prompt-creator.md`, suite vitest e testes de segurança RLS
- **Modelos:** Gemini 3.8 High / GPT-5.6 Luna
- **Escopo:**
  - Adequação das diretrizes de orquestração para permitir workers coordenados e sem conflitos.
  - Validação estrita de tipos com `tsc --noEmit` (0 erros).
  - Execução da suíte completa de 209 testes unitários e 9 testes de segurança de permissões RLS.
