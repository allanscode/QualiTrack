# Recuperação do chamado filho #177882

Consulta somente leitura ao banco de produção em 06/10/2026.

- Chamado filho do ticket pai #177599, tipo **Nova Demanda**.
- Parecer de IA concluído em 02/10/2026 às 19:16 UTC (`ai_evaluation_jobs.job_id`: `27f1acd6-3f08-4540-9bda-0347733cc76a`).
- A IA sugeriu **60% / não conforme**. Marcou assunto e preservação da macro como conformes; marcou o direcionamento do campo “Para” como não conforme.
- Não existe linha em `monitorias` nem em `helpdesk_submissions` para o ticket.
- O retrato em `queue_ticket_catalog` contém a tag `qwp_filho_avaliado`. Essa tag, por si só, não comprova o conteúdo do comentário nem recupera as respostas da ficha humana.

## Recuperação segura

Após publicar a correção, o monitor pode abrir **Nova Monitoria**, buscar **177882** e escolher **Recuperar chamado filho**. O sistema exibirá o parecer existente da IA dentro da ficha própria. O monitor deve conferir os critérios, registrar a avaliação humana e salvar. Uma nota final inferior a 75% seguirá para revisão, sem envio de macro. Uma nota válida e concluída tentará publicar o Registro do Auditor no Zendesk; se o ticket estiver fechado ou o Zendesk falhar, a monitoria permanecerá salva e o envio poderá ser conferido na ficha.

Não preencher automaticamente respostas humanas com o parecer da IA: os três checks resumidos não correspondem a todas as perguntas da ficha, e o veredito humano anterior não está registrado no QWP.
