# Fila de positivas: tratamento aplicado em 16/10/2026

## Números verificados no QWP

| Situação | Tickets | Tratamento |
|---|---:|---|
| Parecer antigo com nota abaixo de 75% | 394 | 390 apontam erro crítico; 377 têm ficha, evidência, auditor e agente/equipe ativos e estão aptos à conversão controlada |
| Erro crítico atribuído a gestor de atendimento | 13 | Convertidos pelo fluxo comum após incluir `gestor_suporte` como avaliado |
| Nota abaixo de 75% sem erro crítico confirmado | 4 | Revisão humana |
| Evidência externa pendente | 84 | Conferir vínculo, aprovação ou ticket relacionado; 80 também apontam erro crítico, mas ainda não podem ser invalidados automaticamente |
| Preparação bloqueada | 90 | 64 classificação de cliente, 10 agente/equipe, 9 transcrição, 5 falhas HTTP, 2 cliente não identificado |
| Monitorias já concluídas | 253 | Sem intervenção nesta operação |
| Ignorados pela automação | 2 | Conferência específica, se necessário |

Os números vêm de consultas somente de leitura ao banco de produção. Podem mudar com novas entradas na fila.

## Fluxo preparado

Para novas positivas, um erro crítico comprovado com evidência completa gera uma monitoria salva, nota zero e status `pendente_revisao`. O primeiro responsável é o gestor de atendimento em qualquer equipe, inclusive PJ. O monitor de qualidade não precisa homologar esse parecer antes do gestor.

A avaliação automática passa a gerar um `auditor_record` a partir dos critérios e justificativas. Esse texto ocupa o campo `evaluator_note`, usado também pela ficha manual. O QWP o mostra como **Registro do Auditor**. Chamados filhos seguem a mesma regra na conclusão automática. O Zendesk só recebe o registro de uma positiva invalidada após a decisão final; a nota é interna e usa o modelo da publicação manual. Publicações incertas ficam bloqueadas para conferência, evitando comentário duplicado.

O histórico de 377 positivas elegíveis já possui resumos profissionais, mas não um `auditor_record` separado. O script [2026-10-16-positive-critical-backfill.sql](2026-10-16-positive-critical-backfill.sql) copia cada resumo sem reescrever fatos, marca sua origem como `legacy_ai_summary` e cria as monitorias em uma única transação. Ele cancela a transação se algum resultado não ficar com nota zero, registro salvo e rota padrão do gestor.

No painel de administração, **Inteligência Artificial > Automações** mostra as pendências por motivo e os IDs dos tickets. **Notificações** permite ligar ou desligar cada tipo de aviso por pessoa. Avisos de chamado filho para a Qualidade aparecem somente quando a IA solicita revisão humana.

## Verificações locais

- TypeScript, suíte de interface, suíte de banco e build de produção passaram.
- O teste do backfill converte um caso histórico em banco isolado e confirma nota zero, registro e rota padrão.
- O teste do Zendesk confirma envio apenas após autorização final, nota interna, consulta de comentários anteriores e bloqueio de escrita ambígua.

## Aplicação em produção

Publicação autorizada e executada em 16/10/2026. As migrações `20261016142743`, `20261016142913` e `20261016144152` foram aplicadas por uma cópia isolada que excluiu a migração local não relacionada `20261015000003_automation_dispatch_rate_limit.sql`. As funções `helpdesk-queue` e `helpdesk-publish-evaluation` foram publicadas. O frontend foi montado a partir do commit de produção `9ae317e` com apenas os arquivos desta entrega e publicado na Vercel como `dpl_88sF6ViQRn3jqCiCQcLNKJFLB17D`, com a orientação corrigida para os casos de gestor avaliado. O domínio `qwp.qualityautomacao.com.br` respondeu HTTP 200 e apontou para esse deploy.

O script de conversão foi executado em uma transação. Resultado conferido no banco: **377 monitorias**, todas com status `pendente_revisao`, nota zero, Registro do Auditor preenchido e `review_route=standard_manager`; nenhuma entrou na outbox de invalidação final antes da decisão do gestor. As nove equipes envolvidas têm pelo menos um gestor ativo vinculado. O primeiro caso positivo concluído após a publicação já tinha `auditor_record` salvo e envio ao Zendesk com status `sent`.

Após a primeira conversão, restavam **17** pareceres legados de nota baixa: 13 com erro crítico atribuídos ao mesmo gestor de atendimento da equipe TEF, e quatro sem erro crítico confirmado. O cadastro desse gestor estava ativo e a equipe vinculada corretamente. A regra anterior admitia apenas avaliados com perfil `suporte`; a ampliação e a conversão posterior estão registradas abaixo. Também restavam **84** casos de evidência externa pendente e **91** bloqueios de preparação; as filas continuam recebendo tickets novos. Nos chamados filhos, havia sete pareceres em `review_required` e sete eventos `child_ticket_review_required`; os eventos antigos de simples criação não são mais exibidos no sino do QWP.

Os 13 tickets do gestor TEF são: `180794`, `181213`, `181353`, `181575`, `181808`, `181830`, `182426`, `182771`, `182784`, `182813`, `183067`, `183138` e `184505`. A função de decisão do gestor permite atuar sobre qualquer monitoria da sua equipe, inclusive quando ele é o avaliado. O responsável confirmou que esse gestor deve seguir o fluxo comum e pode contestar a própria avaliação.

Em nova leitura da fila, os casos de evidência externa passaram de 84 para **85**. Pelos motivos registrados, 79 pedem conferência de chamado filho ou QP, quatro pedem conferir o campo de descrição ou tabulação do Zendesk, e dois pedem conferir tempo de atendimento ou SLA. Entre os **91 bloqueios**, 65 são tipo de cliente ambíguo, dez são identificação de agente/equipe, nove são transcrição sem identificação segura, cinco são falhas HTTP dos modelos e dois são tipo de cliente ausente. Esses grupos indicam o tratamento prioritário no painel: conferir vínculos de filhos/QP, corrigir tags de tipo de cliente, depois cadastro e transcrição. Falhas HTTP exigem correção da integração antes de nova tentativa.

## Gestor que também atende tickets

O responsável confirmou que os 13 tickets TEF devem seguir o mesmo fluxo das demais monitorias: o gestor é o avaliado e pode registrar contestação. A migração `20261016153322_positive_manager_as_evaluated_agent.sql` amplia os filtros da automação para aceitar `gestor_suporte` como avaliado, sem mudar seu perfil nem a função de decisão. A preparação da fila na função `helpdesk-queue` foi ajustada pelo mesmo motivo. O script [2026-10-16-positive-manager-backfill.sql](2026-10-16-positive-manager-backfill.sql) converte somente os 13 IDs conferidos, com verificação de nota zero, Registro do Auditor e rota padrão em uma transação. O teste de banco confirma que um gestor avaliado pode contestar no fluxo comum; lint e 524 testes de interface passaram.

Publicação adicional autorizada e aplicada em produção em 16/10/2026: migração `20261016153322`, função `helpdesk-queue` versão 194 e painel Vercel `dpl_5osbEdiiVgv23SB1XmDkGpC82axq`. O domínio `qwp.qualityautomacao.com.br` apontou para esse deploy e respondeu HTTP 200. A transação criou **13 monitorias**; todas ficaram com nota zero, status `pendente_revisao`, Registro do Auditor preenchido, `review_route=standard_manager` e `pj_review_required=false`. Os 13 registros da fila passaram a `completed` e nenhuma dessas monitorias entrou na outbox de invalidação final antes da decisão. Assim, as **390 positivas legadas com erro crítico e evidência completa** foram encaminhadas ao fluxo do gestor, considerando as 377 da primeira conversão e estas 13.

Na última leitura, as 390 permaneciam pendentes de decisão e com nota zero. A fila de positivas tinha **89** tickets em `review_required`: quatro pareceres de nota baixa sem erro crítico confirmado e 85 com evidência externa pendente. Outros **91** estavam `blocked`. Esses números podem variar com novas entradas e ações no QWP.

Os 91 bloqueios estavam com `next_attempt_at='infinity'`, portanto não serão retomados automaticamente sem corrigir a causa e liberar uma nova tentativa. A maior parte é classificação ambígua ou ausente do tipo de cliente (67). Os 85 casos de evidência externa continuam reservados para conferência humana; não devem ser invalidados apenas pela nota da IA.
