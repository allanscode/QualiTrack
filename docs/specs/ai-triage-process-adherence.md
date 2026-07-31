# SPEC: Triagem de tickets e aderência a processo via IA

> Status: **rascunho para discussão**. Nada implementado.
> Ver resumo executivo em `docs/ROADMAP.md`.

## Resumo

Hoje o QualiTrack só conhece os atendimentos que **alguém decidiu
auditar**. A proposta é inverter isso: trazer o universo completo de
tickets, apontar os que ficaram de fora da amostra e usar IA para (a)
sugerir uma pré-avaliação com base na ficha e no sentimento do cliente e
(b) verificar se o atendimento seguiu os processos publicados no
Confluence.

## Problema

A monitoria de qualidade é feita por amostragem manual. Isso gera três
lacunas:

- **Cobertura desconhecida.** Não se sabe quantos nem quais atendimentos
  ficaram sem avaliação.
- **Amostra enviesada.** Auditor escolhe o que auditar; casos
  problemáticos podem nunca ser vistos.
- **Processo não verificado.** Mesmo em tickets avaliados, a aderência ao
  processo documentado no Confluence não é checada de forma sistemática.

## Descoberta crítica — pré-requisito não óbvio

**O QualiTrack não tem o conceito de "ticket".**

Verificado no schema (`supabase/migrations/20260520000000_initial_schema.sql`):
existem 11 tabelas — `teams`, `users`, `forms`, `monitorias`,
`access_requests`, `quality_configs`, `dissatisfaction_fields`,
`user_teams`, `user_preferences`, `business_hours`, `holidays`. **Nenhuma
tabela de tickets.**

Em `monitorias`, o ticket é apenas:

```sql
ticket_id TEXT,
channel   TEXT,
```

Texto livre, digitado pelo auditor. Não há chave estrangeira, nem
validação, nem origem externa. Uma busca por
`zendesk|confluence|openai|anthropic` no código-fonte e nas Edge
Functions não retorna nenhuma ocorrência.

**Consequência:** "filtrar os tickets que não foram avaliados" é hoje
impossível — o sistema não sabe quais tickets existem, apenas os que
foram avaliados. É como pedir a lista de ausentes tendo só a lista de
presentes.

Isso não invalida a ideia; apenas revela que ela depende de uma etapa
anterior, descrita como Épico 0.

## Épico 0 (pré-requisito) — Ingestão de tickets do Zendesk

Sem isso, os épicos 1 e 2 não têm sobre o que operar.

**Entregas**
- Tabela `tickets` (id do Zendesk, requester, agente, grupo, canal,
  timestamps, status, satisfaction rating, tags)
- Sincronização incremental do Zendesk (job agendado; o projeto já usa
  Edge Functions do Supabase)
- Vínculo `monitorias.ticket_id` → `tickets.id`, com FK real
- Tela/consulta de **cobertura**: tickets do período sem monitoria
  vinculada, com filtros por equipe, agente, canal e período

**Valor isolado:** mesmo sem nenhuma IA, isto já entrega o que hoje não
existe — saber a taxa de cobertura da auditoria e listar os não
avaliados. É o item de maior retorno por esforço do conjunto.

## Épico 1 — Pré-avaliação assistida por IA

Para cada ticket não avaliado, gerar uma **sugestão de avaliação** que o
auditor revisa e aceita ou descarta.

**Como se apoia no que já existe:** as fichas (`forms`) já são
estruturadas em `sections` com `weight` (30/40/30 na ficha atual),
`questions` e `critical_errors`. Isso é uma rubrica pronta — serve
diretamente como critério para o modelo.

**Entregas**
- Pipeline que envia a conversa do ticket + a rubrica da ficha ao modelo
- Saída estruturada no mesmo formato de `monitorias.answers`
  (`SIM`/`NAO`/`NA` por questão), com **justificativa por resposta** e
  **score de confiança**
- Análise de sentimento do cliente ao longo da conversa (não só a nota
  CSAT final)
- **Amostragem inteligente:** ranquear os não avaliados por risco, para o
  auditor priorizar
- Registro como rascunho (`status` novo, ex.: `sugerida_ia`), nunca como
  monitoria concluída

**Princípio inegociável:** a IA sugere, o humano decide. Nada entra como
avaliação oficial sem revisão. Além da questão trabalhista e de
confiança, o próprio sistema já modela contestação e reavaliação — uma
nota automática sem revisor cria um fluxo sem responsável.

## Épico 2 — Aderência a processo via Confluence

Verificar se o atendimento seguiu o processo documentado, e não apenas se
foi cordial.

**Entregas**
- Ingestão das páginas do Confluence (o wiki da Quality Automação é a
  fonte viva dos processos)
- Indexação vetorial dos procedimentos (RAG), com re-indexação quando a
  página muda
- Ao analisar um ticket, recuperar o(s) procedimento(s) aplicáveis e
  comparar com o que o agente efetivamente fez
- Saída: desvios apontados **com citação do trecho do processo**,
  permitindo auditoria da própria IA

**Ganho colateral:** a comparação expõe processos ambíguos ou
desatualizados no Confluence. Quando a IA erra por interpretar mal o
procedimento, muitas vezes o problema está na documentação.

## Esboço de arquitetura

```
Zendesk ──sync──> tickets (Supabase)
                      │
                      ├── cobertura: tickets sem monitoria  ← Épico 0
                      │
                      ▼
              Edge Function (fila/agendada)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  rubrica da ficha            Confluence (RAG)
   + sentimento                 procedimentos
        │                           │
        └─────────────┬─────────────┘
                      ▼
              LLM (saída estruturada)
                      │
                      ▼
        monitoria "sugerida_ia" + justificativas
                      │
                      ▼
              revisão humana do auditor
```

O processamento fica em **Edge Function**, nunca no frontend: a chave do
provedor de IA não pode ir para o browser, e a `anon key` do Supabase é
pública.

## Riscos e pontos de atenção

| Risco | Observação |
|---|---|
| **LGPD** | Conversas contêm dados de clientes. Enviar a um LLM externo é tratamento de dados pessoais — exige base legal, avaliação de risco e política de retenção do fornecedor. Considerar anonimização antes do envio. |
| **Custo** | Cresce por volume de tickets. Estimar antes de decidir; a amostragem inteligente ajuda a limitar. |
| **Confiança e viés** | Score de confiança e justificativa por resposta são obrigatórios para o auditor poder discordar com base. Medir a taxa de concordância IA↔humano desde o início. |
| **Uso trabalhista** | Nota de qualidade impacta avaliação de pessoas. Sugestão automática vira decisão de fato se o auditor apenas confirmar sem ler. Definir política antes de ligar. |
| **CSP** | O `connect-src` hoje só permite `'self'` e `*.supabase.co` (`vite.config.ts`, `vercel.json`, `nginx.conf`). Novos endpoints exigem ajuste nos três arquivos. |
| **RLS** | A nova tabela `tickets` precisa de policies coerentes com os papéis existentes; sem isso, um agente veria tickets de outras equipes. |
| **Confluence exige login** | A ingestão precisa de credencial de serviço e respeitar as permissões das páginas. |

## Perguntas em aberto

1. Qual o volume mensal de tickets? Define custo e arquitetura (batch vs.
   tempo real).
2. A API do Zendesk está disponível com token para este uso?
3. Qual a taxa de cobertura atual da auditoria? (hoje não é mensurável —
   é o que o Épico 0 revela)
4. Provedor de IA já definido? Há restrição sobre envio de dados a
   terceiros?
5. O Confluence tem API habilitada e credencial de serviço possível?
6. A IA deve avaliar **todos** os não avaliados ou apenas ranquear para
   amostragem humana?

## Sequência recomendada

Não começar pela IA. A sequência de menor risco:

1. **Spike (timebox curto):** confirmar acesso às APIs de Zendesk e
   Confluence, e levantar o volume de tickets. Sem isso, todo o resto é
   especulação.
2. **Épico 0:** ingestão + tela de cobertura. Entrega valor sozinho e
   cria a base de dados sobre a qual a IA opera.
3. **Épico 1** em piloto, numa equipe só, medindo concordância
   IA↔humano antes de expandir.
4. **Épico 2** por último — depende do RAG e é o mais sensível a
   documentação desatualizada.
