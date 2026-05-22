// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"

// TODO: Esta Edge Function é um placeholder e não está implementada.
// A criação de usuários é feita via `admin-invite-user` (convite com email).
// Se necessário, implementar aqui a criação direta de usuário sem convite.
// Caso contrário, esta função pode ser removida junto com sua entrada em supabase/config.toml.

Deno.serve(async (req) => {
  return new Response(
    JSON.stringify({ error: "Função não implementada. Use admin-invite-user para criar usuários." }),
    { headers: { "Content-Type": "application/json" }, status: 501 },
  )
})
