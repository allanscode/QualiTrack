const email = process.env.JIRA_EMAIL || "allan.amorim@webposto.com.br";
const token = process.env.JIRA_API_TOKEN || "";
const authHeader = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

async function main() {
  console.log("=== Registrando Melhorias de Design, Chat Assimétrico e Acessibilidade no Jira ===");

  // 1. Criar a Subtarefa sob DB-427
  const subtaskPayload = {
    fields: {
      project: { key: "DB" },
      parent: { key: "DB-427" },
      summary: "QWP > Design System Refinado (WebPosto Red & Offwhite), Chat Assimétrico, Acessibilidade Dark Mode e UX de Notificações",
      issuetype: { id: "10558" },
      assignee: { id: "712020:dd9b58e7-53c2-4960-b73f-0db07a984c1e" },
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Entrega completa do pacote de refinamento visual, modernização de experiência do usuário (UX/UI), acessibilidade de contraste em Dark Mode e exibição humanizada de chamados do Zendesk." }
            ]
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "1. Design System & Identidade Visual (WebPosto Red Refinado)" }]
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Paleta Offwhite Acinzentada: substituição do fundo branco estéril por #EAECEF no Light Mode e #111C2F no Dark Mode, proporcionando descanso visual prolongado aos auditores e gestores." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Sidebar Estruturada: tonalidade cinza neutra (#D6DCE4 / dark #172338) criando uma delimitação arquitetural nítida entre navegação e conteúdo." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "WebPosto Red Refinado: transição para a cor institucional #D9232A (light) e Rose Red #F43F5E (dark), assegurando identidade corporativa vibrante aliada a alto contraste." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Design Tokens & Microinterações: badges em formato de pílulas translúcidas com micro-borda de 1px (padrão Linear/Stripe), raio de curvatura refinado em 18px e sombras difusas." }]
                }]
              }
            ]
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "2. Tipografia Técnica de Alta Performance" }]
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Plus Jakarta Sans: tipografia moderna para toda a interface de navegação, títulos, campos e modais, otimizando hierarquia e legibilidade." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "JetBrains Mono: tipografia monoespaçada tabular aplicada a identificadores de ticket (#ID), contadores, notas decimais, pesos percentuais e prazos de SLA." }]
                }]
              }
            ]
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "3. Timeline Conversacional de Chamados e Chat Assimétrico (Zendesk)" }]
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Balões Assimétricos no Passo 4 e no Drawer de Diálogo: Cliente alinhado à esquerda com balão azul (sky), Atendente alinhado à direita com balão verde esmeralda, Notas Internas em âmbar e Sistema/Bot em roxo." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Janela de Terminal para Logs Técnicos: blocos de logs [FireDAC], queries SQL e stack traces com cabeçalho de 3 bolinhas estilo macOS e botão de 1 clique para copiar com feedback visual instantâneo." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Correção de Papel do Atendente no Parser Zendesk: identificação precisa de comentários de atendentes com assinatura 'Suporte WebPosto', impedindo rebaixamento indevido para cliente final." }]
                }]
              }
            ]
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "4. Acessibilidade e Correção de Contraste em Dark Mode" }]
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Correção dos Badges Numéricos de Seções: eliminação do bug de número branco sobre fundo claro no Dark Mode; implementação de bg-brand-accent text-white font-mono com contraste absoluto WCAG AA." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Correção dos Indicadores do Stepper de Avaliação (Etapas 1-2-3-4) e abas ativas do painel de diálogo Zendesk." }]
                }]
              }
            ]
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "5. UX de Notificações e Ferramentas de Teste" }]
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Descarte de Notificações: adição de botão fechar (X) no popover da central e ativação de closeButton no Toaster do Sonner para dispensar avisos da tela." }]
                }]
              },
              {
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: "Acesso Rápido para Testes: bypass de captcha com botões de 1 clique no login (Admin, Qualidade, Gestor Suporte, Atendente) para homologação ágil." }]
                }]
              }
            ]
          }
        ]
      }
    }
  };

  const createRes = await fetch("https://qualityautomacao.atlassian.net/rest/api/3/issue", {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(subtaskPayload)
  });

  if (!createRes.ok) {
    console.error("Erro ao criar subtarefa no Jira:", createRes.status, await createRes.text());
    return;
  }

  const newSubtask = await createRes.json();
  console.log(`✅ Subtarefa criada com sucesso: ${newSubtask.key}`);

  // 2. Atualizar a descrição de DB-427 para incluir a nova subtarefa
  const fetchParent = await fetch("https://qualityautomacao.atlassian.net/rest/api/3/issue/DB-427?fields=description", {
    headers: { Authorization: authHeader, Accept: "application/json" }
  });
  const parentData = await fetchParent.json();
  const desc = parentData.fields.description;

  // Localizar a lista de subtarefas
  let subtaskList = null;
  for (let i = 0; i < desc.content.length; i++) {
    const node = desc.content[i];
    if (node.type === "heading" && node.content?.[0]?.text === "Subtarefas Integradas nesta Sprint") {
      subtaskList = desc.content[i + 1];
      break;
    }
  }

  if (subtaskList && subtaskList.type === "bulletList") {
    subtaskList.content.push({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: `${newSubtask.key}: `, marks: [{ type: "strong" }] },
            { type: "text", text: "Design System Refinado (WebPosto Red & Offwhite), Chat Assimétrico de Chamados (Cliente vs Atendente), Acessibilidade de Contraste Dark Mode, Fechamento de Notificações e Acesso Rápido de Teste." }
          ]
        }
      ]
    });

    const updateParentRes = await fetch("https://qualityautomacao.atlassian.net/rest/api/3/issue/DB-427", {
      method: "PUT",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ fields: { description: desc } })
    });

    if (updateParentRes.status === 204 || updateParentRes.status === 200) {
      console.log(`✅ Card Pai DB-427 atualizado com a referência a ${newSubtask.key}.`);
    } else {
      console.error("Erro ao atualizar DB-427:", updateParentRes.status, await updateParentRes.text());
    }
  }

  // 3. Adicionar comentário no Card Pai DB-427 para registro histórico e relatório
  const commentText = `🚀 *Relatório de Entregas — Design System, Acessibilidade & UX (Subtarefa ${newSubtask.key})*\n\n` +
    `Foram desenvolvidas e homologadas as seguintes melhorias na interface e na experiência de auditoria do QualidadeWP (QWP):\n\n` +
    `1. *Design System & Identidade WebPosto Red Refinado*:\n` +
    `   • Paleta Off-white Acinzentada (#EAECEF no Light Mode e #111C2F no Dark Mode) para descanso visual e redução de ofuscamento.\n` +
    `   • Sidebar estruturada em cinza neutro (#D6DCE4 / dark #172338).\n` +
    `   • Aplicação do tom oficial WebPosto Red (#D9232A no light e Rose Red #F43F5E no dark mode) em botões de ação e destaques principais.\n` +
    `   • Badges em pílulas translúcidas com micro-borda 1px estilo Stripe/Linear.\n\n` +
    `2. *Tipografia Técnica de Alta Performance*:\n` +
    `   • Plus Jakarta Sans para texto geral, interfaces e formulários.\n` +
    `   • JetBrains Mono para indicadores numéricos, contadores, notas e prazos com alinhamento tabular.\n\n` +
    `3. *Timeline Conversacional de Chamados e Chat Assimétrico (Zendesk)*:\n` +
    `   • Balões assimétricos no Passo 4 e no Drawer de Diálogo: Cliente em azul à esquerda, Atendente em verde à direita, Notas Internas em âmbar e Sistema em roxo.\n` +
    `   • Janela de Terminal macOS com 3 bolinhas para logs técnicos ([FireDAC], SQL, traces de erro) com botão de 1 clique para copiar o log.\n` +
    `   • Correção no parser zendeskChatParser.ts: analistas do suporte com assinatura 'Suporte WebPosto' não são mais confundidos com cliente final.\n\n` +
    `4. *Acessibilidade e Correção de Contraste no Dark Mode*:\n` +
    `   • Correção dos badges numéricos das seções no MonitoriaForm.tsx (1, 2, 3...) que ficavam com número branco sobre quadrado branco no Dark Mode (agora com bg-brand-accent text-white font-mono).\n` +
    `   • Correção dos indicadores numéricos de etapas do stepper (1-2-3-4) e das abas de filtro do painel de diálogo Zendesk.\n\n` +
    `5. *Controle de Notificações e Facilidades de Teste*:\n` +
    `   • Adição de botão de fechar (X) moderno no header da central de notificações.\n` +
    `   • Ativação de closeButton no Toaster (Sonner) para descarte instantâneo de avisos flutuantes.\n` +
    `   • Bypass de captcha e botões de 1 clique para login rápido com diferentes perfis em branch de teste.`;

  const commentPayload = {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: commentText }]
        }
      ]
    }
  };

  const commentRes = await fetch("https://qualityautomacao.atlassian.net/rest/api/3/issue/DB-427/comment", {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(commentPayload)
  });

  if (commentRes.status === 201) {
    console.log(`✅ Comentário registrado com sucesso no card principal DB-427 para fins de relatório.`);
  } else {
    console.error("Erro ao adicionar comentário:", commentRes.status, await commentRes.text());
  }

  // 4. Também adicionar comentário na própria subtarefa nova
  await fetch(`https://qualityautomacao.atlassian.net/rest/api/3/issue/${newSubtask.key}/comment`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(commentPayload)
  });
  console.log(`✅ Comentário espelhado na subtarefa ${newSubtask.key}.`);
}

main().catch(err => {
  console.error("Erro no script:", err);
  process.exit(1);
});
