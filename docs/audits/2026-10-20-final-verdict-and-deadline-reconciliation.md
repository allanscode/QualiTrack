# Auditoria de vereditos finais e prazos — 20/10/2026

## Vereditos no Zendesk

- Conferidos diretamente no Zendesk 364 tickets finais ativos do fluxo padrão e 528 tickets finais ativos de chamados filhos.
- Os 364 do fluxo padrão já correspondiam ao último veredito do QWP.
- Nos chamados filhos, os tickets 180134, 180330 e 181261 estavam fechados e divergiam: QWP negativo, Zendesk positivo. O worker próprio atualizou somente os campos de avaliação; não publicou comentários. Os três agora exibem `negativa`, `Analisado=true` e as tags `negativa`, `analisado_qa` e `qwp_filho_avaliado`.
- O ticket 180753 foi concluído durante esta correção. Com ele, são 529 monitorias finais de chamados filhos conferidas. O Zendesk já mostrava `positiva`, `Analisado=true` e as tags correspondentes, então nenhum campo do ticket foi alterado.

## Prazo expirado no ticket 180753

A monitoria `c315a981-c56f-4efd-8081-90981015edb5` estava ativa em `aguardando_gestor_qualidade`, com nota 100 e prazo vencido em 15/10/2026. O gestor PJ já havia encaminhado a aprovação à Gestão da Qualidade. A função do cron excluía monitorias PJ com `pj_review_required=true`, mesmo nessa etapa posterior, e por isso deixava a monitoria aberta.

A monitoria agora está `concluida`, com `resolution_type=automatic`, nota 100 e registro de finalização por perda do prazo da Qualidade no histórico. A fila da macro de chamado filho também foi confirmada como enviada. Como o ticket Zendesk estava fechado e seus campos e tags já estavam corretos, o worker não publicou comentário nem alterou o ticket.

## Alterações de produção

- Migration `20261020151510_finalize_expired_quality_review`: inclui etapas vencidas da Qualidade PJ na finalização automática e conclui o ticket 180753.
- Migration `20261020151704_requeue_child_final_verdict_mismatches`: reprocessa as três divergências pelo worker de chamados filhos.
- O reprocessamento de publicações de veredito usa apenas campos para tickets fechados; não publica comentários.

O fluxo inicial `pendente_revisao` do gestor PJ continua separado do prazo da Qualidade. Na conferência havia dois casos expirados nessa etapa inicial: tickets 180643 e 182143. Eles não foram alterados, pois ainda aguardam o primeiro parecer PJ.
