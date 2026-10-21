# Conciliação QWP / Zendesk — 20/10/2026

A conclusão final ativa do QWP foi tratada como fonte oficial. Foram comparadas 183 monitorias finais e seus tickets do Zendesk.

- **143 tickets** foram verificados no Zendesk com campo de avaliação, marcador de análise, tags de veredito e tag de filho alinhados ao QWP.
- **40 tickets** permanecem divergentes. Todos estão em solved; o QWP registra
egativa e o Zendesk ainda mostra positiva.
- A API do Zendesk recusou a atualização desses 40 com HTTP 422: o campo obrigatório **Categoria** (ID 40618174555540) está vazio e o Zendesk o exige para atualizar tickets resolvidos. O valor não foi inferido, nem alterei Categoria, status, comentários ou outros campos.
- Os PUTs tentados enviaram apenas campos de avaliação e tags, sem comment ou status. Conflitos e rate limits foram tratados reconsultando os tickets; o estado final foi verificado novamente por GET.
- Tickets bloqueados: 183659, 183792, 183990, 184811, 184905, 185126, 185756, 185934, 186114, 186129, 186362, 186368, 186467, 186472, 186493, 186549, 186573, 186806, 187011, 187019, 187021, 187027, 187053, 187079, 187126, 187132, 187166, 187195, 187212, 187219, 187256, 187264, 187269, 187345, 187391, 187401, 187413, 187440, 187467, 187707.

Arquivos de evidência:

- 2026-10-20-qwp-zendesk-final-verification.csv: estado final lido diretamente no Zendesk, comparado com o veredito QWP.
- 2026-10-20-qwp-zendesk-correction-results.csv: resultado por ticket e exceção Zendesk.
- 2026-10-20-qwp-zendesk-divergences.csv: comparação inicial e resultado QWP esperado.

## Correções de código aplicadas

- Publicadores padrão e de chamados filhos atualizam o campo de avaliação e as tags positiva/
egativa, nalisado_qa e, para filhos, qwp_filho_avaliado, removendo o marcador de veredito oposto.
- Tickets fechados recebem apenas campos e tags; os publicadores não enviam comentário nem status.
- Fichas regulares com marcador antigo de filho voltam ao cálculo normal; erros críticos deixam de zerar score automaticamente e passam a exigir revisão humana.
- Fila de filhos ganhou a ação de avaliação manual.
- Migrações 20261020220000 e 20261020230000 foram aplicadas no banco de produção.

Para concluir os 40 casos bloqueados, será necessário decidir o valor de Categoria a partir da tag categoria_* já existente, ou ajustar a regra obrigatória no Zendesk. Nenhuma dessas alterações foi feita nesta reconciliação.