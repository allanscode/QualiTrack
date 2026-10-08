# Lentidão nas monitorias e revisão de segurança — 08/10/2026

## Diagnóstico

O dashboard mantinha o toast `Recuperando dashboard...` depois de uma tentativa bem-sucedida: o aviso só era fechado após esgotar os retries. Isso explica a mensagem sobre indicadores já carregados. O carregamento das monitorias também fazia chamadas extras a `auth.getSession()` em cada falha, e o monitor de conexão declarava o banco offline após 5 segundos.

Em verificações externas ao projeto de produção `vpytvgpsqdapgouyjowc`, uma consulta REST mínima não respondeu em 20 segundos; outra levou cerca de 11 segundos. Mais tarde, as mesmas rotas responderam em menos de um segundo. O episódio é compatível com lentidão transitória do acesso ao banco, mas os testes não identificam se a origem foi o Supabase, a rede ou um caminho intermediário. O logout relatado pelo usuário não teve mensagem; o código continha um `signOut()` automático quando a leitura do perfil retornava `PGRST116`, um caminho de logout silencioso que não deveria depender de uma única consulta.

## Correção preparada

- Fechar o toast do dashboard ao terminar o carregamento, com sucesso ou erro; evitar avisos de retry em atualizações de fundo com dados anteriores visíveis.
- Aumentar para 30 segundos o prazo das leituras de monitorias e dashboard; cancelar os temporizadores após a resposta e retirar `auth.getSession()` dos retries.
- Aumentar para 20 segundos o prazo do ping do banco e compartilhar a mesma tentativa entre chamadas simultâneas.
- Não encerrar a sessão Supabase só porque uma leitura isolada do perfil não encontrou linha; manter a tela protegida se o perfil não puder ser confirmado.

## Segurança e confiabilidade

- O build passou na verificação contra chaves secretas, dados de demonstração e source maps publicados.
- Os 86 testes de banco passaram, inclusive os controles de RLS, papéis, equipes, anexos e RPCs de publicação. Os 447 testes de frontend, lint e build também passaram.
- `source-map-js` foi atualizado para `1.2.2`, removendo o alerta de severidade alta do `npm audit`.
- Permanecem três alertas moderados no encadeamento `mammoth` → `argparse` → `sprintf-js`. O projeto usa Mammoth para ler DOCX no navegador, no cadastro de manuais de IA. O reparo automático proposto pelo npm rebaixaria Mammoth para uma versão incompatível; não foi aplicado sem validar esse fluxo. Limitar tamanho de arquivo/conteúdo e substituir ou atualizar a cadeia de dependências é trabalho pendente.
- Dashboard e app ainda carregam grandes conjuntos de monitorias em consultas independentes. Paginação e agregação no servidor devem ser priorizadas para reduzir a carga e melhorar a resposta quando a base crescer.
- A causa exata de eventos `SIGNED_OUT` ainda exige telemetria de autenticação e logs do projeto de produção; este relatório não atribui o logout com certeza à lentidão do banco.

Esta correção ainda precisa de aprovação final antes de publicação em produção, conforme `AGENTS.md`.
