# Roadmap — QualiTrack com IA

> Status: **rascunho para discussão**. Nada abaixo está implementado.
> Formato: um pré-requisito (Épico 0) + dois épicos, precedidos de um spike.
> Detalhamento completo — riscos, arquitetura, perguntas em aberto — na spec
> original: `docs/specs/ai-triage-process-adherence.md` (a trazer para o repo
> se este roadmap avançar).

## Resumo

Hoje o QualiTrack só conhece os atendimentos que **alguém decidiu auditar**.
A proposta é inverter isso: trazer o universo completo de tickets, apontar
os que ficaram de fora da amostra e usar IA para (a) sugerir uma
pré-avaliação com base na ficha e no sentimento do cliente e (b) verificar
aderência aos processos publicados no Confluence.

## Problema

A monitoria de qualidade é feita por amostragem manual, o que gera três
lacunas:

- **Cobertura desconhecida** — não se sabe quantos nem quais atendimentos
  ficaram sem avaliação.
- **Amostra enviesada** — o auditor escolhe o que auditar; casos
  problemáticos podem nunca ser vistos.
- **Processo não verificado** — mesmo em tickets avaliados, a aderência ao
  processo documentado no Confluence não é checada de forma sistemática.

## Descoberta crítica

**O QualiTrack não tem o conceito de "ticket".** O schema tem 11 tabelas
(`teams`, `users`, `forms`, `monitorias`, `access_requests`,
`quality_configs`, `dissatisfaction_fields`, `user_teams`,
`user_preferences`, `business_hours`, `holidays`) — nenhuma delas de
tickets. Em `monitorias`, o ticket é só:

```sql
ticket_id TEXT,
channel   TEXT,
```

Texto livre digitado pelo auditor, sem FK, sem origem externa. Não há
integração com Zendesk nem Confluence no código atual.

**Consequência**: "filtrar os tickets não avaliados" é hoje impossível — o
sistema só sabe dos tickets que **foram** avaliados. É como pedir a lista
de ausentes tendo só a lista de presentes. Por isso existe o Épico 0 abaixo,
como pré-requisito dos outros dois.

## Épico 0 (pré-requisito) — Ingestão de tickets do Zendesk

Sem isso, os épicos 1 e 2 não têm sobre o que operar.

- Tabela `tickets` (id do Zendesk, requester, agente, grupo, canal,
  timestamps, status, satisfaction rating, tags)
- Sincronização incremental do Zendesk (Edge Function agendada)
- `monitorias.ticket_id` → FK real para `tickets.id`
- Tela/consulta de **cobertura**: tickets do período sem monitoria
  vinculada, filtráveis por equipe, agente, canal e período

**Valor isolado**: mesmo sem nenhuma IA, isso já entrega o que hoje não
existe — taxa de cobertura da auditoria e lista de não avaliados. Maior
retorno por esforço do conjunto.

## Épico 1 — Pré-avaliação assistida por IA

Para cada ticket não avaliado, gerar uma sugestão de avaliação que o
auditor revisa e aceita ou descarta.

Apoia-se no que já existe: as fichas (`forms`) já são estruturadas em
`sections` com `weight`, `questions` e `critical_errors` — é uma rubrica
pronta, serve direto como critério para o modelo.

- Pipeline: conversa do ticket + rubrica da ficha → modelo
- Saída no formato de `monitorias.answers` (`SIM`/`NAO`/`NA` por questão),
  com justificativa por resposta e score de confiança
- Análise de sentimento do cliente ao longo da conversa
- Amostragem inteligente: ranquear os não avaliados por risco
- Registro como rascunho (novo status, ex. `sugerida_ia`) — nunca como
  monitoria concluída

**Princípio inegociável**: a IA sugere, o humano decide. Nota de qualidade
afeta avaliação de pessoas; sem revisão humana de fato (não apenas
confirmação automática), a sugestão vira decisão de fato sem responsável.

## Épico 2 — Aderência a processo via Confluence

- Ingestão das páginas do Confluence (wiki da Quality Automação)
- Indexação vetorial dos procedimentos (RAG), com re-indexação em mudança
  de página
- Ao analisar um ticket, recuperar o(s) procedimento(s) aplicável(is) e
  comparar com o que o agente fez
- Saída: desvios apontados **com citação do trecho do processo**

## Riscos principais

| Risco | Nota |
|---|---|
| LGPD | Conversas de clientes enviadas a LLM externo = tratamento de dados pessoais. Exige base legal e política de retenção do fornecedor. |
| Uso trabalhista | Nota de qualidade impacta avaliação de pessoas. Sugestão vira decisão de fato se o auditor só confirmar sem ler. |
| CSP | `connect-src` hoje só permite `'self'` e `*.supabase.co`. Novo endpoint exige ajuste em `vite.config.ts`, `vercel.json` e `nginx.conf` — os três. |
| RLS | A tabela `tickets` precisa de policies coerentes com os papéis existentes. |

## Sequência recomendada

1. **Spike** — confirmar acesso às APIs de Zendesk e Confluence, levantar
   volume mensal de tickets (define custo/arquitetura).
2. **Épico 0** — ingestão + cobertura.
3. **Épico 1** em piloto, numa equipe só, medindo concordância IA↔humano.
4. **Épico 2** por último — depende do RAG e é o mais sensível a
   documentação desatualizada no Confluence.
