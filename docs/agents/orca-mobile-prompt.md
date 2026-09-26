# Orca Multi-Worker Orchestration Prompt: QualiTrack Mobile Experience (WQ-30)

## 1. Visão Geral do Objetivo
Transformar a experiência do QualiTrack em uma versão mobile completa, responsiva e touch-friendly, mantendo paridade de funcionalidades e o mesmo padrão visual de alta qualidade (Design System Tailwind, dark/light theme, microinterações, zero bugs de overflow).

---

## 2. Matriz de Modelos Autorizados (Janela Estrita)
Conforme as diretrizes do projeto, a orquestração opera estritamente na janela de modelos selecionada:
- **GPT-5.6 Sol (High Tier)**: Tarefas de alta complexidade arquitetural, redesign de navegação principal (`App.tsx`), Drawer mobile e Bottom Navigation Bar.
- **GPT-5.6 Terra (Mid Tier)**: Refatoração e adaptação de formulários complexos e modais multi-step (`MonitoriaForm.tsx`, `MonitoriaDetails.tsx`, `SupportDrillDownModal.tsx`).
- **GPT-5.6 Luna (Low Tier)**: Ajustes cirúrgicos em cards, listas (`MonitoriaRow.tsx`, `FilterBar.tsx`) e densidade de toque.
- **Gemini 3.8 High**: Validação rigorosa de regressão, execução de lint, suite de testes vitest e verificação Playwright emulando viewports móveis.
- **Gemini 3.8 Mid**: Responsividade de gráficos, Bento Grid e alinhamentos de dashboards.
- **Gemini 3.8 Low**: Scripts de deploy, git sync e atualização de status no Orca CLI.

---

## 3. Divisão de Tarefas & Workers Orca

### Task WQ-30A: Navegação Mobile & App Shell (Worker: GPT-5.6 Sol)
- **Arquivo Alvo**: `src/App.tsx`, `src/index.css`
- **Escopo**:
  1. Implementar **Bottom Navigation Bar** fixa no rodapé para telas móveis (`< 768px` / `< md`):
     - Dashboard (`activeTab === 'dashboard'`)
     - Monitorias (`activeTab === 'monitorias'`)
     - Filas de Triagem (`activeTab === 'filas'`) (oculto para role `suporte`)
     - Nova Monitoria (botão de ação rápida central para perfis autorizados)
     - Mais / Menu (abre Drawer lateral com Equipes, Aparência, Logout e Configurações)
  2. Implementar **Drawer Mobile Deslizante** com backdrop blur para substituir a sidebar expandida em smartphones.
  3. Header responsivo com padding compacto (`px-4 h-16`), avatar/perfil touch-friendly e popover de notificações adaptado a telas pequenas.
  4. Suporte a Safe Area Inset (`pb-[calc(4.5rem+env(safe-area-inset-bottom))]`) na área principal para não cobrir conteúdo.

### Task WQ-30B: Modais e Bottom Sheets Mobile (Worker: GPT-5.6 Terra)
- **Arquivos Alvo**: `src/components/MonitoriaForm.tsx`, `src/components/MonitoriaDetails.tsx`, `src/components/dashboard/widgets/SupportDrillDownModal.tsx`
- **Escopo**:
  1. `MonitoriaForm`: No mobile, transformar o diálogo central em modal full-screen (`fixed inset-0 p-0 rounded-none h-full max-h-full sm:rounded-2xl sm:p-4`), com stepper horizontal compacto e navegação inferior fixa com touch targets de 44px+.
  2. `MonitoriaDetails`: Diálogo de detalhes e timeline com scroll fluido, badges compactos e botões de ação rápida empilhados verticalmente.
  3. `SupportDrillDownModal`: Header compacto com busca, lista em cartões verticais no mobile em vez de tabela estreita, evitando quebra horizontal.

### Task WQ-30C: Filtros e Dashboards Responsivos (Worker: Gemini 3.8 Mid)
- **Arquivos Alvo**: `src/components/dashboard/FilterBar.tsx`, `src/components/dashboard/roles/*.tsx`
- **Escopo**:
  1. `FilterBar.tsx`: Presets rápidos (Dia/Mês/Ano) e seletores de data organizados com empilhamento limpo em mobile (`flex-col sm:flex-row`).
  2. Ajuste de quebra no Bento Grid: 1 coluna no mobile (`grid-cols-1`), 2 colunas em tablet (`md:grid-cols-2`), 4 em desktop.
  3. Garantir legibilidade dos gráficos de rosca e cards de micro-indicadores em telas estreitas (360px a 414px).

### Task WQ-30D: Lista de Monitorias e Linhas Touch-Friendly (Worker: GPT-5.6 Luna)
- **Arquivos Alvo**: `src/components/MonitoriaRow.tsx`, `src/components/MonitoriaList.tsx`
- **Escopo**:
  1. `MonitoriaRow.tsx`: Exibir badge de status de forma compacta em smartphones, espaçamento de toque aprimorado e suporte a gestures/toque rápido.
  2. `MonitoriaList.tsx`: Tabs de status ("Todas", "Pendentes", etc.) com scroll horizontal suave (`overflow-x-auto no-scrollbar`) e altura de linha dinâmica ou ajustada para toque.

### Task WQ-30E: Validação Mobile, E2E e Deploy Develop (Worker: Gemini 3.8 High)
- **Escopo**:
  1. Executar bateria de linter (`npm.cmd run lint`) e testes automatizados (`npm.cmd test`).
  2. Executar validação com Playwright em viewport móvel (390x844 - iPhone / Pixel).
  3. Commit semântico, push para `origin/develop` e validação do preview no Vercel.
  4. Finalização de todas as tasks na Orca CLI.

---

## 4. Diretrizes Técnicas Mandatórias
1. **Zero Quebra de Desktop**: O layout desktop atual deve permanecer 100% idêntico e funcional através dos breakpoints do Tailwind (`md:`, `lg:`).
2. **Safe Areas & Touch Targets**: Elementos clicáveis com altura mínima de 44px e padding inferior respeitando a barra de gestos do iOS/Android.
3. **Persistência & RBAC**: Todas as regras de anonimato do auditor e perfis (`suporte`, `gestor_suporte`, `qualidade`, `admin`) rigorosamente preservadas.
