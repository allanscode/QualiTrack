# Auditoria de fechamento no Zendesk — 06/10/2026

## Estado inicial e execução

Na leitura inicial da API autenticada havia **12 automações** e **73 gatilhos** ativos. Sete automações e três gatilhos tinham a ação `status=closed`. Após autorização do usuário, em 06/10/2026 foram ajustadas **sete automações e dois gatilhos** e criada **uma automação** para sessões resolvidas por IA. O usuário excluiu explicitamente a regra de conversa abandonada do ajuste.

| ID | Regra | Antes | Estado verificado após a alteração |
|---|---|---|---|
| 49371758765204 | Fechar Tickets com Avaliação Positiva | Sem espera | `SOLVED > 56 business hours` |
| 49394572883732 | Fechar Tickets Sem Resposta de Avaliação | 19 horas úteis | `SOLVED > 56 business hours` |
| 43790393894164 | Apagar tickets Novos sem ação | 120 horas corridas no status novo | `NEW > 56 business hours`, com status novo, grupo e canal originais |
| 47994001127700 | Apagar tickets Novos Fechados sem ação | 120 horas corridas no status novo | `NEW > 56 business hours`, com status novo e exclusões de grupos válidos preservadas |
| 38542558166548 | Finalizar Chamados | Sem espera com etiqueta `fechado` | `SOLVED > 56 business hours` |
| 36311943918996 | Fechamento padrão de segurança após 28 dias | 240 horas corridas, apesar do antigo título mencionar 96 | `SOLVED > 672` horas corridas; automação padrão só aceita horas corridas e serve como limite residual |
| 52771253837588 | Fechamento de tickets resolvidos após 56 horas úteis | 29 horas úteis | `SOLVED > 56 business hours`; regra geral para resolvidos |
| 43353496769940 | Fechar conversa (gatilho) | Fechamento imediato com `acao_manual fechado` | Gatilho desativado; tickets resolvidos seguem a regra geral de 56 horas úteis |
| 46822501957652 | Encerrar Sessão Resolvido IA (gatilho) | Encerrava sessão e fechava ticket imediatamente | Continua encerrando a sessão; ação `status=closed` removida |
| 54291680816148 | Fechar tickets resolvidos por IA após 56 horas úteis | Regra inexistente | Nova automação: ticket novo, grupo IA, etiqueta `resolvido_ia` e `NEW > 56 business hours` |
| 41250396150676 | Conversa abandonada (gatilho) | Fechamento imediato | **Intacta**, por decisão expressa do usuário |

O Zendesk usa o campo `NEW` para horas desde a criação do ticket. A automação `47994001127700` continha uma exclusão para o grupo apagado `41794798833428`; a API recusou a atualização até essa condição sem efeito ser removida. A primeira tentativa foi revertida e a leitura posterior confirmou ações e condições originais. A segunda aplicação passou na validação da API e na leitura de todas as regras ativas: **oito automações** fecham tickets, sendo sete alteradas e uma nova; o único gatilho ativo que ainda fecha tickets é **Conversa abandonada**, preservado a pedido do usuário. Os dois gatilhos alterados foram verificados; a função temporária usada para inspeção e aplicação foi excluída após o trabalho.

As etiquetas históricas `removido_5dias` foram mantidas para não afetar regras externas que possam consumi-las, embora o prazo agora seja 56 horas úteis. Os tickets já fechados não são reabertos por estas alterações. A API confirma a configuração, mas a execução exata só pode ser observada quando tickets reais atingirem o novo prazo.

## Calendário e limites

A programação Zendesk ativa (ID `40928832528020`, fuso `Brasilia`) abre de segunda a sexta, **08:00–17:30**: 9,5 horas por dia. O padrão do QualiTrack no código é **08:00–17:00**: 9 horas por dia. A configuração efetiva do QualiTrack em produção deve ser conferida antes de afirmar que as 56 horas do Zendesk dão oito horas de folga a qualquer prazo de contestação de 48 horas do app. O Zendesk executa automações aproximadamente a cada hora, portanto o encerramento ocorre na primeira execução após o limiar, não no minuto exato.

O Zendesk força o fechamento de tickets resolvidos após 28 dias corridos; feriados ou programação reduzida podem impedir que 56 horas úteis caibam nesse limite. Em 2026, a programação Zendesk inclui 12/10 e 02/11 como feriados. O padrão do app também os inclui.

Os feriados Zendesk observados estavam cadastrados individualmente apenas até dezembro de 2026; antes de prometer o mesmo prazo em 2027, cadastrar e conferir os feriados do ano seguinte. A diferença diária de 30 minutos entre os dois calendários também exige comparação com a configuração efetiva da monitoria em produção.

## Referências oficiais

- [Automações: execução e atualização pela API](https://developer.zendesk.com/api-reference/ticketing/business-rules/automations/)
- [Condições temporais em horas úteis](https://developer.zendesk.com/documentation/ticketing/reference-guides/conditions-reference/)
- [Programações e feriados](https://support.zendesk.com/hc/en-us/articles/4408842938522-Setting-your-schedule-with-business-hours-and-holidays)
- [Limite de 28 dias e ciclo de vida](https://support.zendesk.com/hc/en-us/articles/8263915942938-About-the-ticket-lifecycle-and-ticket-statuses)
