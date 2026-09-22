# IA de avaliação: GLM 5.3 Flash com Gemini 3.8 Flash como contingência

O modelo principal é `z-ai/glm-5.3-flash`. Após timeout ou falhas esgotadas, o fallback pago é `google/gemini-3.8-flash`. Ambos usam OpenRouter com roteamento/failover de providers e JSON Schema; nenhuma variante `:free` ou API direta do Google é usada. A aplicação não usa a chave de manutenção do OpenRouter.

## Configuração no Supabase

1. No projeto Supabase correto, cadastre a chave de inferência como secret da Edge Function com o nome `OPENROUTER_API_KEY`. Não a inclua em `.env` do frontend, migrations, banco, logs ou comandos registrados no histórico do shell. A chave de manutenção não é necessária.
2. Configure `AI_PRIMARY_TIMEOUT_MS=30000` como secret e aplique também `20260922000023_ai_cancellation_and_phase.sql` e `20260922000024_ai_cancellation_ack.sql` antes de publicar a Edge Function `helpdesk-queue`. As migrations `20260922000013` e `20260922000014` mantêm a fila e o cron de reprocessamento.
3. No Vault, crie `ai_retry_project_url` com a URL do projeto Supabase e `ai_retry_service_key` com a chave secreta **nomeada** (`default`, `sb_secret_…`) do mesmo projeto. Este projeto prioriza `SUPABASE_SECRET_KEYS` sobre a chave legada `service_role`; a chave legada falha na autorização do worker. **Não** armazene a chave OpenRouter no Vault ou na tabela de retries. Sem esses dois valores, o cron não dispara chamadas e os jobs ficam pendentes.
4. Confirme que o cron está ativo em Supabase > Integrations > Cron e que a Edge Function recebe chamadas `process_ai_retries` após uma falha transitória.

## Comportamento

- Cada ticket possui um único job ativo. O payload necessário para reprocessar é persistido na tabela privada `ai_evaluation_retry_queue`, sem chave de API e com diálogo sanitizado.
- O GLM pago é sempre o primeiro modelo. A janela total do GLM é de 30 segundos, incluindo até quatro tentativas com backoff; respostas posteriores à expiração são descartadas. Só então o Gemini pago recebe até três tentativas. O OpenRouter pode alternar providers do mesmo modelo em cada chamada.
- Cancelamento manual muda o job para `cancelled`, remove-o da fila de retries e impede conclusão/fallback mesmo após reload. O worker confirma a interrupção no banco antes de outro job poder começar no mesmo ticket. O banco rejeita resultados de IDs antigos. A fase do job (`pending`, `running_glm`, `fallback_gemini`, `retry_pending`) é persistida sem revelar modelo na interface.
- Tentativas registram job/modelo/provider quando disponíveis, timestamps, duração, HTTP, tokens, custo e ID de geração. A chave e o prompt não são persistidos nos logs técnicos. Para conferir custo/provider definitivos, use o ID de geração na atividade do OpenRouter.
- Se 429, timeout, 5xx ou resposta inválida persistirem, o job continua `running` e o worker tenta novamente em 1, 2, 4, 8... minutos, até o máximo de uma hora entre tentativas.
- Erros definitivos de autenticação/configuração encerram o job com erro. O resultado só é salvo após validar o JSON e apenas pela transação de conclusão do job.
- A chave de inferência exposta foi substituída no secret da Edge Function e desativada no OpenRouter. A chave de manutenção que foi compartilhada também precisa ser revogada e recriada na conta OpenRouter; ela não é usada pela aplicação.

## Testes E2E com cobrança

Os testes live recusam o projeto de produção mesmo com opt-in. Para rodá-los, configure um projeto Supabase de staging dedicado, informe seu ID exato em `E2E_EXPECTED_PROJECT_REF` e habilite `E2E_ALLOW_MUTATIONS=1` somente nesse ambiente. As fixtures carregam marcador de origem e a rotina de limpeza remove apenas contas/tickets criados pelo teste. Não execute esses cenários com contas ou dados reais de produção.
