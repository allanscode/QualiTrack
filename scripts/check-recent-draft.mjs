const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN é obrigatório.');
const projectRef = "vpytvgpsqdapgouyjowc";

async function run() {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: "SELECT ticket_id, sanitized_dialogue FROM public.ai_evaluation_logs WHERE sanitized_dialogue ILIKE '%Script nao executado%' LIMIT 5;"
    })
  });
  const data = await resp.json();
  console.log("Found in logs:", data);
}

run();
