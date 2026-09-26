const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN é obrigatório.');
const projectRef = "vpytvgpsqdapgouyjowc";

async function run() {
  // Query existing guidelines
  const checkResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: "SELECT id, title, file_name FROM public.ai_evaluation_guidelines WHERE active = true;"
    })
  });
  const checkData = await checkResp.json();
  console.log("Current guidelines:", checkData);

  // Update title and content to remove "Projeto DB-361"
  const updateQuery = `
    UPDATE public.ai_evaluation_guidelines
    SET 
      title = REPLACE(title, ' (Projeto DB-361)', ''),
      content = REPLACE(content, ' (Projeto DB-361)', '')
    WHERE title LIKE '%DB-361%' OR content LIKE '%DB-361%';
  `;

  const updateResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: updateQuery })
  });
  console.log("Update status:", updateResp.status);

  // Check again
  const verifyResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: "SELECT id, title, file_name FROM public.ai_evaluation_guidelines WHERE active = true;"
    })
  });
  const verifyData = await verifyResp.json();
  console.log("Updated guidelines:", verifyData);
}

run();
