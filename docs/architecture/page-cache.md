# Cache das telas e atualização

Dashboards, monitorias, primeiras páginas das filas e solicitações administrativas reutilizam snapshots em memória do QueryClient. Cadastros continuam usando React Query, agora com chave por usuário e permissões. Não há persistência de dados privados no navegador: F5 inicia uma carga nova.

- `pageCache.ts` separa usuário, perfil, equipes e estado ativo; snapshots expiram em dez minutos. Logout limpa o cache e invalida escritores de respostas antigas.
- `usePageCache` impede escrita após desmontagem ou troca de escopo. O conteúdo reaparece na navegação e é revalidado em segundo plano; falhas mantêm os dados disponíveis.
- `useBackgroundRefresh` confere telas visíveis a cada três minutos e ao retornar à aba, respeitando esse intervalo. Eventos Realtime e reconexão continuam atualizando monitorias, dashboards e cadastros. Filas só fazem atualização periódica na primeira página, sem pesquisa, seleção, lote ou modal de avaliação.
- O cache não autoriza ações: RBAC, distribuição de filas e validação no servidor continuam valendo. Formulários em edição mantêm seu próprio estado.
- `PageSkeleton` atende carga inicial e módulos lazy. O skeleton de dashboard fica fora da fonte oculta dos portais do layout, respeita tema e redução de movimento. Atualizações posteriores mantêm o conteúdo renderizado.

Validação: testes de expiração, isolamento, resposta tardia, restauração, atualização/falha e pausa de consultas em aba oculta; testes Playwright do skeleton em 390/1320 px nos temas claro/escuro.
