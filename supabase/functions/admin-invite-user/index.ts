import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'gestor_qualidade', 'qualidade', 'gestor_suporte', 'suporte']).optional(),
  team_ids: z.array(z.string().uuid()).optional()
})

// Rate limiting store (in-memory, resets on cold start)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  if (!entry || now > entry.resetTime) {
    // Nova janela
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }
  
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }
  
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime };
}

async function syncUserTeams(supabaseAdmin: any, userId: string, teamIds: string[]) {
  const { data: existing } = await supabaseAdmin
    .from('user_teams')
    .select('id, team_id')
    .eq('user_id', userId)

  const existingTeamIds = (existing || []).map((ut: any) => ut.team_id)
  const toAdd = teamIds.filter((id: string) => !existingTeamIds.includes(id))
  const toRemove = (existing || []).filter((ut: any) => !teamIds.includes(ut.team_id))

  if (toRemove.length > 0) {
    const removeIds = toRemove.map((ut: any) => ut.id)
    await supabaseAdmin.from('user_teams').delete().in('id', removeIds)
  }
  if (toAdd.length > 0) {
    const inserts = toAdd.map((team_id: string) => ({ user_id: userId, team_id }))
    await supabaseAdmin.from('user_teams').insert(inserts)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Rate limiting por IP + User Agent (ou user ID se autenticado)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const rateLimitKey = `invite:${clientIp}`;
    const rateLimit = checkRateLimit(rateLimitKey, 10, 60000); // 10 requests por minuto
    
    const rateLimitHeaders = {
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(rateLimit.resetTime / 1000).toString(),
    };

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Rate limit exceeded. Try again later.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', details: userError }), {
        status: 401,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: adminUser } = await supabaseClient.from('users').select('role').eq('id', user.id).single()
    if (!adminUser || !['admin', 'gestor_qualidade', 'gestor_suporte'].includes(adminUser.role)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admins only. User role is: ' + (adminUser?.role || 'none') }), {
        status: 403,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const result = InviteSchema.safeParse(body)
    
    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payload', details: result.error.errors }),
        {
          headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    const { email, name, role, team_ids } = result.data

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const userPayload = {
      name: name,
      role: role || 'suporte',
      active: true,
      must_change_password: true
    }

    const { data: existingUser, error: searchError } = await supabaseAdmin
      .from('users')
      .select('id, active')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (searchError) {
      console.warn('Search User Error (non-fatal):', searchError)
    }

    if (existingUser) {
      const { error: dbError } = await supabaseAdmin.from('users').update(userPayload).eq('id', existingUser.id)

      if (dbError) {
        console.error('DB Update Error for existing user:', dbError)
        return new Response(JSON.stringify({ success: false, error: 'Failed to update existing user in public users table', details: dbError }), {
          status: 500,
          headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
        })
      }

      await syncUserTeams(supabaseAdmin, existingUser.id, team_ids || [])

      const origin = req.headers.get('Origin') || Deno.env.get('FRONTEND_URL') || 'http://localhost:3000'
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
        redirectTo: origin
      })

      if (resetError) {
        console.error('Reset Password Error:', resetError)
        return new Response(JSON.stringify({ success: false, error: 'Failed to send password reset email to existing user', details: resetError }), {
          status: 500,
          headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true, user: { id: existingUser.id, email } }), {
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
      })
    }

    // redirectTo é obrigatório aqui: sem ele o Supabase usa o Site URL do
    // projeto, que vem como http://localhost:3000 por padrão — o convidado
    // recebia um link para localhost e não conseguia criar a senha. O caminho
    // de usuário já existente (resetPasswordForEmail acima) já fazia isso.
    // Observação: o Supabase valida este valor contra a lista de Redirect URLs
    // do projeto; se a URL não estiver liberada lá, ele cai no Site URL de
    // qualquer forma. Configurar ambos no painel continua sendo necessário.
    const inviteOrigin = req.headers.get('Origin') || Deno.env.get('FRONTEND_URL') || 'http://localhost:3000'
    const { data: authData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: inviteOrigin
    })

    if (inviteError) {
      const isAlreadyRegistered = inviteError.message?.includes('already been registered') || inviteError.status === 422;
      if (isAlreadyRegistered) {
        const { data: { users: authUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        const foundUser = authUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase())
        if (foundUser) {
          const { error: dbError } = await supabaseAdmin.from('users').upsert({
            id: foundUser.id,
            email: email.toLowerCase(),
            ...userPayload,
            created_at: new Date().toISOString()
          })

          if (dbError) {
            console.error('DB Upsert Fallback Error:', dbError)
            return new Response(JSON.stringify({ success: false, error: 'Failed to save to public users table in fallback', details: dbError }), {
              status: 500,
              headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
            })
          }

          await syncUserTeams(supabaseAdmin, foundUser.id, team_ids || [])

          const origin = req.headers.get('Origin') || Deno.env.get('FRONTEND_URL') || 'http://localhost:3000'
          const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
            redirectTo: origin
          })

          if (resetError) {
            console.error('Reset Password Fallback Error:', resetError)
            return new Response(JSON.stringify({ success: false, error: 'Failed to send password reset email in fallback', details: resetError }), {
              status: 500,
              headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
            })
          }

          return new Response(JSON.stringify({ success: true, user: foundUser }), {
            headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      console.error('Invite Error:', inviteError)
      return new Response(JSON.stringify({ success: false, error: 'Failed to invite user via Auth', details: inviteError }), {
        status: 500,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: dbError } = await supabaseAdmin.from('users').upsert({
      id: authData.user.id,
      email: email.toLowerCase(),
      ...userPayload,
      created_at: new Date().toISOString()
    })

    if (dbError) {
      console.error('DB Insert Error:', dbError)
      return new Response(JSON.stringify({ success: false, error: 'Failed to save to public users table', details: dbError }), {
        status: 500,
        headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
      })
    }

    await syncUserTeams(supabaseAdmin, authData.user.id, team_ids || [])

    return new Response(JSON.stringify({ success: true, user: authData.user }), {
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Catch Error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Internal Server Error', message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, ...rateLimitHeaders, 'Content-Type': 'application/json' },
    })
  }
})
