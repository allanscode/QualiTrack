# Cópia diária de produção para staging — pendente

**Estado:** análise concluída; agendamento e cópia automática ainda não ativados.

O código de simulação do staging já impede que workers de IA e publicação automática
processem filas, mantém a avaliação manual via OpenRouter e bloqueia mutações no Zendesk.
A publicação dessas proteções no projeto de teste depende de acesso às Edge Functions:
a credencial de gestão disponível não enxerga o projeto atual
`njzrnwfjbmyfhemejvby` (HTTP 404). Até o deploy ser confirmado, o staging remoto não deve ser
considerado protegido.

O banco de produção tinha aproximadamente **55 MB em 08/10/2026**. Uma cópia lógica diária
transferiria até cerca de **1,65 GB/mês de dados brutos** (55 MB × 30; compressão reduz o
tráfego). O staging atual é `njzrnwfjbmyfhemejvby`, mas a credencial de gestão atual
não tem acesso a esse projeto; portanto, plano, cota e capacidade de restauração lá ainda
precisam ser confirmados. O limite gratuito publicado é 500 MB de banco por projeto; um
projeto Pro adicional começa em US$ 10/mês de compute dentro de uma organização Pro, cujo
plano começa em US$ 25/mês. Excedentes de armazenamento e transferência dependem do plano.
Não há cobrança específica por cada `pg_dump`/restauração, mas computação e tráfego podem
ser faturados. Conferir a fatura e as cotas reais antes de agendar.

**Horário proposto:** 03:00, horário de São Paulo, diariamente. Nos últimos sete dias
consultados, os logs de IA se concentraram entre 07:00 e 18:00; não houve execuções entre
23:00 e 06:00. Reavaliar o horário com uso real antes de ativar.

O staging atualizado diariamente serve como ambiente de recuperação rápida, mas **não é
um backup histórico**: cada atualização sobrescreve o estado anterior. Guardar também dumps
criptografados fora do projeto, com retenção de pelo menos sete dias, e testar restauração.
O backup nativo diário do Supabase já está incluído em projetos Pro, Team e Enterprise,
com retenção que depende do plano; projetos Free precisam de exportação própria.

Não usar a operação de restauração física direta para o staging operacional: o Supabase
informa que ela copia extensões e jobs `pg_cron`/`pg_net`, que começam a rodar assim que o
novo projeto é criado. A rotina segura precisa de cópia lógica com uma etapa de quarentena:

1. Produzir dump consistente e criptografado; validar checksum e manifest, sem chaves de API.
2. Desativar no destino todos os jobs de cron, automações de IA, webhooks e outboxes antes
   de tornar o staging acessível. Nunca copiar Edge Secrets de produção. O OpenRouter pode
   ser configurado para avaliações **manuais**, iniciadas por um usuário, sem disparos automáticos.
3. Aplicar guardas de ambiente no código: em staging, impedir os workers automáticos e toda
   mutação Zendesk (`POST`, `PUT`, `PATCH`, `DELETE`), mesmo se uma chave for inserida por engano.
   A publicação manual deve retornar uma simulação identificada, sem recibo de envio real.
4. Restaurar em staging, verificar contagens, RLS, autenticação, ausência de segredos e
   ausência de jobs/outboxes ativos. Só então trocar a base de teste em uso.
5. Fazer um teste periódico de restauração, avaliação manual com IA e bloqueio de mutações
   externas; alertar se
   qualquer etapa falhar. Falha deve preservar o staging anterior e o último dump íntegro.

Antes de implementar, confirmar acesso de gestão ao projeto de staging, cotas do plano,
destino off-site criptografado, política de retenção e janela de indisponibilidade aceita.
