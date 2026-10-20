# Modelo OpenRouter das avaliações

Administradores escolhem o modelo principal em **Administração → Central de IA → Automações**, usando a lista suspensa dos modelos discutidos. Os IDs são validados no backend contra o catálogo atual do OpenRouter antes de salvar. Mesmo modelos gratuitos podem ter limites de requisição do provedor e gerar avaliações de qualidade diferente.

O seletor não depende de digitação manual ou de uma busca livre. Gemini 3.8 Flash é tratado como pago; não há `google/gemini-3.8-flash:free` na lista. As respostas continuam sendo JSON validado pela aplicação; o cliente Chat Completions não exige suporte de `response_format: json_schema` do provedor. Modelos gratuitos podem ter limites de uso, e os provedores NVIDIA podem registrar prompts: use esses endpoints de teste apenas com dados autorizados para o provedor.

A seleção fica em `public.ai_model_config` (`id = 'default'`), com leitura via RLS para administradores ativos e escrita apenas pela Edge Function. A `helpdesk-queue` verifica o papel no banco e valida novamente o ID contra o catálogo antes de salvar; clientes autenticados não recebem permissão de escrita direta. A chave OpenRouter permanece exclusivamente em Supabase Secrets ou no ambiente local. Sem registro de configuração, a Edge Function usa `z-ai/glm-5.3-flash`; o runner `production-pending-reevaluation.mjs` usa seu padrão anterior `google/gemma-4-31b-it`. A Edge Function lê a configuração do projeto em que está implantada; o runner lê o registro do projeto develop.

A migração `20261019191500_ai_model_config.sql` cria a configuração em banco e foi confirmada no histórico do projeto de produção. O seletor não executa avaliações ao carregar ou salvar.
