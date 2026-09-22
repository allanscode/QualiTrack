# IA de avaliação: GLM 5.3 Flash via OpenRouter

O único modelo autorizado no fluxo de monitoria é `z-ai/glm-5.3-flash`. O OpenRouter escolhe e alterna automaticamente entre endpoints compatíveis com JSON Schema do mesmo modelo. A aplicação não usa a chave de manutenção do OpenRouter.

## Configuração no Supabase

1. No projeto Supabase correto, cadastre a chave de inferência como secret da Edge Function com o nome `OPENROUTER_API_KEY`. Não a inclua em `.env` do frontend, migrations, banco, logs ou comandos registrados no histórico do shell. A chave de manutenção não é necessária.
2. Aplique `20260922000013_ai_retry_queue.sql` e `20260922000014_enable_ai_retry_scheduler.sql` e publique novamente a Edge Function `helpdesk-queue`. A segunda migration ativa `pg_cron` e `pg_net` e agenda `wp-quality-ai-retries` a cada minuto.
3. No Vault, crie `ai_retry_project_url` com a URL do projeto Supabase e `ai_retry_service_key` com a chave secreta **nomeada** (`default`, `sb_secret_…`) do mesmo projeto. Este projeto prioriza `SUPABASE_SECRET_KEYS` sobre a chave legada `service_role`; a chave legada falha na autorização do worker. **Não** armazene a chave OpenRouter no Vault ou na tabela de retries. Sem esses dois valores, o cron não dispara chamadas e os jobs ficam pendentes.
4. Confirme que o cron está ativo em Supabase > Integrations > Cron e que a Edge Function recebe chamadas `process_ai_retries` após uma falha transitória.

## Comportamento

- Cada ticket possui um único job ativo. O payload necessário para reprocessar é persistido na tabela privada `ai_evaluation_retry_queue`, sem chave de API e com diálogo sanitizado.
- Uma chamada tenta o mesmo modelo até quatro vezes, com backoff de 0,5 s, 1 s e 2 s. O OpenRouter gerencia o failover entre providers em cada tentativa.
- Se 429, timeout, 5xx ou resposta inválida persistirem, o job continua `running` e o worker tenta novamente em 1, 2, 4, 8... minutos, até o máximo de uma hora entre tentativas.
- Erros definitivos de autenticação/configuração encerram o job com erro. O resultado só é salvo após validar o JSON e apenas pela transação de conclusão do job.
- A chave de inferência exposta foi substituída no secret da Edge Function e desativada no OpenRouter. A chave de manutenção que foi compartilhada também precisa ser revogada e recriada na conta OpenRouter; ela não é usada pela aplicação.
