import { describe, it, expect } from 'vitest';
import { buildEvaluationHtml, escapeHtml } from './template';

describe('buildEvaluationHtml', () => {
  it('monta o template de outcome positiva com o cabeçalho de ticket validado', () => {
    const html = buildEvaluationHtml({
      outcome: 'positiva',
      evaluatorNote: 'Atendimento dentro do padrão.',
      satisfactionRecordText: null,
    });

    expect(html).toContain('✅ Ticket validado pela Qualidade');
    expect(html).toContain('foi <strong>validado</strong>');
    expect(html).not.toContain('invalidado');
  });

  it('monta o template de outcome negativa com o cabeçalho de ticket invalidado', () => {
    const html = buildEvaluationHtml({
      outcome: 'negativa',
      evaluatorNote: 'Faltou confirmar os dados do cliente.',
      satisfactionRecordText: null,
    });

    expect(html).toContain('❌ Ticket invalidado pela Qualidade');
    expect(html).toContain('foi <strong>invalidado</strong>');
    expect(html).toContain('seguirá para tratativa do Gestor responsável');
  });

  it('coloca evaluator_note na lacuna "Registro do analista"', () => {
    const html = buildEvaluationHtml({
      outcome: 'positiva',
      evaluatorNote: 'Nota do auditor sobre o atendimento.',
      satisfactionRecordText: null,
    });

    const labelIndex = html.indexOf('Registro do analista:');
    const noteIndex = html.indexOf('Nota do auditor sobre o atendimento.');

    expect(labelIndex).toBeGreaterThan(-1);
    expect(noteIndex).toBeGreaterThan(labelIndex);
  });

  it('coloca satisfaction_record_text na lacuna "Retorno do cliente"', () => {
    const html = buildEvaluationHtml({
      outcome: 'positiva',
      evaluatorNote: 'Nota do auditor.',
      satisfactionRecordText: 'Cliente elogiou o suporte.',
    });

    const labelIndex = html.indexOf('Retorno do cliente:');
    const recordIndex = html.indexOf('Cliente elogiou o suporte.');

    expect(labelIndex).toBeGreaterThan(-1);
    expect(recordIndex).toBeGreaterThan(labelIndex);
  });

  it('deixa a lacuna de retorno do cliente vazia (sem inventar texto) quando não há registro', () => {
    const html = buildEvaluationHtml({
      outcome: 'positiva',
      evaluatorNote: 'Nota do auditor.',
      satisfactionRecordText: null,
    });

    expect(html).not.toMatch(/sem registro/i);
    expect(html).not.toMatch(/não informado/i);

    const labelIndex = html.indexOf('Retorno do cliente:');
    const afterLabel = html.slice(labelIndex);
    // A lacuna logo após o rótulo deve ser um parágrafo vazio (&nbsp;),
    // não texto inventado.
    expect(afterLabel).toMatch(/Retorno do cliente:<\/strong><\/p><p>&nbsp;<\/p>/);
  });

  it('deixa a lacuna de registro do analista vazia quando evaluator_note é null', () => {
    const html = buildEvaluationHtml({
      outcome: 'negativa',
      evaluatorNote: null,
      satisfactionRecordText: null,
    });

    const labelIndex = html.indexOf('Registro do analista:');
    const afterLabel = html.slice(labelIndex);
    expect(afterLabel).toMatch(/Registro do analista:<\/strong><br>&nbsp;<\/p><p>&nbsp;<\/p>/);
  });

  it('escapa & < > " no evaluator_note e converte quebras de linha em <br>', () => {
    const html = buildEvaluationHtml({
      outcome: 'positiva',
      evaluatorNote: '<script>alert("x")</script> & linha 1\nlinha 2',
      satisfactionRecordText: null,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; linha 1<br>linha 2');
  });

  it('escapa & < > " no satisfaction_record_text', () => {
    const html = buildEvaluationHtml({
      outcome: 'negativa',
      evaluatorNote: null,
      satisfactionRecordText: 'Cliente disse "ótimo" & <muito bom>',
    });

    expect(html).toContain('Cliente disse &quot;ótimo&quot; &amp; &lt;muito bom&gt;');
    expect(html).not.toContain('<muito bom>');
  });

  it('preserva o restante do template byte a byte (fora das lacunas)', () => {
    const html = buildEvaluationHtml({
      outcome: 'positiva',
      evaluatorNote: null,
      satisfactionRecordText: null,
    });

    expect(html).toBe(
      '<p><strong>✅ Ticket validado pela Qualidade</strong><br>&nbsp;</p>' +
        '<p>Após análise realizada pela equipe de Qualidade, identificamos que o chamado atende aos critérios estabelecidos.</p>' +
        '<p>Dessa forma, o ticket foi <strong>validado</strong>.<br>&nbsp;</p>' +
        '<p><strong>Registro do analista:</strong><br>&nbsp;</p>' +
        '<p>&nbsp;</p>' +
        '<p>&nbsp;</p>' +
        '<p><strong>Retorno do cliente:</strong></p>' +
        '<p>&nbsp;</p>' +
        '<p>&nbsp;</p>',
    );
  });

  // Regressão: `String.replace` com string literal interpreta `$&`, `` $` ``,
  // `$'` e `$$` como padrões de substituição. Como o escape não trata `$`,
  // um texto do auditor com cifrão saía corrompido no ticket.
  it('preserva cifrões literais do texto do auditor', () => {
    const html = buildEvaluationHtml({
      outcome: 'positiva',
      evaluatorNote: 'Divergência de R$$ 50 no fechamento',
      satisfactionRecordText: "Cliente citou $& e $` na reclamação",
    });

    // `$$` sobrevive (com substituição por string viraria `$`) e `$&` não
    // se expande no conteúdo casado. O `&` sai escapado, como todo `&`.
    expect(html).toContain('Divergência de R$$ 50 no fechamento');
    expect(html).toContain("Cliente citou $&amp; e $` na reclamação");
  });
});

describe('escapeHtml', () => {
  it('escapa os cinco caracteres especiais e converte \\n em <br>', () => {
    expect(escapeHtml('a & b < c > d " e\nf')).toBe('a &amp; b &lt; c &gt; d &quot; e<br>f');
  });
});
