# Reavaliação candidata das monitorias pendentes de production — 19/10/2026

## Escopo verificado

Consulta somente leitura à production `vpytvgpsqdapgouyjowc` confirmou **460 monitorias ativas em `pendente_revisao`**: 268 Revenda, 186 Cliente Final e 6 Ticket Filho. Dessas, **26 já têm `helpdesk_submissions.status='sent'`** (12 Revenda e 14 Cliente Final). Elas permanecem no lote de candidatos; o runner não publica, não seleciona nem altera monitorias oficiais. A produção é consultada exclusivamente por SQL `SELECT` e Zendesk exclusivamente por `GET`.

As fichas vigentes no develop `secfejmccojxsvdntljx` usam os mesmos IDs por tipo que a production: Revenda `f1fc47e9-6d51-40a5-938e-8108e225195e` (15 questões), Cliente Final `8f84cfd0-8a3c-4735-8921-2eef159f094c` (17) e Ticket Filho `6c7d1e88-841b-4da9-9a66-9f1464ce896f` (6). Os IDs e a ordem das questões coincidem. As `sections` do Ticket Filho diferem porque a production conserva três marcas antigas `is_critical`; o develop tem zero. As três fichas develop têm `critical_errors=[]` e zero `is_critical`. O cálculo do runner usa apenas pesos e respostas da ficha develop: **nenhuma resposta `NAO` zera automaticamente a nota**. A execução bloqueia se uma ficha develop voltar a ter regra crítica ou se o mapeamento de questões divergir.

Os três manuais ativos no develop mapeiam um a um pelos títulos: **Manual de atendimento Webposto Revenda**, **Manual de atendimento Webposto Cliente Final** e **Manual de ticket filho — versão 1.4**. O runner exige exatamente um manual por tipo e inclui somente o manual correspondente no prompt e no hash de entrada.

O endpoint somente leitura `/api/v1/auth/key` do OpenRouter informou `limit=20`, `usage=20.00005855`, `limit_remaining=0`. **Nenhuma chamada de modelo foi feita.** `--execute` é bloqueado enquanto o orçamento restante for zero ou desconhecido.

O preflight integral percorreu as 460 monitorias e os comentários Zendesk paginados sem erro: **61** têm diálogo armazenado no snapshot de produção e também comentários Zendesk; **399** não têm diálogo armazenado, mas têm comentários Zendesk. Nenhum ticket ficou sem fonte. O runner prioriza o diálogo armazenado quando disponível e usa Zendesk nos demais; registra somente hash SHA-256, tipo de fonte e contagem, nunca o texto cru.

Uma leitura posterior, ainda em 19/10, encontrou **459** pendentes ativas: Cliente Final caiu de 186 para 185, enquanto o total de Cliente Final concluídas subiu de 197 para 198. No mesmo intervalo, as pendentes já enviadas passaram de 26 para 25. Esses agregados são compatíveis com uma transição de status; não foi feita uma comparação por ID para atribuí-la. O preflight registra o total atual e sinaliza diferença para a base de 460; o executor consulta apenas as linhas ainda ativas e pendentes e relê cada uma antes de guardar o candidato. A contagem de 460 acima é a fotografia confirmada no preflight integral, não uma constante exigida para execuções futuras.

## Arquivos preparados

- `scripts/production-pending-reevaluation.mjs` e `scripts/production-pending-scoring.mjs`: preflight e executor separados do runner antigo. Lista os totais por status/tipo, as 26 já enviadas, cobertura de diálogo guardado em `form_snapshot.ai_evaluation.dialogue` e comentários reais Zendesk, comparativo de fichas e orçamento. A leitura de Zendesk percorre páginas e respeita HTTP 429. O executor é sequencial, espera 32 segundos entre modelos, usa `--cursor` UUID e `--limit` (padrão 10), consulta o orçamento antes de cada chamada e interrompe ao primeiro erro. Um hash de entrada combina ID externo, `updated_at`, status, nota, ficha develop, manual do tipo e diálogo. Repetições encontram o candidato existente; uma alteração de origem gera outra chave. Antes de gravar, o runner relê o estado de production e, se Zendesk foi a fonte, confirma novamente o hash dos comentários.
- `supabase/migrations/20261019000005_production_pending_reevaluation_staging.sql`: tabela isolada **somente para develop**, com unicidade por projeto/ID externo/hash; sem FK para monitorias develop, sem policy de cliente e sem caminho de seleção ou publicação. Guarda fonte e SHA-256 do diálogo, contagem de comentários, snapshot mínimo `status`/`updated_at`/`score`/`form_id`, hash da ficha/manuais, respostas, justificativas e notas da IA. Não guarda diálogos crus. A migration está apenas no workspace; **não foi aplicada**.

## Operação futura, após revisão e reposição de orçamento

Configurar `SUPABASE_PRODUCTION_ACCESS_TOKEN` e `SUPABASE_DEVELOP_ACCESS_TOKEN` (ou `REEVALUATION_SECRET_FILE`), `OPENROUTER_API_KEY`, e credenciais Zendesk via `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN` (ou `ZENDESK_ENV_FILE`). Não registrar os valores nem redirecionar saída que contenha dados de origem.

1. Revisar e aplicar **somente no develop** a migration nova.
2. Executar `node scripts/production-pending-reevaluation.mjs --preflight` e conferir 460, três tipos, cobertura e orçamento positivo.
3. Após autorização separada para consumir OpenRouter, executar lotes explícitos com `--execute --limit 10`; retomar com `--cursor <next_cursor>` do último preflight/lote. Cada conclusão imprime apenas ID de cursor, ID do candidato e nota proposta. Conferir candidatos antes de qualquer decisão oficial.

O staging não altera a nota ou o status oficiais, não grava em production e não envia ao Zendesk. Candidatos dos 26 já enviados também são apenas dados de revisão; não representam autorização de republicação.

## Validação local

`npm.cmd run lint` passou; `npm.cmd test` passou com 527 testes; `node --test scripts/fresh-database.test.mjs` passou com 15; `node --test scripts/production-pending-reevaluation.test.mjs` passou com 2, verificando que `is_critical` antigo não zera nota, além de isolamento, RLS e unicidade. Um `--execute --limit 1` foi tentado apenas para verificar o bloqueio: saiu antes de qualquer GET Zendesk ou chamada de modelo porque a migration não foi aplicada e o orçamento é zero. O preflight completo confirmou 460 e cobertura 61/399. Nenhuma migration foi aplicada, nenhum candidato foi criado e nenhuma chamada OpenRouter de avaliação foi feita.
