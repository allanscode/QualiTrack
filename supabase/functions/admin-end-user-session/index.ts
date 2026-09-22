import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsFor, rejectRequest } from '../_shared/http.ts'
import { publicApiKey, secretApiKey } from '../_shared/keys.ts'

const corsHeaders = corsFor(Deno.env.get('FRONTEND_URL'))

serve(async (req) => {
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

    // Retira o usuário da fonte de presença imediatamente. O comando abaixo
    // continua responsável por limpar a sessão nos navegadores conectados.
    const { error: presenceError } = await admin
      .from('user_presence_sessions')
      .update({ offline_at: new Date().toISOString() })
      .eq('user_id', targetId)
      .is('offline_at', null)
    if (presenceError) throw presenceError

    const { error: commandError } = await admin.from('session_control_commands').insert({
      target_user_id: targetId,
      requested_by: caller.id,
      command: 'logout',
    })
    if (commandError) throw commandError
    return json({ success: true })
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
