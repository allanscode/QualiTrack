# Supabase Email Templates — QualidadeWP

> Acesse: **Supabase Dashboard → Authentication → Emails → Templates**
>
> Marca atual: **QualidadeWP** (renomeado de QualiTrack em ago/2026). Paleta usada
> aqui vem de `src/index.css` (`--brand-primary: #0A1F44`, `--brand-highlight`/
> `--brand-accent: #B3141B`) — a mesma da interface logada.

## Mapeamento Template → Uso real

| Template no Supabase | Usamos? | Seção neste doc |
|---|---|---|
| **Invite User** | ✅ Sempre (admin convida/cria usuário) | Seção 1 |
| **Reset Password** | ✅ Sempre (recuperação de senha) | Seção 2 |
| **Confirm signup** | ⚠️ Só se autocadastro público estiver ativo (hoje não está) | Seção 3 |
| **Magic Link** | ❌ Não usado | — |
| **Confirm Change Email** | ❌ Não usado | — |
| **Confirm reauthentication** | ❌ Não usado | — |

O código (`admin-invite-user`) chama `inviteUserByEmail()` para usuário novo e
`resetPasswordForEmail()` tanto pra recuperação de senha quanto para reenviar
acesso a um usuário já existente — nos dois casos o Supabase escolhe o template
certo sozinho, pelo tipo de chamada, sem nada a configurar em código.

---

## 1. Invite User (Convite de Acesso)

**Subject:** Você foi convidado para o QualidadeWP

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #EEF1F6; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #EEF1F6; padding: 40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 20px; box-shadow: 0 8px 32px rgba(10,31,68,0.10); overflow: hidden;">
            <!-- Header -->
            <tr>
              <td style="background-color: #0A1F44; padding: 44px 40px 32px; text-align: center;">
                <div style="display: inline-block; font-size: 26px; font-weight: 800; letter-spacing: 0.5px;">
                  <span style="color: #F9F9F6;">Qualidade</span><span style="background-color: #B3141B; color: #ffffff; padding: 2px 8px; border-radius: 6px; margin-left: 2px;">WP</span>
                </div>
                <p style="color: #9DA8C0; font-size: 13px; margin: 10px 0 0; letter-spacing: 0.5px;">Gestão de Qualidade para Suporte</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #0A1F44; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Convite de Acesso</h2>
                <p style="color: #4A5468; font-size: 15px; line-height: 24px; margin: 0 0 24px;">
                  Olá! Você foi convidado a fazer parte do <strong style="color: #0A1F44;">QualidadeWP</strong>,
                  o sistema de gestão de qualidade de atendimento da WebPosto.
                </p>
                <p style="color: #4A5468; font-size: 15px; line-height: 24px; margin: 0 0 32px;">
                  Clique no botão abaixo para aceitar o convite e definir sua senha de acesso.
                </p>
                <!-- Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 32px;">
                  <tr>
                    <td align="center" style="background-color: #B3141B; border-radius: 10px; padding: 14px 40px;">
                      <a href="{{ .ConfirmationURL }}" style="color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">
                        Aceitar Convite
                      </a>
                    </td>
                  </tr>
                </table>
                <!-- Fallback link -->
                <p style="color: #9DA8C0; font-size: 13px; line-height: 20px; margin: 0 0 8px;">
                  Se o botão não funcionar, copie e cole o link abaixo no navegador:
                </p>
                <p style="color: #B3141B; font-size: 12px; line-height: 18px; margin: 0; word-break: break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color: #F4F6FA; padding: 22px 40px; text-align: center;">
                <p style="color: #9DA8C0; font-size: 12px; margin: 0;">
                  Se você não esperava este convite, pode ignorar este e-mail com segurança.
                </p>
                <p style="color: #9DA8C0; font-size: 12px; margin: 8px 0 0;">
                  &copy; 2026 QualidadeWP · WebPosto. Todos os direitos reservados.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 2. Reset Password (Recuperação de Senha)

**Subject:** Redefinição de senha — QualidadeWP

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #EEF1F6; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #EEF1F6; padding: 40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 20px; box-shadow: 0 8px 32px rgba(10,31,68,0.10); overflow: hidden;">
            <!-- Header -->
            <tr>
              <td style="background-color: #0A1F44; padding: 44px 40px 32px; text-align: center;">
                <div style="display: inline-block; font-size: 26px; font-weight: 800; letter-spacing: 0.5px;">
                  <span style="color: #F9F9F6;">Qualidade</span><span style="background-color: #B3141B; color: #ffffff; padding: 2px 8px; border-radius: 6px; margin-left: 2px;">WP</span>
                </div>
                <p style="color: #9DA8C0; font-size: 13px; margin: 10px 0 0; letter-spacing: 0.5px;">Gestão de Qualidade para Suporte</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #0A1F44; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Redefinição de Senha</h2>
                <p style="color: #4A5468; font-size: 15px; line-height: 24px; margin: 0 0 24px;">
                  Recebemos uma solicitação de redefinição de senha para a conta associada a
                  <strong style="color: #0A1F44;">{{ .Email }}</strong>.
                </p>
                <p style="color: #4A5468; font-size: 15px; line-height: 24px; margin: 0 0 32px;">
                  Clique no botão abaixo para criar uma nova senha. Este link expira em 1 hora.
                </p>
                <!-- Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 32px;">
                  <tr>
                    <td align="center" style="background-color: #B3141B; border-radius: 10px; padding: 14px 40px;">
                      <a href="{{ .ConfirmationURL }}" style="color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">
                        Redefinir Senha
                      </a>
                    </td>
                  </tr>
                </table>
                <!-- Fallback link -->
                <p style="color: #9DA8C0; font-size: 13px; line-height: 20px; margin: 0 0 8px;">
                  Se o botão não funcionar, copie e cole o link abaixo no navegador:
                </p>
                <p style="color: #B3141B; font-size: 12px; line-height: 18px; margin: 0; word-break: break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color: #F4F6FA; padding: 22px 40px; text-align: center;">
                <p style="color: #9DA8C0; font-size: 12px; margin: 0;">
                  Se você não solicitou esta redefinição, ignore este e-mail — sua senha continua a mesma.
                </p>
                <p style="color: #9DA8C0; font-size: 12px; margin: 8px 0 0;">
                  &copy; 2026 QualidadeWP · WebPosto. Todos os direitos reservados.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 3. Confirm signup (Confirmação de Cadastro)

> Só é enviado se o autocadastro público estiver ativo no Supabase (Authentication →
> Providers → Email → "Allow new users to sign up"). Hoje o QualidadeWP usa só convite
> administrativo, então este template normalmente não dispara — mantido aqui por
> completude/segurança, caso a opção seja ligada no futuro.

**Subject:** Confirme seu cadastro — QualidadeWP

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #EEF1F6; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #EEF1F6; padding: 40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 20px; box-shadow: 0 8px 32px rgba(10,31,68,0.10); overflow: hidden;">
            <tr>
              <td style="background-color: #0A1F44; padding: 44px 40px 32px; text-align: center;">
                <div style="display: inline-block; font-size: 26px; font-weight: 800; letter-spacing: 0.5px;">
                  <span style="color: #F9F9F6;">Qualidade</span><span style="background-color: #B3141B; color: #ffffff; padding: 2px 8px; border-radius: 6px; margin-left: 2px;">WP</span>
                </div>
                <p style="color: #9DA8C0; font-size: 13px; margin: 10px 0 0; letter-spacing: 0.5px;">Gestão de Qualidade para Suporte</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #0A1F44; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Confirmação de Cadastro</h2>
                <p style="color: #4A5468; font-size: 15px; line-height: 24px; margin: 0 0 24px;">
                  Bem-vindo ao <strong style="color: #0A1F44;">QualidadeWP</strong>! Clique no botão abaixo
                  para confirmar seu cadastro e acessar a plataforma.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 32px;">
                  <tr>
                    <td align="center" style="background-color: #B3141B; border-radius: 10px; padding: 14px 40px;">
                      <a href="{{ .ConfirmationURL }}" style="color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">
                        Confirmar Cadastro
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="color: #9DA8C0; font-size: 13px; line-height: 20px; margin: 0 0 8px;">
                  Se o botão não funcionar, copie e cole o link abaixo no navegador:
                </p>
                <p style="color: #B3141B; font-size: 12px; line-height: 18px; margin: 0; word-break: break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color: #F4F6FA; padding: 22px 40px; text-align: center;">
                <p style="color: #9DA8C0; font-size: 12px; margin: 0;">
                  &copy; 2026 QualidadeWP · WebPosto. Todos os direitos reservados.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## Como Aplicar

1. Acesse **Supabase Dashboard → Authentication → Emails → Templates**
2. Para cada template, clique no nome, cole o **Subject** indicado acima e o **HTML** correspondente no corpo
3. Clique em **Save** — repita para os 2 (ou 3) templates

> **Importante**: os templates usam variáveis do Supabase (`{{ .ConfirmationURL }}`,
> `{{ .Email }}`) que são substituídas automaticamente no envio — não altere esses
> placeholders, só o texto ao redor.

> **Cores usadas**: `#0A1F44` (navy, header/títulos) e `#B3141B` (vermelho, botão/links de
> destaque) — os mesmos tokens `--brand-primary` e `--brand-highlight`/`--brand-accent` de
> `src/index.css`. Se a marca mudar de novo, atualize aqui junto.
