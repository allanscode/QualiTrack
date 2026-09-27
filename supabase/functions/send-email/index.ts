import { publicApiKey, secretApiKey } from '../_shared/keys.ts';
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { corsFor, rejectRequest, escapeHtml } from '../_shared/http.ts';
import { emailRecipientAllowed, smtpConfiguration } from '../_shared/email-policy.ts';
import { reportMetrics, reportSubject } from './report-input.ts';

const runtime = Deno as unknown as { writeAll?: (w: { write(b: Uint8Array): Promise<number> }, b: Uint8Array) => Promise<void> };
runtime.writeAll ??= async (writer, bytes) => {
  let offset = 0;
  while (offset < bytes.length) {
    const written = await writer.write(bytes.subarray(offset));
    if (written <= 0) throw new Error('SMTP write failed');
    offset += written;
  }
};
const headers = { ...corsFor(Deno.env.get('FRONTEND_URL')), 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

serve(async req => {
  const rejected = rejectRequest(req, headers);
  if (rejected) return rejected;
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json({ success: false, error: 'Sessão necessária' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, secretApiKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return json({ success: false, error: 'Sessão inválida' }, 401);
  const { data: caller } = await db.from('users').select('role,active').eq('id', user.id).maybeSingle();
  if (!caller?.active || !['admin', 'gestor_qualidade'].includes(caller.role)) return json({ success: false, error: 'Acesso negado' }, 403);
  if (Number(req.headers.get('content-length') || 0) > 32_768) return json({ success: false, error: 'Payload muito grande.' }, 413);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > 32_768) return json({ success: false, error: 'Payload muito grande.' }, 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ success: false, error: 'JSON inválido.' }, 400); }

  if (body?.type === 'executive_report') {
    const metrics = reportMetrics(body.kpiSummary);
    if (!metrics) return json({ success: false, error: 'Indicadores do relatório inválidos.' }, 400);
    const rawRecipients: unknown = body.recipients;
    if (!Array.isArray(rawRecipients) || rawRecipients.length === 0 || rawRecipients.length > 50) {
      return json({ success: false, error: 'Lista de destinatários inválida ou vazia (máx 50).' }, 400);
    }
    const recipients: string[] = [];
    for (const r of rawRecipients) {
      if (typeof r !== 'string' || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(r.trim())) {
        return json({ success: false, error: `Destinatário inválido: ${String(r).slice(0, 50)}` }, 400);
      }
      const trimmed = r.trim().toLowerCase();
      if (!emailRecipientAllowed(trimmed, Deno.env.get('EMAIL_ALLOWED_RECIPIENTS'))) {
        return json({ success: false, error: `Envio não habilitado para o destinatário ${trimmed} no ambiente.` }, 403);
      }
      if (!recipients.includes(trimmed)) {
        recipients.push(trimmed);
      }
    }

    const callerLimit = await db.rpc('consume_security_rate_limit', { bucket_key: `mailer:${user.id}`, max_requests: 30, window_seconds: 900 });
    if (callerLimit.error) return json({ success: false, error: 'Serviço indisponível' }, 503);
    if (!callerLimit.data) return json({ success: false, error: 'Limite de envio atingido (máx 30 disparos por 15min).' }, 429);

    const subject = reportSubject(body.subject);

    const teamTitle = escapeHtml(typeof body.teamTitle === 'string' ? body.teamTitle.slice(0, 100) : 'Equipe');
    const periodLabel = escapeHtml(typeof body.periodLabel === 'string' ? body.periodLabel.slice(0, 100) : 'Período Atual');
    const customMessage = escapeHtml(typeof body.customMessage === 'string' ? body.customMessage.slice(0, 1500) : '');
    const reportNotes = escapeHtml(typeof body.reportNotes === 'string' ? body.reportNotes.slice(0, 2000) : '');
    const senderName = escapeHtml(typeof body.senderName === 'string' ? body.senderName.slice(0, 100) : 'QualiTrack - Gestão da Qualidade');

    const avgScore = metrics.avgScore.toFixed(1);
    const targetScore = metrics.targetScore;
    const totalAudits = metrics.totalAudits;
    const criticalRate = metrics.criticalRate.toFixed(1);

    const scoreColor = Number(avgScore) >= targetScore ? '#10B981' : '#F59E0B';

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 32px; }
    .message { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px; white-space: pre-wrap; background: #f1f5f9; padding: 16px; border-radius: 12px; }
    .footer { border-top: 1px solid #e2e8f0; padding: 20px 32px; font-size: 11px; color: #94a3b8; text-align: center; background: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>QualiTrack · Relatório Executivo</h1>
      <p>${teamTitle} &bull; ${periodLabel}</p>
    </div>
    <div class="content">
      ${customMessage ? `<div class="message">${customMessage}</div>` : ''}
      <table style="width:100%; border-collapse: separate; border-spacing: 12px; margin-bottom: 20px;">
        <tr>
          <td style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; width:50%;">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Média Geral</div>
            <div style="font-size:24px; font-weight:900; color:${scoreColor};">${avgScore}%</div>
            <div style="font-size:11px; color:#64748b;">Meta: ${targetScore}%</div>
          </td>
          <td style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; width:50%;">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Amostra Auditada</div>
            <div style="font-size:24px; font-weight:900; color:#0f172a;">${totalAudits}</div>
            <div style="font-size:11px; color:#64748b;">atendimentos</div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; width:50%;">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Erros Críticos</div>
            <div style="font-size:24px; font-weight:900; color:${Number(criticalRate) > 5 ? '#ef4444' : '#10b981'};">${criticalRate}%</div>
            <div style="font-size:11px; color:#64748b;">incidência</div>
          </td>
          <td style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; width:50%;">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b;">Status da Meta</div>
            <div style="font-size:16px; font-weight:800; color:${Number(avgScore) >= targetScore ? '#10b981' : '#f59e0b'}; margin-top: 6px;">
              ${Number(avgScore) >= targetScore ? 'Atingida ✓' : 'Em Acompanhamento'}
            </div>
          </td>
        </tr>
      </table>
      ${reportNotes ? `<div style="background:#fffbeb; border:1px solid #fef3c7; border-left:4px solid #f59e0b; border-radius:8px; padding:14px; font-size:13px; color:#92400e; margin-bottom:20px;"><strong>Parecer da Gestão:</strong><br/>"${reportNotes}"</div>` : ''}
    </div>
    <div class="footer">
      Disparado por ${senderName} via QualiTrack • Sistema Integrado de Gestão da Qualidade
    </div>
  </div>
</body>
</html>`;

    const textContent = `${subject}\n\nEquipe: ${teamTitle}\nPeríodo: ${periodLabel}\n\n` +
      `Média: ${avgScore}% (Meta: ${targetScore}%)\n` +
      `Amostra: ${totalAudits} atendimentos\n` +
      `Erros Críticos: ${criticalRate}%\n\n` +
      (reportNotes ? `Parecer da Gestão:\n"${reportNotes}"\n\n` : '') +
      `Disparado por ${senderName} via QualiTrack`;

    const client = new SmtpClient();
    try {
      const config = smtpConfiguration({
        SMTP_USERNAME: Deno.env.get('SMTP_USERNAME'),
        SMTP_PASSWORD: Deno.env.get('SMTP_PASSWORD'),
        SMTP_HOSTNAME: Deno.env.get('SMTP_HOSTNAME'),
        SMTP_PORT: Deno.env.get('SMTP_PORT'),
      });
      await client.connectTLS(config);
      const fromAddress = config.username;
      for (const to of recipients) {
        await client.send({
          from: fromAddress,
          to,
          subject,
          content: textContent,
          html: htmlBody,
        });
      }
      return json({ success: true, count: recipients.length });
    } catch {
      console.error('send-email: falha no envio SMTP de relatório');
      return json({ success: false, error: 'Falha no servidor SMTP ao disparar o relatório. Verifique a configuração de SMTP.' }, 503);
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  // Invites/resets belong to Supabase Auth. Never accept arbitrary recipients/HTML.
  if (body?.type !== 'rejection' || typeof body.request_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.request_id)) return json({ success: false, error: 'Solicitação inválida' }, 400);
  const { data: request, error: requestError } = await db.from('access_requests')
    .select('id,email,name,rejection_reason,status').eq('id', body.request_id).maybeSingle();
  if (requestError || !request || request.status !== 'rejected') return json({ success: false, error: 'Solicitação indisponível' }, 400);
  if (!emailRecipientAllowed(request.email, Deno.env.get('EMAIL_ALLOWED_RECIPIENTS'))) return json({ success: false, error: 'Envio não habilitado para este destinatário no ambiente.' }, 403);
  const callerLimit = await db.rpc('consume_security_rate_limit', { bucket_key: `mailer:${user.id}`, max_requests: 20, window_seconds: 900 });
  if (callerLimit.error) return json({ success: false, error: 'Serviço indisponível' }, 503);
  if (!callerLimit.data) return json({ success: false, error: 'Limite de envio atingido' }, 429);
  const { data: allowed, error: limitError } = await db.rpc('consume_security_rate_limit', {
    bucket_key: `rejection:${request.id}`, max_requests: 1, window_seconds: 300,
  });
  if (limitError) return json({ success: false, error: 'Serviço indisponível' }, 503);
  if (!allowed) return json({ success: false, error: 'Aguarde antes de reenviar' }, 429);
  const client = new SmtpClient();
  try {
    const config = smtpConfiguration({ SMTP_USERNAME: Deno.env.get('SMTP_USERNAME'), SMTP_PASSWORD: Deno.env.get('SMTP_PASSWORD'), SMTP_HOSTNAME: Deno.env.get('SMTP_HOSTNAME'), SMTP_PORT: Deno.env.get('SMTP_PORT') });
    await client.connectTLS(config);
    const username = config.username;
    const name = escapeHtml(request.name);
    const reason = escapeHtml(request.rejection_reason || 'Não informado.');
    await client.send({ from: username, to: request.email, subject: 'QualidadeWP - Solicitação de acesso',
      content: `Olá, ${request.name}. Sua solicitação foi recusada. Motivo: ${request.rejection_reason || 'Não informado.'}`,
      html: `<p>Olá, ${name}.</p><p>Sua solicitação de acesso foi recusada.</p><p>${reason}</p><p>Em caso de dúvidas, contate o administrador.</p>`,
    });
    return json({ success: true });
  } catch {
    console.error('send-email: falha no envio SMTP');
    return json({ success: false, error: 'Não foi possível enviar a notificação. Contate o administrador.' }, 503);
  } finally {
    try { await client.close(); } catch { /* connection may not have opened */ }
  }
});
