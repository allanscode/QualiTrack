# Guia de Estilo de UI - QualiTrack

Este guia formaliza a identidade visual, padrões de geometria, tipografia, cores e comportamentos interativos do ecossistema do **QualiTrack**. Todos os agentes de IA e desenvolvedores devem ler este documento na íntegra antes de iniciar qualquer alteração ou criação de interfaces.

---

## 1. Geometria Geral (Bordas e Curvatura)

Para evitar quebras na unidade geométrica e manter uma estética sóbria, corporativa e profissional, todas as curvaturas de cantos (`border-radius`) da aplicação seguem regras estritas.

### Regras de Ouro
1. **Componentes Interativos Padrão:** Todos os botões de ação, inputs de texto, seletores (`select`), áreas de texto (`textarea`), triggers de dropdown e modais de confirmação **devem** utilizar o raio de curvatura discretamente arredondado:
   * **`rounded-lg` (8px)** ou **`rounded-md` (6px)** do Tailwind.
   * **É terminantemente proibido o uso de cantos estilo pílula (`rounded-full`) para botões de ação primária ou secundária.**
2. **Cards e Containers Grandes:** Modais principais, painéis flutuantes grandes e cards informativos podem utilizar cantos ligeiramente mais suaves:
   * **`rounded-2xl` (16px)** ou **`rounded-xl` (12px)**.
3. **Exceções Permitidas para `rounded-full` (100% circular):**
   * Avatares de usuário.
   * Indicadores de status online/presença (pontos verdes/vermelhos).
   * Botões circulares extremamente pequenos de utilitário (ex: ícone "X" de limpar filtros em barras de pesquisa ou tags).

---

## 2. Anatomia do Botão Primário

Para manter a consistência do ecossistema visual, todos os botões de ação primária e secundária devem seguir estritamente o seguinte padrão de estilo e comportamento:

* **Tipografia:** Texto sempre em Caixa Alta (**UPPERCASE**) para garantir peso e autoridade visual.
* **Peso de Fonte:** Negrito proeminente (**`font-bold`** ou **`font-semibold`**).
* **Espaçamento de Letras:** **`tracking-wider`** para legibilidade em caixa alta.
* **Curvatura:** Sempre **`rounded-lg`** (para combinar perfeitamente com os filtros e inputs).
* **Feedback Interativo (Hover & Active):**
  * Efeito de hover obrigatório: nenhum botão pode ser estático.
  * Transição suave: **`transition-all duration-200`**.
  * No hover: escurecer levemente a cor de fundo (ex: `hover:bg-opacity-90` ou `hover:bg-brand-accent/90`).
  * No clique: efeito sutil de escala ativa (**`active:scale-[0.98]`**).

### Exemplo de Classes Tailwind para Botão Primário:
```html
<button className="bg-brand-primary text-brand-on-primary hover:bg-opacity-90 active:scale-[0.98] px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200">
  Confirmar Ação
</button>
```

### Micro-interações em Botões Primários

Para garantir o dinamismo visual e a elegância de alto nível sem poluir o layout ou gerar uma "salada de animações", adota-se um padrão estrito de feedback interativo para botões com ícones associados:

1. **Classes do Container do Botão**:
   * O container do botão (tag `<Button>` ou `<button>`) deve usar a classe `group` para que possamos controlar seus elementos filhos no hover do pai.
   * O container do botão deve possuir a classe `transition-all duration-200` para transições suaves de cor e sombras.

2. **Ícones de Adição (`+`) ou Criação**:
   * Devem rotacionar suavemente no hover do botão principal.
   * Classe do ícone (ex: `Plus` ou `UserPlus`): `transition-transform duration-300 group-hover:rotate-90`.

3. **Ícones de Ação/Salvamento (como Disquete, Salvar, Confirmar ou Check)**:
   * Devem sofrer uma leve escala de tamanho (zoom-in suave) no hover do botão principal.
   * Classe do ícone (ex: `Save`, `Check`, `CheckCircle2` ou `Pencil`): `transition-transform duration-200 group-hover:scale-110`.

---

## 3. Elementos de Seleção, Inputs e Datepickers

Para evitar a "salada de modelos" visuais:
* **Inputs de Texto:** Sempre usar `rounded-lg` com bordas finas e discretas.
* **Selects (`Select` e `CustomSelect`):** O trigger de seleção e o painel flutuante de opções devem usar cantos `rounded-lg`.
* **Calendários e Datepickers (`CustomDatepicker`):**
  * O botão de trigger deve ter `rounded-lg`.
  * O container flutuante do calendário deve ter `rounded-lg` (substituindo o antigo `rounded-2xl`).
  * As setas de navegação (Chevron) e as células individuais de dias devem usar `rounded-lg` (e nunca `rounded-xl`).

---

## 4. Cores Semânticas e Funcionais

| Tipo | Cor Primária | Hover / Opacidade | Uso Recomendado |
|------|--------------|-------------------|-----------------|
| **Primário** | `bg-brand-primary` | `hover:bg-opacity-90` | Botões principais de submissão e ações críticas |
| **Acento / Destaque** | `bg-brand-accent` | `hover:bg-brand-accent/90` | Links, botões de ação de destaque secundário, foco de input |
| **Outline / Secundário**| `bg-transparent` | `hover:bg-surface-subtle` | Botões de cancelar, voltar ou opções de menor relevância |
| **Sucesso** | `bg-success` / `bg-functional-success` | `hover:bg-opacity-90` | Aprovações, confirmações positivas, status concluído |
| **Alerta** | `bg-warning` / `bg-functional-warning` | `hover:bg-opacity-90` | Pendências, avisos de expiração, status em revisão |
| **Erro / Perigo** | `bg-error` / `bg-functional-error` | `hover:bg-opacity-90` | Exclusões, rejeições, cancelamentos críticos, erros graves |

---

## 5. Padrões de Tabelas com Rolagem (Sticky & Opaque Header)

Para tabelas situadas dentro de containers com rolagem (overflow), o cabeçalho deve permanecer fixo no topo (`sticky`) para orientar o usuário, sem misturar textos:
* **Classes Obrigatórias nas células `<th>`**:
  * `sticky top-0`: Mantém a célula fixada no topo do container.
  * `z-10` ou `z-20`: Eleva o empilhamento vertical para que os dados passem por baixo.
  * `bg-surface-card` ou fundo idêntico ao fundo interno do card/container: Torna o fundo do cabeçalho totalmente opaco, ocultando os dados no rolamento.
* **Container Pai**: Deve possuir `overflow-y-auto` e uma altura máxima controlada (ex: `max-h-[450px]`) para criar um contexto de rolagem interna estável.

---

## 6. Padrões de Rodapé de Modal (Botões de Ação Simplificados)

Os botões de confirmação/salvamento definitivos posicionados no rodapé de modais importantes (como o Editor de Formulários) seguem uma filosofia ultra-clean e moderna:
* **Texto Simplificado**: Em vez de rótulos longos (como "PUBLICAR FORMULÁRIO" ou "SALVAR ALTERAÇÕES"), utilize o termo único e enxuto **`"SALVAR"`** (e **`"SALVANDO..."`** para estado de envio).
* **Padding e Proporções**: Use um generoso padding lateral de **`py-2.5 px-8`** ou **`py-2 px-8`** para conceder um espaçamento harmônico e sofisticado ao texto curto.
* **Comportamento de Estados Estritos**:
  * **Estado Desabilitado (Soma/Validação Inválida)**: O botão deve ser marcado como `disabled={true}`. O estilo visual correspondente deve ser totalmente **opaque/sólido** (usando `disabled:opacity-100`) em tom cinza-escuro/chumbo neutro, livre de contornos ou fundos vermelhos ou alaranjados de erro.
  * **Estado Ativo (Validação Concluída)**: O botão é ativado e assume a cor oficial de destaque do sistema (como o Creme Executivo `#F9F9F6` no tema escuro, com texto de alto contraste `#1A1C16`).

---

## 7. Diretriz para os Agentes de IA

> [!IMPORTANT]
> **Antes de criar ou editar qualquer interface do QualiTrack:**
> Você deve ler e respeitar rigorosamente este guia. Não crie botões arredondados no estilo pílula (`rounded-full`), inputs excessivamente arredondados (`rounded-2xl` / `rounded-3xl`), ou componentes interativos que não ofereçam feedback visual de hover (`transition-all duration-200`).

