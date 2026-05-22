import { SmtpClient } from "https://deno.land/x/smtp/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Polyfill para Deno.writeAll
if (!(Deno as any).writeAll) {
  (Deno as any).writeAll = async (w: any, b: Uint8Array) => {
    let nwritten = 0;
    while (nwritten < b.length) {
      nwritten += await w.write(b.subarray(nwritten));
    }
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, type, token, name } = await req.json();
    console.log(`[LOG] Iniciando envio de e-mail tipo: ${type} para: ${email}`);

    const client = new SmtpClient();

    const smtpUsername = Deno.env.get("SMTP_USERNAME");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");

    if (!smtpUsername || !smtpPassword) {
      throw new Error("SMTP_USERNAME e SMTP_PASSWORD não configurados. Defina via: supabase secrets set SMTP_USERNAME=... SMTP_PASSWORD=...");
    }

    console.log(`[LOG] Conectando ao smtp.gmail.com...`);
    await client.connectTLS({
      hostname: Deno.env.get("SMTP_HOSTNAME") || "smtp.gmail.com",
      port: parseInt(Deno.env.get("SMTP_PORT") || "465"),
      username: smtpUsername,
      password: smtpPassword,
    });

    const resetLink = `http://localhost:3001/setup-password?token=${token}`;

    let subject = "";
    let htmlContent = "";

    if (type === 'welcome') {
      subject = "Bem-vindo ao QualiTrack - Defina sua senha";
      htmlContent = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #2D3A3A; padding: 20px; border: 1px solid #E2E4D8; border-radius: 12px;">
          <h2 style="color: #2D3A3A;">Olá, ${name}!</h2>
          <p>Sua conta no QualiTrack foi aprovada com sucesso.</p>
          <p>Para definir sua senha e começar a usar o sistema, clique no botão abaixo:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #2D3A3A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Definir Minha Senha</a>
          </div>
          <p style="font-size: 12px; color: #7A7D71; border-top: 1px solid #E2E4D8; pt-20px; margin-top: 20px;">
            Se o botão acima não funcionar, copie e cole este link no seu navegador:<br>
            ${resetLink}
          </p>
        </div>
      `;
    } else if (type === 'reset') {
      subject = "QualiTrack - Recuperação de Senha";
      htmlContent = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #2D3A3A; padding: 20px; border: 1px solid #E2E4D8; border-radius: 12px;">
          <h2 style="color: #2D3A3A;">Olá, ${name || 'Usuário'}!</h2>
          <p>Recebemos uma solicitação de recuperação de senha para sua conta.</p>
          <p>Para definir uma nova senha, clique no botão abaixo:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #A7C0A5; color: #2D3A3A; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
          </div>
          <p style="font-size: 12px; color: #7A7D71; border-top: 1px solid #E2E4D8; pt-20px; margin-top: 20px;">
            Se o botão acima não funcionar, copie e cole este link no seu navegador:<br>
            ${resetLink}
          </p>
        </div>
      `;
    } else if (type === 'rejection') {
      const reason = token; // Reuse the token field for the rejection reason text
      subject = "QualiTrack - Solicitação de Acesso";
      htmlContent = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #2D3A3A; padding: 20px; border: 1px solid #E2E4D8; border-radius: 12px;">
          <h2 style="color: #2D3A3A;">Olá, ${name}!</h2>
          <p>Sua solicitação de acesso ao sistema QualiTrack foi analisada.</p>
          <p>Infelizmente, não foi possível aprovar seu acesso neste momento pelo seguinte motivo:</p>
          <div style="background-color: #F9F9F6; border: 1px solid #E2E4D8; padding: 15px; border-radius: 8px; font-style: italic; margin: 20px 0;">
            "${reason || 'Não informado.'}"
          </div>
          <p>Caso tenha dúvidas, entre em contato com o administrador do sistema.</p>
        </div>
      `;
    }

    console.log(`[LOG] Enviando e-mail via SMTP...`);
    
    // Criar uma versão em texto simples amigável para o campo 'content'
    let plainTextContent = "";
    if (type === 'rejection') {
      plainTextContent = `Olá, ${name}!\n\nSua solicitação de acesso ao QualiTrack foi analisada.\nInfelizmente, seu acesso não foi aprovado pelo seguinte motivo:\n\n"${token}"\n\nCaso tenha dúvidas, entre em contato com o administrador.`;
    } else {
      plainTextContent = `Olá, ${name}!\n\nSua conta no QualiTrack foi aprovada.\nPara definir sua senha, acesse o link: http://localhost:3001/setup-password?token=${token}`;
    }

  await client.send({
    from: Deno.env.get("SMTP_USERNAME") || "qualidade@webposto.com.br",
      to: email,
      subject: subject,
      content: plainTextContent,
      html: htmlContent,
    });

    console.log(`[LOG] E-mail enviado com sucesso para ${email}`);
    await client.close();

    return new Response(
      JSON.stringify({ success: true, message: "E-mail enviado com sucesso" }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('[ERRO SMTP]:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});
