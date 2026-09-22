import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsFor, rejectRequest } from '../_shared/http.ts'
import { publicApiKey, secretApiKey } from '../_shared/keys.ts'

const corsHeaders = corsFor(Deno.env.get('FRONTEND_URL'))

Deno.serve(async (req) => {
  const rejected = rejectRequest(req, corsHeaders)
  if (rejected) return rejected
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Sessão não informada.')
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', publicApiKey(), {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await client.auth.getUser(token)
    if (authError || !caller) return json({ success: false, error: 'Não autorizado.' }, 401)

    const { data: callerProfile } = await client.from('users').select('role, active').eq('id', caller.id).single()
    if (!callerProfile?.active || !['admin', 'gestor_qualidade'].includes(callerProfile.role)) {
      return json({ success: false, error: 'Sem permissão para encerrar sessões.' }, 403)
    }

    const body = await req.json()
    const targetId = typeof body?.user_id === 'string' ? body.user_id : ''
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(targetId) || targetId === caller.id) {
      return json({ success: false, error: 'Usuário de destino inválido.' }, 400)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', secretApiKey())
    const { data: target, error: targetError } = await admin.from('users').select('id, role, active').eq('id', targetId).single()
    if (targetError || !target?.active) return json({ success: false, error: 'Usuário não encontrado ou inativo.' }, 404)
    if (target.role === 'admin' && callerProfile.role !== 'admin') {
      return json({ success: false, error: 'Apenas administradores podem encerrar a sessão de outro administrador.' }, 403)
    }

    const { data: termination, error: terminationError } = await admin
      .rpc('admin_terminate_user_sessions', {
        p_caller_id: caller.id,
        p_target_user_id: targetId,
      })
      .single()
    if (terminationError) throw terminationError

    return json({
      success: true,
      revoked_sessions: termination?.revoked_sessions ?? 0,
      command_id: termination?.command_id ?? null,
    })
  } catch (error) {
    console.error('[admin-end-user-session]', error)
    return json({ success: false, error: 'Não foi possível encerrar a sessão.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
