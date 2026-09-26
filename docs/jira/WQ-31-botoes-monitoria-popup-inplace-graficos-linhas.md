# WQ-31: Botões de Monitoria, Navegação In-Place de Popups, Espaçamento de Linhas e Porcentagens Externas dos Gráficos

**Projeto:** QualiTrack (WebPosto Qualidade)  
**Run Orca:** `run_d282ea28f315`  
**Status:** Concluído / Pronto para Homologação  
**Branch:** `develop`  
**Data:** 26/09/2026  

---

## 🎯 Objetivo da Demanda
Atender aos apontamentos de homologação realizados na interface e regras de negócio:
1. **Navegação In-Place dos Popups**: Ao clicar em "Visualizar Avaliação Completa" ou "Editar Avaliação" (ou ao abrir monitorias a partir dos cards e listagens de indicadores do Dashboard), a aplicação deve se comportar **onde ela está**, abrindo as telas como modal/popup in-place, sem forçar migração de abas na sidebar (`setActiveTab('monitorias')`).
2. **Desbloqueio do Botão "Voltar"**: O botão "Voltar" / "Anterior" no formulário de monitoria (`MonitoriaForm`) ficava bloqueado com `disabled={step === 1}`. Agora permanece sempre navegável: no passo 1 ele executa `onCancel()`, retornando imediatamente à tela anterior (detalhes da monitoria) sem travar o usuário.
3. **Correção de Funções e Visibilidade dos Botões de Ação**:
   - O botão "Reabrir" estava sendo exibido para todas as monitorias ativas, inclusive as abertas/em andamento. Agora é exibido estritamente para monitorias finalizadas (`concluida`, `finalizada_alterada`, `contestacao_aceita`, `contestacao_negada`).
   - Botões de "Aprovar" e "Contestar" para Gestor de Suporte foram alinhados às regras do banco (`score < 75` em `pendente_revisao`).
4. **Espaçamento e Densidade das Linhas das Monitorias**: Redução da altura e do padding vertical das linhas da tabela de monitorias (`min-h-[64px] sm:min-h-[70px]`, `rowHeight={72}`, ícones de status mais compactos `size-8 sm:size-9`), proporcionando melhor escaneamento visual.
5. **Correção do Bug Visual de Prazo**: Remoção do ponto cinza duplicado que aparecia antes do ícone de pause/clock no pill de prazo do `ActionDeadlineClock`.
6. **Porcentagens Externas nos Gráficos de Rosca**: As porcentagens deixaram de ser renderizadas no interior estreito do anel da rosca (onde cortavam como "00%") e passaram a ser exibidas do **lado externo de cada fatia/arco correspondente**, acompanhando a respectiva cor e sem truncar agressivamente as legendas laterais.

---

## 📋 Tarefas Executadas & Distribuição de Modelos (Orca Orchestration)

| Task ID | Descrição | Modelo / Tier | Status |
|---|---|---|---|
| `task_723942ce30f0` | **WQ-31A**: Navegação In-Place de Popups e Desbloqueio do Botão Voltar | GPT-5.6 Sol | `completed` |
| `task_6b2e25f8fa17` | **WQ-31B**: Correção de Funções e Visibilidade dos Botões de Monitoria | GPT-5.6 Terra | `completed` |
| `task_86d2a183cde5` | **WQ-31C**: Redução do Espaçamento de Linhas e Bug Visual de Prazo | GPT-5.6 Luna | `completed` |
| `task_a65e9b8933f3` | **WQ-31D**: Porcentagens dos Gráficos de Rosca do Lado Externo da Cor | Gemini 3.8 Mid | `completed` |
| `task_c9f4b6c37850` | **WQ-31E**: Validação Vitest (209 testes), Lint, Build e Deploy na Branch Develop | Gemini 3.8 High | `completed` |

---

## 🛠️ Arquivos Modificados & Entregas

1. `src/components/MonitoriaForm.tsx`:
   - Botão "Voltar / Anterior" desbloqueado: no `step === 1`, chama `onCancel()` e fecha o formulário retornando aos detalhes da monitoria.
   - Estado de disabled vinculado a `isPending` em vez de travar no step 1.
2. `src/components/InPlaceMonitoriaModal.tsx` *(Novo Componente)*:
   - Permite inspecionar e interagir com monitorias in-place diretamente do Dashboard ou de qualquer aba, sem migrar de aba na sidebar.
   - Suporte a visualização completa, edição, aprovação, contestação e reabertura com retorno contextual.
3. `src/App.tsx`:
   - Atualizado o listener do evento `qualitrack:focus_monitoria` para abrir in-place via `InPlaceMonitoriaModal` quando a aba ativa não for `monitorias`.
   - Lazy load de `InPlaceMonitoriaModal` integrado ao ciclo de vida da aplicação.
4. `src/components/MonitoriaList.tsx`:
   - Preservação do modal de detalhes (`selectedId`) ao abrir a visualização completa ou edição, permitindo voltar para o diálogo de detalhes ao clicar em "Voltar".
   - Ajuste do `rowHeight` da lista virtualizada de 104 para 72.
5. `src/components/MonitoriaDetails.tsx`:
   - Botão "Reabrir" restrito exclusivamente a monitorias com status finalizado.
   - Botões de Aprovar e Contestar para Gestor de Suporte alinhados à exigência de nota < 75.
6. `src/components/MonitoriaRow.tsx`:
   - Altura mínima e padding ajustados para `min-h-[64px] sm:min-h-[70px]`, `py-2.5 px-3 sm:py-3 sm:px-4`, e ícones `size-8 sm:size-9`.
7. `src/components/ui/ActionDeadlineClock.tsx`:
   - Remoção do bullet/dot residual duplicado antes do ícone de pause/clock.
8. `src/components/dashboard/widgets/DistributionChart.tsx` & Dashboards (`AdminDashboardView.tsx`, `QualityManagerDashboard.tsx`, `SupportManagerDashboard.tsx`):
   - Função `renderArcLabel` reformulada: posiciona o texto percentual 14px fora do arco externo (`radius = outerRadius + 14`), aplicando o `fill` na cor da fatia correspondente.
   - Anéis do gráfico ajustados para `innerRadius={44}` e `outerRadius={60}` para não cortar os rótulos.
   - Proporção da coluna lateral ajustada para 50%/50% com `title` nos itens para evitar truncamento agressivo de texto.

---

## 🧪 Verificação & Testes
- **TypeScript & ESLint:** `tsc --noEmit` executado com **0 erros**.
- **Vitest Unit Tests:** **209 testes aprovados** em 30 suites de testes (100% pass).
- **Vite Production Build:** Empacotamento de produção gerado com sucesso em 12.33s.
