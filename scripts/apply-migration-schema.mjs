import fs from 'fs';
import path from 'path';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN é obrigatório.');
const projectRef = 'vpytvgpsqdapgouyjowc';

async function run() {
  const sqlPath = path.resolve('supabase/migrations/20260921000002_allow_quality_manage_config.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing migration 20260921000002_allow_quality_manage_config.sql...');

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  const text = await res.text();
  console.log('Execution result status:', res.status, text);

  // Registra no schema_migrations
  const regRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260921000002') ON CONFLICT DO NOTHING;"
    })
  });
  console.log('Migration registered status:', regRes.status);
}

run().catch(err => {
  console.error('Error applying migration:', err);
  process.exit(1);
});
