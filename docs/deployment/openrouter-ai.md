# IA de avaliação pelo OpenRouter

A Edge Function `helpdesk-queue` usa uma única secret `OPENROUTER_API_KEY` para chamar, nesta ordem, os modelos pagos:

1. `z-ai/glm-5.3-flash` — primeira opção para prompts longos de tickets, com entrada barata e boa capacidade.
2. `google/gemma-4-31b-it` — contingência com saída barata.
3. `google/gemini-3.8-flash` — última contingência, de custo mais alto.

Os IDs não usam o sufixo `:free`. O OpenRouter pode alternar provedores dentro de cada modelo. O JSON Schema é enviado no prompt e a aplicação valida a resposta antes de persistir a avaliação; a chamada atual não envia `response_format: json_schema`.

## Configuração no Supabase

1. Cadastre a chave de inferência como secret `OPENROUTER_API_KEY` da Edge Function. Não a inclua no frontend, migrations, banco ou logs. A mesma chave serve aos três modelos.
2. Aplique `20261002000001_gemma4_ai_phase.sql` antes de publicar `helpdesk-queue`. A migration permite as fases `running_glm`, `running_gemma` e `fallback_gemini`.
3. Opcionalmente configure `AI_PRIMARY_TIMEOUT_MS`. O padrão é 120000 ms por modelo, limitado pelo backend entre 1000 e 300000 ms. Cada modelo admite até duas tentativas dentro dessa janela, com espera progressiva em falhas transitórias.
4. No Vault, configure `ai_retry_project_url` com a URL do projeto e `ai_retry_service_key` com a chave secreta nomeada do mesmo projeto. Esses valores permitem ao cron chamar `process_ai_retries`; a chave OpenRouter fica somente nos secrets da função.
5. Confirme que o cron está ativo em Supabase > Integrations > Cron.

## Comportamento

- Um ticket tem um único job ativo. O payload de reprocessamento fica na tabela privada `ai_evaluation_retry_queue`, sem chave de API e com diálogo sanitizado.
- Após duas tentativas malsucedidas do GLM, a cadeia tenta Gemma; depois, Gemini. Falhas definitivas de credenciais ou configuração interrompem a cadeia. Falhas transitórias podem entrar na fila de reprocessamento.
- O cancelamento muda o job para `cancelled` e impede que uma resposta tardia conclua o ticket. A fase do job é persistida para acompanhar o progresso.
- As tentativas registram modelo, provedor quando disponível, duração, status HTTP, tokens, custo e ID de geração. A chave e o prompt não são persistidos nos logs técnicos. O custo definitivo pode ser conferido pelo ID de geração no OpenRouter.
- O resultado é salvo somente após validar o JSON e concluir o job no banco.

## Testes com cobrança

Os testes locais usam respostas simuladas e não fazem chamadas pagas. Para testes ao vivo, use um projeto Supabase de staging dedicado com `E2E_EXPECTED_PROJECT_REF` e `E2E_ALLOW_MUTATIONS=1`. O deploy em produção e a inclusão da chave real são etapas operacionais separadas.
