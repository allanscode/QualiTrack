# Revisão independente de segurança — QualiTrack

Data: 26/09/2026 (America/Sao_Paulo). Código auditado: `5c7835303642fb03ef8737272c7a1f6beda002fa`.

## Parecer

**Não recomendo liberar esta versão para produção antes de corrigir os achados de alta prioridade e homologar as fronteiras de autorização.** Há proteções relevantes já implementadas, mas o relatório anterior não sustenta a conclusão de que os problemas de segurança foram integralmente resolvidos. A nova implementação de Feedbacks/PDI permite adulteração da ciência, acesso indevido e operações por usuários inativos. Uma Edge Function também permite preview de monitorias fora da equipe do gestor.

Esta entrega é uma revisão e um plano de correção, com reprodução local dos problemas. **Não aplica correções ao produto, migrations a um banco remoto, rotação de credenciais ou deploy.** Integrar commits na `main` não equivale a aprovar sua segurança.

## Escopo, método e limites

- Leitura do [relatório anterior](security-audit-report-2026-09-26.md), comparação com código e SQL atuais; atenção a policies substituídas por migrations posteriores.
- Revisão de RLS, grants, triggers, funções `SECURITY DEFINER`, view anônima, anexos, instalação limpa, autenticação, exportações, persistência no navegador, Edge Functions, CI e infraestrutura.
- Dois apoios de revisão com modelo mais econômico (`gpt-6-luna`), em escopos separados: SQL/RLS e Edge Functions. Consolidação e verificação pelo agente principal. O CLI Orca foi consultado; utilizamos subagentes nativos para evitar abrir sessões externas adicionais.
- Execução de TypeScript, Vitest, PostgreSQL em memória/PGlite, auditoria npm, build com configuração sintética e verificação do bundle. Nenhum teste enviou e-mails, publicou comentários Zendesk ou chamou a IA em produção.
- Consulta somente leitura ao Git remoto e aos metadados de deployments do GitHub.
- Não foram inspecionados o catálogo de policies do Supabase hospedado, suas migrations efetivamente aplicadas, configurações Auth/CAPTCHA, secrets, backups, logs de acesso ou a configuração administrativa da Vercel. Achados de código não provam exploração nem implantação no ambiente real.
- As provas SQL usam identidades sintéticas e permissões DML de aplicação. A exposição via API depende de a tabela ter esses grants no ambiente; negar todos os grants também impediria a funcionalidade, não corrigiria as policies.

## Atualização de branches

Após `git fetch origin`, `main`, `origin/main`, `develop` e `origin/develop` apontavam para `6e965f0`. Não havia commits exclusivos de `develop` a integrar.

As novidades estavam em `allanscode/design-improvements-test`. O usuário confirmou explicitamente a inclusão dos três commits:

| Commit | Conteúdo |
|---|---|
| `43c2a04` | Feedbacks 1:1, relatório executivo e drilldowns |
| `163a360` | Documentação do plano de ação/PDI |
| `5c78353` | Causa raiz/ROI, notificações, gamificação, interface de e-mail e auditoria anterior |

A `main` **local** recebeu esses commits por fast-forward, sem conflitos, no worktree `C:/Users/User/Documents/Documents/QualiTrack-security-main-20260926`. O checkout original e a alteração preexistente em `docs/agents/orca-prompt-creator.md` foram preservados. O relatório e as evidências desta revisão acompanham a consolidação local.

**Push para `origin/main` pendente:** os metadados GitHub mostram deployments denominados `Production` para commits da `main`, incluindo `6e965f0`. Isso indica que um push pode publicar automaticamente. A associação exata entre branch e ambiente precisa ser confirmada; não tratei esse efeito como autorizado pelo pedido de integração, pois o `AGENTS.md` exige autorização explícita para produção. O workflow também publica uma imagem Docker em pushes para `main`.

## Achados de segurança

### S01 — Alta: ciência do PDI falsificável e plano adulterável

Evidências: [trigger de feedback](../../supabase/migrations/20260926000002_harden_feedbacks_security.sql), linhas 13–35; [policy UPDATE](../../supabase/migrations/20260926000001_create_agent_feedbacks.sql), linhas 71–82.

O gestor autor pode definir `agent_acknowledged_at` enquanto o valor anterior é nulo: a proteção só entra quando `OLD.agent_acknowledged_at IS NOT NULL`. Mesmo depois de preenchido, pode apagá-lo passando `NULL`, porque `NEW <> OLD` resulta em `NULL` e não ativa o `IF`. A especificação permite ciência apenas pelo atendente, inclusive excluindo o admin dessa ação.

O atendente pode alterar `strengths`, `deadline_date`, `team_id`, `monitoria_id`, datas e o próprio timestamp de ciência. Pode também reabrir um feedback concluído mudando-o para `ciente` ou `pendente_ciencia`: a trigger impede somente entrar em `concluido`, não sair dele. O bloqueio de três textos não equivale a controle de campos e transições.

Impacto: evidência de leitura e cumprimento de PDI sem confiabilidade; alterações posteriores podem modificar prazo, contexto e quem consegue ler o registro.

Correção proposta: RPCs separadas para criar, confirmar ciência e concluir; identidade e timestamps obtidos no servidor; validação de estado anterior; imutabilidade do plano após ciência ou nova versão que exija nova ciência. Usar `IS DISTINCT FROM` nas comparações nulas. Retirar UPDATE genérico ou restringir integralmente as colunas e ações por papel. Testar também admin, gestor, atendente e conta inativa por API direta.

### S02 — Alta: criação de PDI fora da alçada e leitura entre equipes

Evidências: [policies de feedback](../../supabase/migrations/20260926000001_create_agent_feedbacks.sql), linhas 35–52 e 58–67; [matriz do PDI](../specs/feedbacks-1-1-pdi.md), linhas 131–135.

INSERT verifica o papel do chamador, mas não exige `manager_id = auth.uid()`, agente elegível ou coerência entre equipe, agente e monitoria. Um gestor de suporte pode criar PDI para outra equipe e atribuir autoria a outro gestor. Pode inclusive inserir estado/timestamp de ciência já preenchidos: a trigger defensiva é somente `BEFORE UPDATE`.

Na leitura, `team_id IS NULL` libera o registro para qualquer gestor de suporte ativo. O campo é opcional e fica nulo também após exclusão da equipe (`ON DELETE SET NULL`). O filtro de dropdown no React não impede requisições diretas.

Correção proposta: derivar autoria do token, validar elegibilidade do agente e vínculo real com a equipe autorizada, conferir `monitoria_id` contra o agente/equipe e definir uma regra restritiva para equipe ausente. Não ampliar leitura automaticamente quando uma equipe for removida. Cobrir INSERT com os mesmos controles de estado e ciência.

### S03 — Alta: desativação de conta não bloqueia o próprio PDI

Evidências: [SELECT/UPDATE de feedback](../../supabase/migrations/20260926000001_create_agent_feedbacks.sql), linhas 35–37 e 74–81; trigger citada em S01.

Os ramos `agent_id = auth.uid()` e `manager_id = auth.uid()` não verificam `users.active`. O helper administrativo foi endurecido, mas seus controles não se propagam para esses ramos alternativos. Uma conta desativada com JWT ainda válido continua autorizada a consultar e modificar os próprios registros, dentro das restrições incompletas da trigger.

Correção proposta: exigir perfil ativo em toda operação, preferencialmente por policy restritiva comum e checagem nos RPCs. Testar desativação com token previamente emitido. Logout no navegador não substitui essa proteção: tokens de acesso podem continuar válidos até expirar, conforme a [documentação do Supabase](https://supabase.com/docs/guides/auth/signout).

### S04 — Alta: preview de monitoria ignora a equipe do gestor

Evidências: [helpdesk-publish-evaluation](../../supabase/functions/helpdesk-publish-evaluation/index.ts), linhas 107–120, 137–163 e 232–246.

A função busca a monitoria com service role. `podeVisualizar` autoriza qualquer `gestor_suporte`, sem consultar suas equipes. Enviando um `monitoria_id` conhecido de outra equipe com `dry_run: true`, esse gestor recebe o HTML com parecer e, quando existente, relato de satisfação. O próprio contrato comentado na função limita preview ao gestor da equipe do agente.

Pré-condições: usuário ativo nesse papel, ID válido de monitoria e ticket numérico. Não é endpoint anônimo, e este achado não concede publicação ao gestor de suporte.

Correção proposta: antes de montar o preview, validar `monitoria.team_id` contra vínculos autorizados do chamador; negar equipe ausente sem regra explícita. Adicionar testes da função completa com gestor da equipe A tentando acessar a B, conta inativa e suporte não titular. Evitar revelar existência do objeto antes da autorização.

### S05 — Alta, condicionada à configuração: build aceita chave secreta moderna

Evidências: [vite.config.ts](../../vite.config.ts), linhas 16–32; [cliente Supabase](../../src/lib/supabase.ts), linhas 6–7; [verificador de bundle](../../scripts/check-production-bundle.mjs).

O guard do build verifica o papel apenas em chaves que começam com `eyJ` (JWT legado). Uma string iniciada em `sb_secret_` passa pela configuração e seria consumida por uma variável pública `VITE_*` se configurada por engano. A configuração foi carregada localmente com uma chave **sintética**, confirmando a aceitação do prefixo; nenhuma chave real foi usada ou exposta nessa prova.

O `check:bundle` detecta esse marcador, mas não faz parte de `npm run build`, do Dockerfile nem do `buildCommand` Vercel. O CI usa chave sintética pública diferente da configuração de deploy; portanto passar no CI não valida os valores do build real.

Impacto condicionado a erro de configuração: distribuição de uma chave privilegiada no JavaScript público. Não foi encontrada evidência de que isso tenha ocorrido. A orientação do fornecedor é nunca colocar [secret/service role keys no frontend](https://supabase.com/docs/guides/database/secure-data).

Correção proposta: aceitar explicitamente `sb_publishable_*` e JWT com papel `anon`; rejeitar `sb_secret_*` e formatos desconhecidos antes de gerar assets. Executar a inspeção de bundle em todos os caminhos de publicação, usando também o artefato efetivamente publicado.

### S06 — Média: exportação CSV permite fórmulas

Evidência: [exportCsv.ts](../../src/utils/exportCsv.ts), linhas 18–22 e 67–80.

O escape duplica aspas e remove quebras de linha, mas preserva prefixos como `=`, `+`, `-` e `@`. Um texto controlável exportado, como motivo de contestação, pode ser interpretado como fórmula ao abrir a planilha. Um exemplo inofensivo é `=1+1`; colocá-lo entre aspas CSV não o torna necessariamente texto no Excel.

Impacto depende do programa e de suas proteções: conteúdo enganoso, links ou fórmulas externas. Não foi demonstrada execução remota nem exfiltração. Referência: [OWASP CSV Injection](https://github.com/OWASP/www-community/blob/master/pages/attacks/CSV_Injection.md).

Correção proposta: neutralizar fórmulas nos campos textuais, incluindo espaços/caracteres de controle antes do prefixo; testar o arquivo exportado real no consumidor adotado ou exportar XLSX com células explicitamente textuais. Preservar números legítimos com tipagem adequada.

### S07 — Média: timeout absoluto de sessão não encerra consistentemente

Evidências: [useSessionManager.ts](../../src/hooks/useSessionManager.ts), linhas 52–59, 128, 216–218, 236 e 245; [AuthProvider.tsx](../../src/providers/AuthProvider.tsx), linhas 258 e 404–405.

`checkAbsoluteTimeout()` apenas retorna um booleano. Em callbacks de visibilidade/inatividade, quando as oito horas são ultrapassadas, o código retorna antes de executar `forceLogout`. Uma sessão longa pode, assim, permanecer aberta. No fluxo real, recarregar a página também reinicializa a referência de início em memória. A garantia de oito horas não é efetivamente imposta por esses caminhos.

Correção proposta: deadline independente que execute encerramento, com testes de tempo avançado, aba em segundo plano e reload; manter um instante de início coerente. Para exigir o limite contra cliente modificado, configurar/validar política de sessão no Auth e controle de revogação no servidor. A configuração hospedada não foi consultada nesta auditoria.

### S08 — Média: publicação no Zendesk pode duplicar efeitos

Evidências: [helpdesk-publish-evaluation](../../supabase/functions/helpdesk-publish-evaluation/index.ts), linhas 199–221 e 257–278; [provider Zendesk](../../supabase/functions/helpdesk-publish-evaluation/zendesk.ts), linhas 46–61.

O bloqueio de duplicidade consulta um envio anterior e só registra sucesso depois de chamar o provider. Duas requisições concorrentes podem passar na consulta e publicar duas vezes. `force: true` permite pular a consulta para um chamador já autorizado. Não há quota própria nem timeout explícito nesse fetch do provider.

Impacto: comentários duplicados, consumo de API e resultado inconsistente após falha de persistência. Não representa elevação de privilégio.

Correção proposta: claim/idempotência atômica por monitoria/operação, estados de envio e reconciliação para falhas após o efeito externo; limite por usuário/operação, timeout e auditoria dos reenvios forçados. Um índice local sozinho não desfaz um comentário já publicado.

## Instalação, integridade funcional e desempenho

### D01 — Alta prioridade: cadeia de instalação limpa diverge do produto

Evidências: [prepare-supabase.mjs](../../scripts/prepare-supabase.mjs), linhas 9–27 e 54–64; [incremental fresh](../../supabase/fresh-migrations/20260924000001_privileged_queue_evaluation.sql); [teste fresh](../../scripts/fresh-database.test.mjs), linhas 24–25 e 74–79.

O baseline gerado usa fontes explícitas até o hardening de 15/09; o único incremental fresh é o de acesso privilegiado à fila de 24/09. Ficam de fora as migrations posteriores de fronteira anônima, integridade, presença/fila/IA, anexos e feedbacks. O incremental referencia `public.queue_ticket_assignments%ROWTYPE`, cuja tabela não é criada pelo baseline.

Além de instalação incompleta, o baseline preserva leitura direta de `monitorias` por suporte: o teste fresh existente chega a exigir essa leitura. Isso não equivale à fronteira anônima da cadeia incremental atual. O teste fresh executa `buildFreshSql()`, sem aplicar os incrementais copiados por `prepare()`, logo seu sucesso não garante que o pacote inteiro seja instalável.

Correção proposta: construir uma cadeia fresh completa, revisada e equivalente à atualização existente; testar **todos** os SQLs do pacote final em ordem e executar a mesma matriz de RLS/anonimato nas duas rotas. Não reaplicar indiscriminadamente arquivos históricos `apply_all_pending`/seeds no ambiente existente.

### F01 — Média: conclusão do PDI envia coluna inexistente

Evidências: [useFeedbacks.ts](../../src/hooks/useFeedbacks.ts), linha 165; [CREATE TABLE](../../supabase/migrations/20260926000001_create_agent_feedbacks.sql), linhas 4–20.

`completeFeedback()` envia `completed_at`, mas a tabela versionada não possui essa coluna e não existe migration adicionando-a ao PDI. A operação falha no banco/API baseado nesse schema, embora possa funcionar no mock. Corrigir o contrato com migration incremental e teste que conclua um PDI no schema real; decidir se a data será sempre produzida pelo servidor.

### F02 — Média: envio executivo informa sucesso sem enviar

Evidência: [EmailReportModal.tsx](../../src/components/dashboard/widgets/EmailReportModal.tsx), linhas 111–139.

O handler aguarda 800 ms, monta strings e exibe sucesso. Não chama transporte, Edge Function ou sequer `mailto` (comentado). `sanitizedSubject` e `bodyText` não são usados para entrega. O modal também sugere um anexo sem anexá-lo a uma mensagem.

A Edge Function `send-email` atual é para recusa de solicitação persistida, com formato `{ type: 'rejection', request_id }`; não implementa relatório executivo.

Correção proposta: remover a indicação de envio real enquanto indisponível ou implementar transporte autenticado com escopo do relatório, destinatários autorizados, limites, auditoria e confirmação de entrega/aceitação. Não transformar `send-email` em relay arbitrário de HTML e destinatários fornecidos pelo navegador.

### P01 — Média: consultas sem paginação comprometem indicadores e velocidade

Evidências: [DashboardContext.tsx](../../src/components/dashboard/DashboardContext.tsx), linhas 158, 217–221 e 239–256; [useMonitoriaData.ts](../../src/hooks/useMonitoriaData.ts), linha 38; [useFeedbacks.ts](../../src/hooks/useFeedbacks.ts), linha 33.

Consultas `select('*')` são ordenadas, mas não paginadas; filtros de período e agregações do dashboard ocorrem depois, em memória. Se o limite de linhas da API for atingido, médias/ROI/relatórios podem considerar apenas parte da base sem avisar. A consulta de recibos também coloca todos os IDs recebidos em uma única expressão `.in(...)`, que cresce com a amostra.

Correção proposta: filtros no banco, projeções menores, paginação por cursor, agregações autorizadas por RPC e limites explícitos para exportação. Medir planos com `EXPLAIN (ANALYZE, BUFFERS)` em homologação e escolher índices conforme os filtros reais; testar dataset maior que o limite configurado da API. Não presumir ganho sem medir.

O build atual emitiu alerta para `vendor-other` de aproximadamente 797 kB minificado (254 kB gzip); o worker PDF tem aproximadamente 1,38 MB. Revisar carregamento sob demanda de documentos e telemetria. O build sozinho não mede latência percebida ou p95 de API.

## Controles existentes confirmados e riscos a validar

| Área | Resultado da revisão |
|---|---|
| Anonimato na cadeia incremental atual | Migrations de 22/09 e 25/09 bloqueiam leitura direta por suporte; view deliberadamente definer com filtro explícito e histórico mascarado. Testes de banco passaram. Não confundir com a rota fresh desatualizada. |
| Storage de anexos | Bucket privado e controles por monitoria/papel/equipe, incluindo policies restritivas; testes positivos e negativos passaram. Não foi ensaiado download no Storage hospedado. |
| Usuários e equipes | Há proteção contra elevação direta, vínculo indevido e contas inativas nas tabelas existentes/helpers; testes passaram. O novo PDI não herdou toda essa proteção. |
| Edge Functions autenticadas | Uso de `getUser(token)` e perfil ativo nos fluxos ativos inspecionados. `verify_jwt=false` não é isoladamente falha: as funções fazem validação interna. |
| `send-email` | JWT/papel, destinatário derivado de solicitação persistida, allowlist, quotas e HTML escapado. Não aceita relatório arbitrário. |
| `public-access` | Solicitação valida CAPTCHA/hostname e quotas persistentes; recuperação delega CAPTCHA ao Auth. Ativação e secrets hospedados não verificados. |
| Fila/IA | Quota geral de 60 chamadas/min por usuário e 10 chamadas de IA/5 min; catálogo verificado, atribuição e jobs com controle no servidor. Há retries limitados. Não há garantia demonstrada de orçamento diário/global. |
| XSS e headers | Renderização React, DOMPurify no preview HTML, CSP sem `unsafe-eval`, proteção de frame, HSTS e `nosniff`. Não é prova universal de ausência de XSS. |
| Dependências | `npm audit` retornou zero advisories. Não cobre imports remotos Deno, imagens Docker ou código próprio. |
| Segredos versionados | Busca por padrões de chaves privadas, GitHub, OpenAI e `sb_secret` nos arquivos de aplicação/SQL/scripts/docs não retornou candidatos. `.env` não foi aberto. Não houve varredura exaustiva do histórico Git nem auditoria de secrets remotos. |

Pontos adicionais para o plano de hardening, separados dos exploits confirmados:

- **CAPTCHA de deploy:** `vite.config.ts:26–27` deixa de falhar quando a site key falta e atribui uma dummy key apenas ao objeto local `env`; isso não demonstra que a chave será injetada no cliente. `ProtectedAuthForm.tsx:36–45` aceita flag de preview para domínios `*.vercel.app`, exceto um hostname fixo. Exigir configuração real em produção e separar explicitamente preview. Chaves dummy não provam bypass de um servidor corretamente configurado: [Cloudflare documenta que secrets reais rejeitam tokens dummy](https://developers.cloudflare.com/turnstile/get-started/).
- **Retenção no navegador:** `useMonitoriaDraft.ts` mantém observações em localStorage por chave de usuário; logout não limpa esses rascunhos. A expiração de 48 h só é verificada quando a chave é lida. Namespacing evita mistura na interface, mas não protege contra alguém com acesso ao mesmo perfil de navegador. Definir política para estações compartilhadas e limpeza efetiva. `FormsManagement.tsx` ainda usa a chave global `qualitrack_form_draft`.
- **Sessão Supabase:** `supabase.ts:38` substitui o lock de autenticação por execução direta. Validar rotação de refresh token em várias abas; restaurar exclusão mútua compatível se houver corrida. Não foi reproduzido sequestro de sessão.
- **Filas e cadastro manual:** `canReadQueueTicket()` permite acesso global de gestores de suporte a filas não distribuídas. A especificação específica não impõe escopo por equipe; portanto não classifiquei isso como IDOR confirmado. Formalizar a regra. `resolve_agent` também permite preenchimento manual de equipe sem a mesma evidência exigida em `backfill_agent_team`; revisar a política de provisionamento sem quebrar o fluxo legítimo.
- **Telemetria/IA:** revisar minimização de transcrições e retenção nos provedores; replay mascara texto/mídia, mas `beforeSend` não é uma política completa de remoção de dados sensíveis. O Sentry tem sampling de traces em 100% e a CSP atual não lista seu endpoint; confirmar se a observabilidade chega ao destino antes de depender de alertas.
- **CI:** fixar actions por SHA e restringir o gatilho de comentário do workflow `opencode` a autores autorizados. O YAML não faz essa verificação; o comportamento interno da action não foi validado, portanto não afirmo que qualquer comentarista consegue executar código ou extrair secrets.
- **Docker/Traefik:** o Compose local expõe dashboard com `api.insecure=true` e porta 8081 sem bind explícito a loopback; não publicar essa configuração na rede de produção. O socket Docker montado `:ro` não equivale a uma API Docker limitada a consultas. Revisar proxy de socket, imagens fixadas e runtime em homologação. Não executei containers.
- **Grants e trilha PDI:** tornar grants/revokes explícitos, verificar privilégios não filtrados por RLS (como TRUNCATE) e definir retenção/auditoria, pois o PDI usa `ON DELETE CASCADE` para agente. Não afirmo que authenticated possui TRUNCATE no ambiente real; o catálogo remoto não foi consultado.

## Reavaliação do relatório anterior

| Item anterior | Conclusão desta revisão |
|---|---|
| 1 — Masking de auditores | `maskedUsers` é passado ao widget; substitui nome, mas mantém outras propriedades. A proteção efetiva depende de RLS/view, que foi verificada na cadeia incremental. Não é anonimização universal de objetos no cliente. |
| 2 — BOLA/ciência do PDI corrigidos | **Conclusão refutada:** S01–S03 mostram lacunas no banco. |
| 3 — Média individual | O preenchimento de scores existe; é correção de cálculo, não evidência de autorização segura. |
| 4 — CRLF de e-mail | Sanitização existe em string não utilizada para envio; o fluxo real ainda não foi implementado (F02). |
| 5 — SLA do suporte | Filtro de titularidade presente; depende de isolamento dos dados na origem. |
| 6 — Equipes no dropdown | Melhoria de interface presente; INSERT continua sem escopo no servidor (S02). |
| 7 — Conquistas sem usuário | Guarda de usuário presente; não substitui RLS nem validação de dados. |
| 8 — Namespace de notificações | Chave inclui ID; o estado é inicializado por `useState` e merece teste de troca de conta sem remontar. Não foi demonstrado vazamento remoto. |
| 9 — Datas inválidas no ROI | Validação presente; manter testes de dados incompletos e amostras truncadas. |

Os testes em `securityAuditFixes.test.ts` reimplementam regex/cálculos, e `feedbacks.test.ts` constrói objetos em memória. Eles não chamam o hook real nem exercitam policies/triggers de PDI. Passarem não demonstra que a API rejeita requisições adulteradas.

## Validação executada

| Verificação | Resultado |
|---|---|
| `npm.cmd run lint` | Passou (`tsc --noEmit`; não é lint de segurança) |
| `npm.cmd test` | 219 testes / 33 arquivos passaram |
| `npm.cmd run test:database` | 45 testes passaram |
| `npm.cmd audit --json` | Zero vulnerabilidades conhecidas reportadas |
| `npm.cmd run build` | Passou com parâmetros sintéticos de CI; alerta de chunk grande |
| `npm.cmd run check:bundle` | Passou para esse build sintético |
| Carregamento de config Vite com `sb_secret_` sintético | Prefixo indevido aceito; confirma S05 |
| `node --test scripts/security-review-20260926.test.mjs` | 2 testes de caracterização passaram: falhas de PDI reproduzidas em PGlite e dependência ausente da instalação fresh verificada nas fontes SQL |

As provas adicionais estão em [security-review-20260926.test.mjs](../../scripts/security-review-20260926.test.mjs), executáveis com `node --test scripts/security-review-20260926.test.mjs`. São testes de **caracterização da vulnerabilidade**: passar significa que o comportamento inseguro foi reproduzido, não que foi corrigido. Permanecem fora dos scripts padrão de CI para não se confundirem com regressões de segurança. Ao corrigir, substituir as expectativas por negação e integrar testes permanentes.

Limites das validações: PGlite não reproduz PostgREST, Auth hospedado, Storage HTTP, Realtime, pg_cron real ou runtime Deno. Não houve teste de carga, pentest do ambiente remoto, ensaio de restore, envio de e-mail, chamadas pagas de IA ou publicação no Zendesk.

## Plano de correção e critérios de liberação

1. **Antes de produção:** corrigir S01–S04 com controles no banco/Edge e testes negativos; resolver D01 e comparar instalação limpa com atualização; bloquear chaves secretas no build (S05). Entregar migrations novas, sem apagar o histórico. Registrar snapshot/backup e procedimento de reversão antes de aplicá-las.
2. **Confiabilidade do fluxo:** resolver `completed_at` e envio simulado; neutralizar CSV; corrigir encerramento de sessão e tornar publicação externa idempotente. Verificar mock e Supabase para evitar divergências.
3. **Desempenho com precisão:** filtros/agregações no servidor, paginação e índices medidos; limitar o custo total de IA e instrumentar latência/erros sem registrar conteúdo sensível desnecessário.
4. **Homologação:** matriz anônimo/suporte/qualidade/gestores/admin/inativo, duas equipes distintas, acessos diretos REST/RPC/Edge e tokens anteriores à desativação. Validar ausência de identidade do auditor na tabela, view, histórico, anexos e respostas de funções. Testar concorrência de ciência, conclusão e publicação.
5. **Operação:** confirmar signup desabilitado, CAPTCHA real, sessões/revogação, quotas, recipients de e-mail, logs, backups restauráveis e implantação sincronizada de migrations/Edge/frontend. Só então autorizar push/deploy da versão corrigida.

Políticas RLS permissivas são combinadas por OR; filtros de interface não as tornam mais restritivas. Esse comportamento e as diferenças entre `USING` e `WITH CHECK` estão documentados pelo [PostgreSQL](https://www.postgresql.org/docs/16/sql-createpolicy.html). A revisão usa essa distinção para separar proteção visual de autorização efetiva.
