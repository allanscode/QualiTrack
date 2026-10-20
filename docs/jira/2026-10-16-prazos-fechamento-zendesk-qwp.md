# Card WQ-80: ajustar prazo de fechamento Zendesk e janela de ação QWP

**Link:** https://qualityautomacao.atlassian.net/browse/WQ-80

**Projeto:** WQ  
**Tipo:** Task  
**Prioridade:** Urgente  
**Status:** Criado no Jira; execução em andamento

## Objetivo

Tickets elegíveis devem permanecer editáveis no Zendesk durante toda a janela de ação da monitoria QWP. O QWP deve vencer pelo menos uma hora útil antes do primeiro fechamento automático possível no Zendesk. O fechamento deve ocorrer em até quatro jornadas úteis da agenda aplicada ao ticket, sujeito à execução horária das automações.

## Alcance da mudança

- Aplicar a nova política somente a tickets novos após a ativação e a monitorias criadas a partir desse corte.
- Preservar tickets existentes e os prazos de monitorias já criadas. Não executar atualização em massa de tickets nem recalcular monitorias antigas.
- Preservar o gatilho de conversa abandonada conforme decisão anterior.
- Não alterar os dados da avaliação nem o resultado das monitorias.

## Configuração e implementação

- Agenda Zendesk auditada: segunda a sexta, 08:00–17:30, horário de Brasília; quatro jornadas equivalem a 38 horas úteis.
- Nova elegibilidade de fechamento: 37 horas úteis a partir de `SOLVED` para resolvidos e de `NEW` para as regras de tickets novos. Manter grupos, canais e outras condições das regras existentes. A regra residual de 28 dias permanece.
- Prazo máximo do QWP para novas monitorias elegíveis: 36 horas úteis contadas do mesmo marco Zendesk e com a mesma agenda/feriados, limitado também pelo prazo normal da monitoria. O QWP consulta o marco confirmado pelo Zendesk. A rotina de vencimento do QWP continua a executar a cada cinco minutos.
- Evitar que as novas automações alcancem tickets anteriores ao corte. A forma de marcação de tickets novos depende da confirmação sobre etiqueta técnica.
- A configuração atual de produção do QWP é revisão de agente em 50 horas úteis, das 08:00 às 17:00, a partir da criação da monitoria. Essa configuração sozinha não garante a margem e não deve ser simplesmente trocada por 36.

## Aceite

1. Ticket anterior ao corte mantém o fechamento e a monitoria já existentes.
2. Ticket posterior ao corte segue a regra nova sem atualização individual manual.
3. Nova monitoria de ticket elegível vence pelo menos uma hora útil antes da primeira possibilidade de fechamento Zendesk.
4. Nenhuma automação nova fecha ticket com monitoria antiga ainda sob o prazo original.
5. Verificação de regras Zendesk e configurações QWP após a implantação, sem editar tickets para testar.

## Observações operacionais

Automações Zendesk executam aproximadamente de hora em hora e podem atrasar. Um limite absoluto de quatro jornadas não é garantido pela plataforma. Feriados e agenda aplicada ao ticket devem ser confirmados antes da ativação. O gatilho de conversa abandonada é uma exceção de fechamento imediato.
