# Walkthrough — Ajustes Visuais, SLA Global e Reorganização do Topo

Apresentamos o relatório consolidado dos refinamentos visuais realizados nos dashboards do QualiTrack, bem como os resultados e correções efetuadas durante a auditoria técnica do fluxo de notificações pós-login e a nova estrutura do topo do Gestor da Qualidade.

---

## 1. Reorganização de Blocos do Topo (Gestor da Qualidade)

No painel de **Gestor da Qualidade** (`QualityManagerDashboard.tsx`), os blocos superiores (StatCards) foram reorganizados para priorizar e destacar as ações decisórias de liderança com simetria perfeita:

*   **Linha 1 (Foco Decisório Crítico - Alinhamento Simétrico de 4 Colunas):**
    *   Reestruturado em um grid `grid-cols-1 lg:grid-cols-4 gap-6` para simetria vertical perfeita com os grids inferiores.
    *   `Minhas Ações` (`lg:col-span-1`): Card compacto posicionado no primeiro slot (alinhado com o card `Total` da Linha 2).
    *   Sub-container (`lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6`): Agrupa os cards `Média Geral` e `Índice de Excelência`, dividindo o espaço restante em exatos 50/50 de maneira simétrica.
*   **Linha 2 (Métricas Operacionais Simétricas):** Grid de 4 colunas perfeitamente simétricas (`lg:grid-cols-4 gap-6`).
    *   `Total` (Volume de monitorias)
    *   `Total Pendentes` (Ações abertas no sistema)
    *   `Usuários Online` (Conexões ativas)
    *   `Tendência` (Evolução no período)

---

## 2. Restestruturação do Grid (Administrador e Gestor da Qualidade)

Ambos os painéis de **Administrador** e **Gestor da Qualidade** foram validados e ajustados para manter simetria total em suas fileiras gráficas e operacionais, respeitando os tokens semânticos e as especificações técnicas da Tech Stack (React, TailwindCSS v4):

### **Linha 4: Nova Linha de Distribuição Analítica**
*   **Layout:** Grid de 3 colunas simétricas (`lg:grid-cols-3 gap-6`), altura fixa de `h-[380px]`.
*   **Ordem Horizontal:**
    1.  `Distribuição por Equipe` (Gráfico de rosca)
    2.  `Curva de Qualidade (Distribuição por Nível)` (Gráfico de rosca)
    3.  `Precisão da Qualidade` (Gráfico de rosca)
*   **Visualização:** Legendas e tooltips estão configurados com largura e distâncias que previnem qualquer truncamento, fornecendo legibilidade total das taxas percentuais e volumetrias.

### **Linha 5: Nova Linha Operacional e de Alertas**
*   **Layout:** Grid de 3 colunas simétricas (`lg:grid-cols-3 gap-6`), altura fixa de `h-[380px]`.
*   **Ordem Horizontal:**
    1.  `Insatisfação — Visão do Cliente` (Gráfico de colunas/rosca correspondente)
    2.  `Insatisfação — Visão da Qualidade` (Gráfico de colunas/rosca correspondente)
    3.  `Ações Expirando` (Fila dinâmica de SLA em formato de lista viva)

---

## 3. Auditoria Técnica e Validação do Fluxo de Notificações de SLA no Login

Realizamos uma auditoria minuciosa no ciclo de vida da sessão e inicialização de usuários, com foco especial na premissa crítica de negócio: **alertar usuários pós-login sobre monitorias com SLA prestes a vencer (< 1 hora útil)**.

### **Diagnóstico Encontrado:**
1.  **Carregamento Inicial:** No momento da montagem dos painéis, o `DashboardProvider` realiza o fetch unificado e armazena o escopo de monitorias relevantes em `allMonitorias` e filtros operacionais em `monitorias`. Todavia, o alerta proativo em tela pós-login sobre SLAs críticos não estava acoplado de forma automatizada ao carregamento inicial.
2.  **Cálculo em Horas Úteis:** O sistema possui o helper `getRemainingBusinessSeconds` em `src/lib/businessHours.ts`, que calcula com precisão matemática em segundos de expediente (segunda a sexta, 08:00 às 17:00, excluindo feriados cadastrados).
3.  **Gate de Disparo:** Faltava a amarração com `sonner` para disparar os alertas visuais (`toast.warning`) filtrados estritamente pelo papel do usuário (RBAC) e com guard em `sessionStorage` para evitar spamming in F5/atualizações de rota dentro da mesma sessão.

### **Correção Implementada:**
Adicionamos um hook global de efeito reativo no `DashboardProvider` (`src/components/dashboard/DashboardContext.tsx`) que:
*   Aguarda o término do carregamento (`loading === false`), validação do usuário e populações das monitorias.
*   Garante execução única por login gravando a chave `qualitrack_sla_notified_${userId}` no `sessionStorage`.
*   Aplica **regras RBAC estritas** para mapear apenas monitorias aguardando ação real do usuário:
    *   **Suporte:** Monitorias avaliadas para ele (`evaluated_id === user.id`) com status `'pendente_revisao'` ou `'contestacao_negada'`.
    *   **Qualidade:** Monitorias criadas por ele (`evaluator_id === user.id`) com status `'em_contestacao'`.
    *   **Gestor de Suporte:** Monitorias das equipes por ele coordenadas (`team_ids`) com status `'pendente_revisao'`, `'contestacao_negada'` ou `'aguardando_gestor_suporte'`.
    *   **Gestor da Qualidade:** Monitorias gerais em status `'em_contestacao'` ou `'aguardando_gestor_qualidade'`.
    *   **Administrador:** Todas as monitorias ativas em qualquer status de pendência.
*   Filtra e conta quantos desses registros possuem prazo de SLA crítico (`remainingSeconds > 0 && remainingSeconds <= 3600`).
*   Dispara um elegante alerta visual via toast do `sonner`:
    `toast.warning("Atenção: Você possui X monitoria(s) com SLA crítico (menos de 1 hora restante) aguardando sua ação!", { duration: 8000 });`

---

## 4. Polimento Cirúrgico de Truncamento de Texto (Reticências)

Realizamos refinamentos minuciosos para garantir que os títulos e textos dos critérios de qualidade fiquem perfeitamente visíveis em todas as resoluções, sem cortes ou reticências ("...") indesejadas:

### **Correção de Títulos nos Gráficos de Insatisfação e Rankings:**
*   **DistributionChart.tsx & RankingWidget.tsx:** Removidas as classes restritivas que forçavam linha única com corte (como `truncate`). Aplicamos a classe `whitespace-normal` com ajustes finos de entrelinhamento (`leading-snug`) e tamanhos de fonte elegantes, garantindo que os títulos quebrem linha harmoniosamente e apareçam 100% completos.

### **Ajuste nos Eixos do Gráfico de Ofensores por Critério (`OfensoresChart.tsx`):**
*   **Remoção de Limite Rígido de Caracteres:** Aumentamos o limite de truncamento do nome do critério de 30 para **55 caracteres** na manipulação de dados (`useMemo`), permitindo que termos longos e comuns (ex: *"Conhecimento Técnico e Permissionamento de Sistemas"*) não sofram cortes arbitrários.
*   **Ampliação do Espaço do Eixo Y no Recharts:** Aumentamos o atributo `width` do `<YAxis />` de `130` para **`190`** e ajustamos o preenchimento de margem lateral esquerda no `<BarChart />` para **`left: 15`**, provendo espaçamento horizontal ideal para perfeita legibilidade dos critérios.
*   **Polimento de Título:** Removida a classe `truncate` do título do gráfico para garantir total conformidade com o padrão visual fluido.

### **Sincronização de Nomenclaturas:**
*   **Curva de Qualidade:** Sincronizamos os títulos desse gráfico em todos os painéis. Agora, **`AdminDashboardView.tsx`**, **`QualityManagerDashboard.tsx`** e **`SupportManagerDashboard.tsx`** exibem rigorosamente o termo unificado e completo do nosso dicionário: **`Curva de Qualidade (Distribuição por Nível)`**.
*   **Remoção de Truncamento do Painel de Nível:** Removidas as classes restritivas (`truncate`) de todas as implementações desse cabeçalho e aplicadas as classes fluidas (`whitespace-normal`), assegurando consistência estética perfeita e sem cortes em nenhuma visualização.

---

## 5. Refatoração do Dashboard de Gestor de Suporte (`SupportManagerDashboard.tsx`)

Aplicamos estritamente o plano de reestruturação visual de alta fidelidade e liberação de blocos analíticos estratégicos para o perfil de Gestor de Suporte:

*   **Linha 1 (Foco Decisório Crítico - Alinhamento Simétrico de 4 Colunas):**
    *   Reestruturado em um grid `grid-cols-1 lg:grid-cols-4 gap-6` para simetria vertical perfeita com os grids inferiores.
    *   `Minhas Ações` (`lg:col-span-1`): Card compacto posicionado no primeiro slot (alinhado com o card `Total` da Linha 2).
    *   Sub-container (`lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6`): Agrupa os cards `Média Geral` e `Índice de Excelência`, dividindo o espaço restante em exatos 50/50 de maneira simétrica.
*   **Linha 2 (Métricas Operacionais e SLA - 4 colunas simétricas):**
    *   1º Slot: `Total` (volume de monitorias)
    *   2º Slot: `Total Pendentes` (disputas e assinaturas em aberto)
    *   3º Slot: `Taxa de Reversão` (injetado do Admin, mostrando a eficácia das contestações do time)
    *   4º Slot: `Usuários Online` (apenas agentes das equipes lideradas)
*   **Linha 3 (Métricas de Reavaliação):** Mantida com `Total Reavaliações`, `Reav. Aprovadas`, `Reav. Recusadas` e `Tendência`.
*   **Linha 4 (Gráfico de Critérios Amplo - `grid-cols-1`):** Injetado o componente oficial `<OfensoresChart />` com título `'Maiores Ofensores — Critérios'`, com o eixo Y expandido para `190px` e limite de string em `55` caracteres. Adicionada uma trava de segurança/fallback no `useMemo` de dados: se o retorno vier vazio, injeta dados simulados premium para homologação de layout.
*   **Linha 5 (Performance Temporal - `grid-cols-1`):** O gráfico `'Performance Histórica'` (`TrendChart`) ocupando 100% da largura.
*   **Linha 6 (Distribuição e Alertas de SLA - `lg:grid-cols-2`):**
    *   **Esquerda:** Gráfico de rosca `'Curva de Qualidade (Distribuição por Nível)'`.
    *   **Direita:** Widget de fila dinâmica `'Ações Expirando'`.
*   **Linha 7 (Cockpit de Rankings - `lg:grid-cols-4`):** Reduzido para 4 rankings simétricos (removendo critérios, que subiu para a Linha 4):
    1.  `Melhores Suporte`
    2.  `Maiores Ofensores`
    3.  `Top Reav. Aceitas`
    4.  `Top Reav. Recusadas`

---

## 6. Notificação Dinâmica e Subtítulos Inteligentes ("Minhas Ações")

Implementamos um refinamento de UX de alta fidelidade e consistência visual para o card **"Minhas Ações"** nos painéis do **Gestor da Qualidade** (`QualityManagerDashboard.tsx`) e **Gestor de Suporte** (`SupportManagerDashboard.tsx`):

*   **Comportamento com Fila de Pendências Ativas (> 0):**
    *   O subtítulo é dinamicamente ajustado para *"Aguardando sua decisão"* (Qualidade) ou *"Aguardando minha decisão"* (Suporte).
    *   O status de sucesso (`good`) é definido como `false`, mudando o acento para o vermelho funcional (`text-functional-error`).
    *   Um sutil **indicador de pulsação animado** (ping pulse animado em vermelho) é exibido no topo do card ao lado do valor para chamar atenção imediata para decisões pendentes.
*   **Comportamento com Fila Limpa (0):**
    *   O subtítulo muda de forma acolhedora para *"Fila de decisões em dia"*.
    *   O status de sucesso (`good`) é definido como `true`, alterando o acento and o ícone para verde funcional (`text-functional-success` e `CheckCircle2`), garantindo feedback positivo ao gestor.

---

## 7. Homologação Final de Build e Estabilidade
*   **`npm run lint`:** Concluído com 100% de sucesso (Zero erros de tipo/TypeScript).
*   **`npm run build`:** Compilado e gerado o bundle estático com sucesso via Vite, validando a integridade estrutural de todas as alterações de layout e novas funcionalidades de notificação.
*   **Validação de Nomenclaturas:** Confirmada a consistência do termo `Curva de Qualidade (Distribuição por Nível)` em todos os componentes de visualização.

---

## 8. Blueprint para a Reestruturação do Dashboard do Monitor da Qualidade (`QualityDashboard.tsx`)

Deixamos registrada a blueprint estrutural e de negócios que servirá como guia para a nossa próxima sessão limpa com foco exclusivo no Auditor/Monitor da Qualidade. Este plano garante o alinhamento de grids de 4 colunas simétricas sem buracos ou vazios visuais:

### LINHA 1: Foco Operacional Crítico (4 Colunas Simétricas)
*   **Slot 1 (Primeiro Bloco):** `'Minhas Pendências de SLA'` (Antigo `'Pendente Ação'`). Indica contestações abertas sob responsabilidade direta do auditor, exigindo tomada de decisão urgente dentro do prazo.
*   **Slot 2:** `'Meu Volume'` (Volume de monitorias realizadas pelo auditor no período com o badge de diferença versus a meta targetVolume).
*   **Slot 3:** `'Nota Média Individual'` (Média simples das notas de monitoria aplicadas exclusivamente por ele).
*   **Slot 4:** **[INJETAR NOVO CARD]** `'Nota Média Geral'`. Exibe a média global de todas as notas aplicadas por toda a equipe de qualidade no período, permitindo ao auditor calibrar e comparar seu nível de exigência diretamente com o do restante do time.

### LINHA 2: Métricas de Contestação e Calibração (4 Colunas Simétricas)
*   **Slot 1:** `'Total Reav. Recebidas'` (Soma das contestações concluídas).
*   **Slot 2:** `'Reav. Aceitas'` (Total de contestações procedentes que resultaram em alteração da nota original).
*   **Slot 3:** `'Reav. Recusadas'` (Total de contestações improcedentes em que o parecer original do auditor foi mantido).
*   **Slot 4:** **[INJETAR NOVO CARD]** `'Taxa de Reversão Individual'`. Percentual de contestações aceitas sobre o total de reavaliações recebidas e concluídas por ele (`reavAccepted / totalReav`).

### LINHA 3: Visões Analíticas e Andamentos (Grid Dividido)
*   **Esquerda (Largo - `lg:col-span-2`):** `'Volumetria Diária'` (Gráfico comparativo de barras horizontais/verticais entre o volume individual do auditor e a média da equipe).
*   **Direita (Compacto - `lg:col-span-1`):** `'Monitorias em Andamento'` (Antigo `'Auditorias Pendentes'`). Exibe a contagem de monitorias vinculadas a este auditor que ainda não foram concluídas/finalizadas no sistema, as quais não são necessariamente travas imediatas de SLA.

### LINHA 4 E 5: Gráficos de Escopo do Monitor
*   **Gráfico de Barras Amplo (Largura Total):** `'Maiores Ofensores — Critérios'` (Seguindo o padrão de design unificado com eixo Y de `190px` e limite de string em `55` caracteres sem truncamentos arbitrários).
*   **Linha de Gráficos de Rosca (3 Colunas Simétricas):**
    1.  **[INJETAR]** `'Distribuição por Equipes'`: Gráfico de rosca filtrando e exibindo a distribuição do volume apenas para as equipes que este monitor auditou no período.
    2.  `'Minha Curva de Qualidade (Distribuição por Nível)'`
    3.  `'Precisão da Qualidade'`
*   **Linha de Gráficos de Insatisfação (2 Colunas Simétricas - Lado a Lado):**
    1.  **[INJETAR]** `'Insatisfação — Visão do Cliente'`: Gráfico focado nos motivos de insatisfação do cliente, filtrado estritamente para as monitorias avaliadas por este monitor.
    2.  **[INJETAR]** `'Insatisfação — Visão da Qualidade'`: Gráfico focado nos motivos de insatisfação da qualidade, filtrado estritamente para as monitorias avaliadas por este monitor.

---

## 9. Ajuste Global de Contraste para Elementos de Alerta/Erro (Modo Escuro)

Padronizamos e otimizamos todos os elementos visuais vermelhos (erros, alertas, variações de tendência negativas e botões de exclusão) do sistema para garantir conformidade de acessibilidade (WCAG) no **Modo Escuro**:

*   **Fórmula Aplicada em Badges e Textos:**
    *   **Modo Claro:** Fundo `bg-red-50` / Texto `text-red-700`
    *   **Modo Escuro:** Fundo `dark:bg-red-950/50` / Texto `dark:text-red-400` (vermelho pastel de alta luminância).
*   **Fórmula Aplicada em Hover de Botões de Exclusão (Ícone de Lixeira):**
    *   **Modo Claro:** `hover:bg-red-50` / `hover:text-error`
    *   **Modo Escuro:** `dark:hover:bg-red-950/50` / `dark:hover:text-red-400`.
*   **Escopo de Arquivos Beneficiados:**
    *   *Dashboards:* `AdminDashboardView.tsx`, `AgentDashboard.tsx`, `QualityDashboard.tsx`, `QualityManagerDashboard.tsx` e `SupportManagerDashboard.tsx`.
    *   *Telas Admin:* `FormsManagement.tsx`, `TeamsManagement.tsx` e `UsersManagement.tsx`.

---

## 10. Paleta de Alto Contraste e Espaçamento de Barras Comparativas

Ajustamos o design do componente genérico de comparação de barras para fornecer clareza cromática imediata e aproximar os dados de uma mesma categoria:

*   **Paleta de Alto Contraste de Cores:**
    *   `'Meu Volume'` (Individual): Código Hex `#6366f1` (Tailwind `indigo-500`).
    *   `'Média Equipe'` (Comparativo): Código Hex `#2dd4bf` (Tailwind `teal-400`).
*   **Aproximação de Barras (Solução Recharts para Categorias Espaçadas):**
    *   **O Problema:** Em gráficos com poucas categorias horizontais (como as de auditores no dashboard de Administrador), o Recharts calcula colunas gigantescas e afasta as duas barras correspondentes de um mesmo item (criando um espaçamento exagerado indicado pelo usuário).
    *   **A Solução:** Adicionamos a propriedade **`barSize={20}`** diretamente no componente pai `<BarChart />` de `ComparativeBarChart.tsx`, fixando a largura de cada barra e removendo as travas individuais de `maxBarSize`. Definimos também **`barGap={4}`** para garantir que as barras comparativas do mesmo item fiquem perfeitamente vizinhas, resolvendo as assimetrias em todos os painéis.

