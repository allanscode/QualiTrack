import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"

// Troca o e-mail de um usuário já existente, nos dois lugares que precisam
// ficar em sincronia: auth.users (controla o login de verdade) e
// public.users (o que a UI mostra). Editar só public.users diretamente
// (como o resto da tela de Usuários já faz para nome/papel/equipe) deixaria
// a pessoa logando com o e-mail antigo enquanto a tela mostra o novo — por
// isso esse único caso passa por uma Edge Function com service role.

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RequestSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
})

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Token de autenticação não fornecido' }, 401)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Sessão inválida ou expirada' }, 401)
    }

    // Mesmo padrão de restrição de admin-invite-user: trocar o e-mail de
    // login de outra pessoa é uma operação de identidade sensível, restrita
    // a quem já pode gerenciar usuários.
    const { data: caller } = await supabaseClient.from('users').select('role, active').eq('id', user.id).single()
    if (!caller || !caller.active || !['admin', 'gestor_qualidade'].includes(caller.role)) {
      return jsonResponse({ success: false, error: 'Forbidden: apenas administradores/gestores de qualidade podem editar o e-mail de outro usuário' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse({ success: false, error: 'Payload inválido', details: parsed.error.flatten() }, 400)
    }

    const { id, email } = parsed.data
    const emailLower = email.toLowerCase()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Já confirma o e-mail direto: é um admin corrigindo/atualizando o
    // cadastro de outra pessoa (não um self-service), e o SMTP do projeto
    // já se mostrou não confiável para depender de um e-mail de confirmação
    // chegar. O login passa a valer com o novo e-mail imediatamente.
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: emailLower,
      email_confirm: true,
    })

    if (authError) {
      const isDuplicate = authError.message?.toLowerCase().includes('already been registered')
        || authError.message?.toLowerCase().includes('duplicate');
      return jsonResponse({
        success: false,
        error: isDuplicate ? 'Já existe uma conta com esse e-mail.' : `Falha ao atualizar e-mail no Auth: ${authError.message}`
      }, isDuplicate ? 409 : 500)
    }

    const { error: dbError } = await supabaseAdmin.from('users').update({ email: emailLower }).eq('id', id)
    if (dbError) {
      // O Auth já foi atualizado nesse ponto — loga claramente pra não ficar
      // um estado inconsistente silencioso (login novo, tela mostrando o
      // e-mail antigo até o próximo refresh manual).
      console.error('[admin-update-user-email] Auth atualizado mas public.users falhou:', dbError.message)
      return jsonResponse({ success: false, error: `E-mail de login trocado, mas falhou ao atualizar o cadastro: ${dbError.message}` }, 500)
    }

    return jsonResponse({ success: true }, 200)
  } catch (error: any) {
    console.error('[admin-update-user-email] Erro:', error)
    return jsonResponse({ success: false, error: error.message || 'Erro interno do servidor' }, 500)
  }
})
