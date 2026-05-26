# Contexto para Agentes de IA

**Atenção Agente de IA**: Leia este documento antes de iniciar qualquer modificação estrutural na codebase do QualiTrack.

## 1. Regras Fundamentais de Arquitetura

1. **Sem Backend Customizado**: Toda a persistência é feita via Supabase. A lógica reside no frontend (React) ou em Edge Functions (Deno). Não proponha criar servidores Express, NestJS, etc.
2. **Sem Router Library**: A navegação é baseada em state (`activeTab` em `App.tsx`). Não instale `react-router-dom` sem a permissão explícita do Tech Lead/User.
3. **Mock Mode Preservado**: Todo CRUD no frontend precisa suportar o "Mock Mode". Se você adicionar uma query Supabase, adicione a respectiva persistência em `localStorage` via `mockDb`.
4. **TailwindCSS v4**: O projeto utiliza a versão 4 do Tailwind, que é baseada em CSS moderno e `@theme`. Não use plugins do Tailwind v3 ou configurações no `tailwind.config.js` obsoleto.
5. **Componentização**: Não adicione mais código aos arquivos "monolíticos" (`AdminPanel.tsx` e `MonitoriaForm.tsx`). Se for mexer neles, a prioridade é **extrair componentes menores** antes de adicionar features.

## 2. Padrões de UI / UX

- **Cores**: Use os tokens semânticos definidos em `index.css` (ex: `bg-surface-card`, `text-brand-primary`). Não hardcode cores hexadecimais no JSX.
- **Dark Mode**: Já está configurado de forma nativa via classes `.dark` no `index.css`. Não precisa reescrever o sistema de temas.
- **Tipografia**: Use sempre `uppercase tracking-widest text-[10px] font-black` para labels, pequenos headers e badges. É uma assinatura do design do sistema.
- **Bordas e Shadows**: Use `rounded-2xl` ou `rounded-3xl` (nunca bordas quadradas) e `shadow-premium` para cards flutuantes.
- **Animações**: Use `motion` (Framer Motion) para transitions. Evite transições CSS brutas para montar/desmontar componentes.

## 3. Checklist de Segurança para Edição

Antes de commitar/sugerir uma alteração:
- [ ] Verifiquei se quebra o fluxo de prazo de ação (`addBusinessHours`)?
- [ ] O componente modificado lida corretamente com a renderização em Light e Dark mode?
- [ ] Se adicionei um filtro no dashboard, eu o apliquei em `DashboardContext.tsx` e não apenas localmente no widget?
- [ ] Testei o fluxo com o Role correto? (Um componente para `suporte` não pode exibir dados de outros agentes).
- [ ] Eu usei `lucide-react` para os ícones?

## 4. Known Bugs & Pontos de Atenção (Débito Técnico)

Se você for debugar algo, verifique estes pontos conhecidos primeiro:

1. **Z-index e Clipping**: Resolvido — `CustomSelect` usa React Portal (`createPortal`) para evitar clipping em containers scrolláveis. Também possui **type-ahead**: ao abrir o dropdown, o usuário pode digitar para filtrar opções em tempo real (case-insensitive), sem campo de busca visível.
2. **Action Deadline Sensitivity**: O recálculo de prazos de ação (`recalculateActiveActionDeadlines` em `useQualityConfig`) é uma operação pesada. Não a dispare desnecessariamente (apenas on-save da configuração). O `useQualityConfig()` é um consumer de Context — exige que `<QualityConfigProvider>` esteja acima na árvore (envolve `<MainApp>` em `App.tsx`).
3. **Formatação de Datas**: Use sempre ISO strings para armazenar (`toISOString()`) e converta localmente na hora de renderizar, pois o Supabase armazena em UTC e o frontend no horário local (provavelmente -03:00).
4. **Edge Function SMTP**: As credenciais SMTP no `send-email` foram migradas para env vars (`Deno.env.get()`). Nunca hardcoded credenciais em Edge Functions.
5. **Hook Violations**: Houveram incidentes anteriores com conditional hooks em `MonitoriaForm.tsx`. Mantenha todos os `useX` no topo do componente, sempre incondicionais.
6. **Seleção Agente↔Equipe**: No `MonitoriaForm`, ao selecionar Agente ou Equipe, o outro campo NUNCA deve ser limpo automaticamente. Se o usuário tentar trocar um campo enquanto o outro está selecionado com valor incompatível, bloqueie com toast informativo. O usuário deve primeiro desselecionar (escolher placeholder) para depois alterar o relacionamento.
6. **Constantes no Escopo do Módulo**: Constantes usadas em inicializadores de `useState` (ex: `MOCK_SESSION_KEY`) devem ser declaradas **fora** do componente. Incidente: `MOCK_SESSION_KEY` referenciada em `useState` initializer antes de ser declarada dentro do componente.
7. **Hooks nunca dentro de `useEffect`**: `useCallback`, `useMemo`, `useRef` etc. não podem ser chamados dentro de callbacks de `useEffect`. Use o padrão ref-bridge: atualize um `ref.current` dentro do effect e chame `ref.current()` em um `useCallback` fora do effect. Incidente: `useCallback` dentro de `useEffect` para `extendSession` em `App.tsx`.
8. **Sessão expira ao restaurar (F5)**: Ao restaurar sessão persistida, o sistema verifica `Date.now() - lastActivity` (chave `qualitrack_last_activity` no localStorage). Se idle ≥ 60min ou absolute ≥ 8h, a sessão é descartada. Nunca assuma que sessão restaurada = sessão válida.
9. **Enriquecimento de equipe via `user_teams`**: A coluna `users.team_ids` foi removida. Sempre use `enrichUserWithTeamIds()` para injetar `team_ids` no `userData` após buscar da tabela `users`. Nunca envie `team_ids` em payload de upsert/update da tabela `users` — sincronize via tabela N:N `user_teams`.

## 5. Como Iniciar uma Nova Feature

1. **Leia a SPEC correspondente** na pasta `/docs/specs/`.
2. **Identifique a tabela afetada** no `/docs/database/schema.md`.
3. Crie a interface no arquivo `src/types.ts`.
4. Implemente o componente UI usando a pasta `src/components/ui/` sempre que possível.
5. Se for dado persistente, adicione no `supabase.ts` (para Supabase e MockDb simultaneamente).
