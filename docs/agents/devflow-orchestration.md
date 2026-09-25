# DevFlow — Orquestração proporcional ao risco

## Princípio

Use `$devflow-orchestrator` para escolher o menor fluxo que preserve qualidade. O agente principal mantém contexto, implementação e decisão final. Papéis, subagentes e modelos externos são apoios opcionais, não uma cadeia obrigatória.

A métrica principal é **custo por tarefa concluída corretamente e sem retrabalho**.

## Níveis

| Nível | Exemplos | Fluxo |
|---|---|---|
| Simples | correção localizada, UI pequena, documentação, teste isolado | alteração direta → validação afetada → resultado |
| Médio | vários domínios, causa ambígua, diff amplo, tentativa anterior falhou | dependências relevantes → implementação → no máximo um apoio útil → testes relacionados |
| Crítico | autenticação, RLS, migração destrutiva, perda de dados, segurança, concorrência ou produção | análise de risco/rollback → implementação → revisões distintas necessárias → validação proporcional |

Não crie handoff, Tech Leader, Coder, Tester, preview ou smoke apenas porque houve escrita de código.

## Escolha do apoio

- Use subagente nativo para uma unidade independente que precise das mesmas ferramentas do repositório ou possa avançar em paralelo.
- Use consulta externa via Antigravity quando diversidade de modelo/provedor puder testar uma hipótese ou revisar um diff.
- Não use ambos para a mesma pergunta. Em tarefa média, limite usual de um apoio; em tarefa crítica, dois somente para riscos diferentes.
- Envie objetivo, critérios, diff e arquivos relevantes. Não envie histórico completo, credenciais ou logs sensíveis.
- O agente principal valida toda resposta consultiva no código, nos testes ou em fonte autoritativa.

## Fallback externo

A skill contém `scripts/consult-external.ps1`, que executa o modelo escolhido em modo read-only, aplica timeout e tenta no máximo um fallback informado.

Se o Antigravity inteiro estiver indisponível:

- em tarefa simples ou média, continue no agente principal com verificações determinísticas quando isso preservar os critérios;
- em tarefa crítica, não declare prontidão para produção se a revisão independente era um gate necessário.

## Validações específicas do WP Qualidade

Aplique somente quando a área correspondente for afetada:

- UI: tema claro/escuro, responsividade e acessibilidade relevante;
- CRUD: persistência dual MockDb e Supabase;
- RBAC: papel correto e anonimato de `suporte` pela `vw_monitorias_suporte`;
- banco: migration, policies e testes relacionados;
- deploy: build, preview e smoke apenas quando a alteração implantável precisar de validação no ambiente.

Comece por testes direcionados. Amplie lint, typecheck, suíte, banco ou build conforme o alcance e o risco; não repita a mesma suíte em agentes diferentes sem motivo.

## Efeitos externos

Commit, push, preview e produção respeitam o pedido e as autorizações da tarefa. Produção exige autorização explícita e separada. Nunca use credenciais ou dados de produção em consulta externa.

## Retorno

Relate resultado, evidências relevantes, risco residual e próximo passo necessário. Relatório formal e rótulos de aprovação só são usados quando o usuário ou o risco exigir rastreabilidade.
