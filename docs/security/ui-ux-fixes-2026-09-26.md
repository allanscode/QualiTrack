# Relatório de Correções de UI/UX, Acessibilidade e Segurança

**Data:** 26 de Setembro de 2026  
**Sistema:** QualiTrack QA & CX System  
**Escopo de Escrita:**
- `src/hooks/useDialogAccessibility.ts`
- `src/components/feedback/FeedbacksWidget.tsx`
- `src/components/feedback/CreateFeedbackModal.tsx`
- `src/components/feedback/FeedbackDetailsModal.tsx`
- `src/components/dashboard/widgets/EmailReportModal.tsx`
- `src/test/dialogAccessibility.test.tsx`
- `docs/security/ui-ux-fixes-2026-09-26.md`

---

## 1. Resumo Executivo

Em conformidade com as diretrizes do `AGENTS.md`, com o padrão de excelência de interface do Impeccable (craft floor e harden) e com as orientações do arquiteto principal, realizou-se uma revisão e refatoração completa nos componentes de diálogo/modal, módulo de feedbacks 1:1 e no modal de relatório executivo por e-mail.

As correções eliminaram simulações enganosas de envio de e-mails e anexos, implementaram acessibilidade profunda nos padrões WAI-ARIA (com foco, trap, Escape e controle de modais aninhados), blindaram formulários contra double submit e perda de dados, e adaptaram a experiência para toque mobile e prevenção de zoom involuntário no iOS.

---

## 2. Acessibilidade de Modais e Pilha Hierárquica (`useDialogAccessibility`)

### Problemas Identificados
1. Diálogos sem atributos semânticos (`role="dialog"`, `aria-modal="true"` e rótulos `aria-labelledby`).
2. Ausência de captura/confinamento de foco (Focus Trap): navegação via tecla `Tab` escapava do modal para a página de fundo.
3. Tecla `Escape` não tratava modais aninhados (por exemplo, `ExecutiveReportModal` disparando `EmailReportModal`): fechar o modal filho pelo Escape fechava múltiplos modais ao mesmo tempo ou gerava vazamento de rolagem no `body`.
4. Ausência de restauração de foco ao fechar o diálogo.

### Soluções Implementadas no Hook `useDialogAccessibility`
- **Pilha de Modais Ativos (`modalStack`)**: Sistema singleton em memória que registra cada modal aberto com seu identificador e referência de elemento que disparou a abertura.
- **Hierarquia de Escape & Trap**: Apenas o modal no topo da pilha (mais recente) intercepta e responde à tecla `Escape` e ao ciclo de tabulação (`Tab` / `Shift+Tab`).
- **Scroll Lock Inteligente**: Bloqueia a rolagem do `document.body` (`overflow: hidden`) na abertura do primeiro modal e só restaura o estado prévio quando o último modal da pilha for fechado.
- **Restauração Confiável de Foco**: Restaura o foco para o botão/gatilho disparador anterior assim que o modal é desmontado.
- **Foco Inicial Automático**: Direciona o foco para `initialFocusRef` ou para o primeiro elemento interativo disponível no DOM do diálogo.

---

## 3. Módulo de Feedbacks 1:1 (`src/components/feedback/`)

### 3.1. `FeedbacksWidget.tsx`
- **Acessibilidade e Teclado**: Elementos da lista de feedbacks agora possuem `role="button"`, `tabIndex={0}`, `aria-label` descritivo e suporte a `Enter` e `Space` (`onKeyDown`), além de anéis de foco visíveis (`focus-visible:ring-2`).
- **Estados Visíveis de Erro, Refresh e Loading**: Suporte a props opcionais `loading`, `refreshing`, `error` e `onRefresh`.
  - Exibe alerta de erro explícito com botão de re-tentativa (`Tentar novamente`).
  - Exibe indicador discreto e animado de atualização (`Atualizando...`) no cabeçalho.
  - Exibe skeletons pulsantes quando em carregamento inicial.
- **Toque Mobile**: Áreas de toque aumentadas para atender a meta mínima de 44x44px em botões e linhas de tabela.
- **Prevenção de Quebra de Texto**: Inclusão de `truncate`, `min-w-0` e `break-words` em títulos e metadados de gestor/atendente.

### 3.2. `CreateFeedbackModal.tsx`
- **Acessibilidade WAI-ARIA**: Integração ao `useDialogAccessibility` com `aria-labelledby="create-feedback-title"` e `aria-describedby="create-feedback-subtitle"`.
- **Associação Estrita de Labels**: Todos os campos do formulário foram associados via `htmlFor` e `id` explícitos (`create-feedback-agent-select`, `create-feedback-title-input`, etc.).
- **Prevenção de Double Submit**: Bloqueio de cliques repetidos durante a requisição assíncrona (`if (submitting) return;` e estado `disabled`).
- **Tratamento Visível de Erros**: Caso a gravação falhe ou rejeite, o modal permanece aberto preservando os textos digitados pelo gestor e exibe um banner de alerta visível (`role="alert"`).
- **Ajuste para iOS Safari**: Font size dos campos ajustado com `text-base sm:text-xs` para prevenir o zoom automático forçado do iOS Safari em inputs com menos de 16px.

### 3.3. `FeedbackDetailsModal.tsx`
- **Acessibilidade WAI-ARIA**: Integração com `useDialogAccessibility` e `aria-labelledby="feedback-details-title"`.
- **Rótulo no Campo de Ciência**: Adicionado `id="feedback-details-agent-notes"` com `<label htmlFor="...">`.
- **Resiliência a Overflow**: Classes `break-words`, `whitespace-pre-wrap` e quebra de strings longas em pontos fortes, oportunidades de melhoria e plano de ação.
- **Prevenção de Double Submit & Erro em Ações**: Botões de confirmar ciência e de concluir plano bloqueados durante submissão com tratamento visual de erros.

---

## 4. Reformulação Honesta do `EmailReportModal.tsx`

### Problema Anterior
O modal apresentava um comportamento simulado com `setTimeout(..., 800)` e notificava falsamente que o relatório havia sido "enviado com sucesso", afirmando também haver um "Anexo do Relatório" (como se houvesse um arquivo PDF anexado automaticamente). Como o front-end não possui serviço de relay SMTP nem Edge Function de e-mail, essa interface prometia uma entrega que não ocorria.

### Soluções e Melhorias Implementadas
1. **Comunicação Honesta e Transparente**:
   - Título reformulado para **"Preparar E-mail do Relatório"**.
   - Subtítulo explicativo: *"Gere o rascunho com o resumo dos indicadores para envio via seu aplicativo de e-mail"*.
   - Seção de anexo corrigida para **"Resumo Textual Incluído"**, com aviso explícito de que para envio de PDF o usuário deve utilizar o botão "Salvar PDF" no relatório principal e anexá-lo ao seu cliente de e-mail.
2. **Duas Ações Confiáveis**:
   - **"Abrir no Aplicativo de E-mail"**: Monta URI `mailto:` com sanitização rigorosa de assunto (remoção de quebras de linha `CRLF` para evitar cabeçalhos maliciosos) e codificação `encodeURIComponent`.
   - **"Copiar Resumo"**: Ação com 1 clique que copia todo o parecer e os indicadores tabulados para a área de transferência.
3. **Salvaguarda de Limite de URL (`MAX_MAILTO_SAFE_LENGTH = 1900`)**:
   - Clientes de e-mail e sistemas operacionais (Windows, Outlook, Chrome) costumam falhar silenciosamente ou truncar URLs `mailto:` que excedam ~2000 caracteres.
   - O modal monitora dinamicamente o tamanho do link montado. Se ultrapassar 1900 caracteres, exibe aviso prévio na tela alertando sobre a extensão e sugere o uso do botão "Copiar Resumo". Ao clicar em abrir, copia preventivamente o texto integral para o clipboard antes de acionar a URI.
4. **Acessibilidade & Modais Aninhados**:
   - Como o `EmailReportModal` é acionado dentro do `ExecutiveReportModal`, ele se beneficia da pilha do `useDialogAccessibility`. Pressionar `Escape` fecha apenas o `EmailReportModal`, mantendo o `ExecutiveReportModal` aberto e preservando o bloqueio de rolagem do body.

---

## 5. Validação e Testes Automatizados

### Testes Unitários de Acessibilidade (`src/test/dialogAccessibility.test.tsx`)
Criada suíte completa em Vitest cobrindo:
1. Atributos WAI-ARIA (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
2. Foco inicial automático via `initialFocusRef` ou primeiro elemento focável.
3. Focus trap bidirecional (`Tab` do último para o primeiro e `Shift+Tab` do primeiro para o último).
4. Fechamento pelo `Escape` com verificação de disparo único.
5. Restauração de foco para o botão acionador após o fechamento.
6. Pilha de modais aninhados:
   - Rolagem do `body` bloqueada na abertura do pai e mantida no filho.
   - Pressionamento de `Escape` fecha exclusivamente o modal filho, mantendo o modal pai visível e o scroll lock ativo.
   - Segundo `Escape` fecha o modal pai e destrava a rolagem do `body`.

### Execução dos Testes Direcionados:
```bash
npm.cmd test -- src/test/dialogAccessibility.test.tsx
# Resultado: 1 passed (7 tests) em 1.07s
```

### Checagem de Tipagem Estrita (Lint):
```bash
npm.cmd run lint
# Resultado: tsc --noEmit finalizado sem nenhum erro (exit code 0).
```
