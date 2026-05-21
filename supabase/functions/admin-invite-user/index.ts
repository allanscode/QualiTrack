import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check if the user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Initialize the standard client to get the authenticated user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', details: userError }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Optional: Check if the requesting user is an admin by querying the public users table
    const { data: adminUser } = await supabaseClient.from('users').select('role').eq('id', user.id).single()
    if (!adminUser || !['admin', 'gestor_qualidade', 'gestor_suporte'].includes(adminUser.role)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admins only. User role is: ' + (adminUser?.role || 'none') }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse the request payload
    const { email, name, role, team_ids } = await req.json()

    if (!email || !name) {
      return new Response(JSON.stringify({ success: false, error: 'Email and Name are required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Initialize the Admin client using the Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if user already exists in public.users
    const { data: existingUser, error: searchError } = await supabaseAdmin
      .from('users')
      .select('id, active')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (searchError) {
      console.warn('Search User Error (non-fatal):', searchError)
    }

    if (existingUser) {
      // User already exists in public.users (and thus in auth.users)
      // 1. Update public.users
      const { error: dbError } = await supabaseAdmin.from('users').update({
        name: name,
        role: role || 'tecnico',
        team_ids: team_ids || [],
        active: true,
        must_change_password: true
      }).eq('id', existingUser.id)

      if (dbError) {
        console.error('DB Update Error for existing user:', dbError)
        return new Response(JSON.stringify({ success: false, error: 'Failed to update existing user in public users table', details: dbError }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // 2. Send reset password email
      const origin = req.headers.get('Origin') || 'http://localhost:3000'
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
        redirectTo: origin
      })

      if (resetError) {
        console.error('Reset Password Error:', resetError)
        return new Response(JSON.stringify({ success: false, error: 'Failed to send password reset email to existing user', details: resetError }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true, user: { id: existingUser.id, email } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Invite the user via Supabase Auth
    const { data: authData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { name }
    })

    if (inviteError) {
      // Fallback: If user is already registered in Auth but not in public.users
      const isAlreadyRegistered = inviteError.message?.includes('already been registered') || inviteError.status === 422;
      if (isAlreadyRegistered) {
        const { data: { users: authUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        const foundUser = authUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase())
        if (foundUser) {
          // Found the user in Auth! Now upsert into public.users
          const { error: dbError } = await supabaseAdmin.from('users').upsert({
            id: foundUser.id,
            email: email.toLowerCase(),
            name: name,
            role: role || 'tecnico',
            team_ids: team_ids || [],
            active: true,
            must_change_password: true,
            created_at: new Date().toISOString()
          })

          if (dbError) {
            console.error('DB Upsert Fallback Error:', dbError)
            return new Response(JSON.stringify({ success: false, error: 'Failed to save to public users table in fallback', details: dbError }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          // Trigger reset password email
          const origin = req.headers.get('Origin') || 'http://localhost:3000'
          const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
            redirectTo: origin
          })

          if (resetError) {
            console.error('Reset Password Fallback Error:', resetError)
            return new Response(JSON.stringify({ success: false, error: 'Failed to send password reset email in fallback', details: resetError }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          return new Response(JSON.stringify({ success: true, user: foundUser }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      console.error('Invite Error:', inviteError)
      return new Response(JSON.stringify({ success: false, error: 'Failed to invite user via Auth', details: inviteError }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Insert into the public users table
    const { error: dbError } = await supabaseAdmin.from('users').upsert({
      id: authData.user.id,
      email: email.toLowerCase(),
      name: name,
      role: role || 'tecnico',
      team_ids: team_ids || [],
      active: true,
      must_change_password: true,
      created_at: new Date().toISOString()
    })

    if (dbError) {
      console.error('DB Insert Error:', dbError)
      return new Response(JSON.stringify({ success: false, error: 'Failed to save to public users table', details: dbError }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, user: authData.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Catch Error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Internal Server Error', message: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
