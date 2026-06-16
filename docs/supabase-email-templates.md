# Supabase Email Templates — QualiTrack

> Acesse: **Supabase Dashboard → Authentication → Email Templates**

## Mapeamento Template → Seção

| Template no Supabase | Usamos? | Seção neste doc |
|---|---|---|
| **Confirm signup** | ⚠️ Se auto-cadastro estiver ativo | Seção 3 |
| **Invite User** | ✅ Sempre (admin convida) | Seção 2 |
| **Magic Link** | ❌ Pule (não usado) | — |
| **Confirm Change Email** | ❌ Pule (não usado) | — |
| **Reset Password** | ✅ Sempre (recuperação) | Seção 1 |
| **Confirm reauthentication** | ❌ Pule (não usado) | — |

---

## 1. Change Password (Recuperação de Senha)

**Subject:** Redefinição de senha — QualiTrack

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f5f0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f0; padding: 40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); overflow: hidden;">
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #2D3A3A 0%, #1D2727 100%); padding: 48px 40px 32px; text-align: center;">
                <h1 style="color: #F9F9F6; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: 1px; text-transform: uppercase;">QualiTrack</h1>
                <p style="color: #A3A69A; font-size: 14px; margin: 8px 0 0; letter-spacing: 0.5px;">Gestão de Qualidade para Suporte</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #2D3A3A; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Redefinição de Senha</h2>
                <p style="color: #5C5F55; font-size: 15px; line-height: 24px; margin: 0 0 24px;">
                  Recebemos uma solicitação de redefinição de senha para a conta associada a <strong style="color: #2D3A3A;">{{ .Email }}</strong>.
                </p>
                <p style="color: #5C5F55; font-size: 15px; line-height: 24px; margin: 0 0 32px;">
                  Clique no botão abaixo para criar uma nova senha. Este link expira em 1 hora.
                </p>
                <!-- Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 32px;">
                  <tr>
                    <td align="center" style="background: linear-gradient(135deg, #8E9B7B 0%, #7A8A68 100%); border-radius: 16px; padding: 14px 40px;">
                      <a href="{{ .ConfirmationURL }}" style="color: #ffffff; font-size: 15px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">
                        Redefinir Senha
                      </a>
                    </td>
                  </tr>
                </table>
                <!-- Fallback link -->
                <p style="color: #A3A69A; font-size: 13px; line-height: 20px; margin: 0 0 8px;">
                  Se o botão não funcionar, copie e cole o link abaixo no navegador:
                </p>
                <p style="color: #8E9B7B; font-size: 12px; line-height: 18px; margin: 0; word-break: break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color: #f4f5f0; padding: 24px 40px; text-align: center;">
                <p style="color: #A3A69A; font-size: 12px; margin: 0;">
                  Se você não solicitou esta redefinição, ignore este email.
                </p>
                <p style="color: #A3A69A; font-size: 12px; margin: 8px 0 0;">
                  &copy; 2026 QualiTrack. Todos os direitos reservados.
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

## 2. Invite User (Convite)

**Subject:** Você foi convidado para o QualiTrack

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f5f0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f0; padding: 40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); overflow: hidden;">
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #2D3A3A 0%, #1D2727 100%); padding: 48px 40px 32px; text-align: center;">
                <h1 style="color: #F9F9F6; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: 1px; text-transform: uppercase;">QualiTrack</h1>
                <p style="color: #A3A69A; font-size: 14px; margin: 8px 0 0; letter-spacing: 0.5px;">Gestão de Qualidade para Suporte</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #2D3A3A; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Convite de Acesso</h2>
                <p style="color: #5C5F55; font-size: 15px; line-height: 24px; margin: 0 0 24px;">
                  Olá! Você foi convidado a fazer parte do <strong style="color: #2D3A3A;">QualiTrack</strong>, o sistema de gestão de qualidade para operações de suporte.
                </p>
                <p style="color: #5C5F55; font-size: 15px; line-height: 24px; margin: 0 0 32px;">
                  Clique no botão abaixo para aceitar o convite e definir sua senha de acesso.
                </p>
                <!-- Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 32px;">
                  <tr>
                    <td align="center" style="background: linear-gradient(135deg, #8E9B7B 0%, #7A8A68 100%); border-radius: 16px; padding: 14px 40px;">
                      <a href="{{ .ConfirmationURL }}" style="color: #ffffff; font-size: 15px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">
                        Aceitar Convite
                      </a>
                    </td>
                  </tr>
                </table>
                <!-- Fallback link -->
                <p style="color: #A3A69A; font-size: 13px; line-height: 20px; margin: 0 0 8px;">
                  Se o botão não funcionar, copie e cole o link abaixo no navegador:
                </p>
                <p style="color: #8E9B7B; font-size: 12px; line-height: 18px; margin: 0; word-break: break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color: #f4f5f0; padding: 24px 40px; text-align: center;">
                <p style="color: #A3A69A; font-size: 12px; margin: 0;">
                  Se você não esperava este convite, ignore este email.
                </p>
                <p style="color: #A3A69A; font-size: 12px; margin: 8px 0 0;">
                  &copy; 2026 QualiTrack. Todos os direitos reservados.
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

## 3. Confirmation (Confirmação de Cadastro)

**Subject:** Bem-vindo ao QualiTrack

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f5f0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f0; padding: 40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.06); overflow: hidden;">
            <tr>
              <td style="background: linear-gradient(135deg, #2D3A3A 0%, #1D2727 100%); padding: 48px 40px 32px; text-align: center;">
                <h1 style="color: #F9F9F6; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: 1px; text-transform: uppercase;">QualiTrack</h1>
                <p style="color: #A3A69A; font-size: 14px; margin: 8px 0 0; letter-spacing: 0.5px;">Gestão de Qualidade para Suporte</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 40px;">
                <h2 style="color: #2D3A3A; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Confirmação de Cadastro</h2>
                <p style="color: #5C5F55; font-size: 15px; line-height: 24px; margin: 0 0 24px;">
                  Bem-vindo ao <strong style="color: #2D3A3A;">QualiTrack</strong>! Clique no botão abaixo para confirmar seu cadastro e acessar a plataforma.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 32px;">
                  <tr>
                    <td align="center" style="background: linear-gradient(135deg, #8E9B7B 0%, #7A8A68 100%); border-radius: 16px; padding: 14px 40px;">
                      <a href="{{ .ConfirmationURL }}" style="color: #ffffff; font-size: 15px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">
                        Confirmar Cadastro
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="color: #A3A69A; font-size: 13px; line-height: 20px; margin: 0 0 8px;">
                  Se o botão não funcionar, copie e cole o link abaixo no navegador:
                </p>
                <p style="color: #8E9B7B; font-size: 12px; line-height: 18px; margin: 0; word-break: break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color: #f4f5f0; padding: 24px 40px; text-align: center;">
                <p style="color: #A3A69A; font-size: 12px; margin: 0;">
                  &copy; 2026 QualiTrack. Todos os direitos reservados.
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

1. Acesse **Supabase Dashboard → Authentication → Email Templates**
2. Para cada template, clique no template name e cole o HTML acima
3. Ajuste o **Subject** conforme especificado
4. Clique em **Save**

> **Importante**: Os templates usam variáveis Supabase (`{{ .ConfirmationURL }}`, `{{ .Email }}`) que são substituídas automaticamente no envio. Não altere esses placeholders.

> **Nota**: Se a opção "Confirmar email" estiver desabilitada nas configurações de Auth (o que é comum para convites internos), o template de Confirmação não será usado — apenas o de Convite e Recuperação de Senha.
