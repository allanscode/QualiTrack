import { readFile, mkdir, writeFile, cp, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFile(path.join(root, relative), 'utf8');
// Explicit, reviewed source selection. Never replay apply_all_pending or demo seeds.
export const sources = [
  ['supabase/bootstrap/guard.sql'],
  ['supabase/migrations/20260520000000_initial_schema.sql', 'CREATE TABLE IF NOT EXISTS public.teams', '-- Seed: business hours'],
  ['supabase/bootstrap/core.sql'],
  ['supabase/migrations/20260803000001_form_teams.sql'],
  ['supabase/migrations/20260804000001_monitorias_missing_columns.sql'],
  ['supabase/migrations/20260804000002_view_suporte_novas_colunas.sql'],
  ['supabase/migrations/20260609000001_security_audit_rls.sql', 'CREATE POLICY "monitorias_select_policy"', '-- 4. Hardening'],
  ['supabase/migrations/20260821000001_helpdesk_submissions.sql'],
  ['supabase/migrations/20260825000002_ai_evaluation_guidelines.sql'],
  ['supabase/migrations/20260825000004_ai_guidelines_text_files.sql'],
  ['supabase/migrations/20260825000005_fix_ai_guidelines_read_rls.sql'],
  ['supabase/migrations/20260825000006_ai_evaluation_drafts.sql'],
  ['supabase/migrations/20260915000001_security_report_hardening.sql'],
  ['supabase/migrations/20260915000002_safe_auth_onboarding.sql'],
  ['supabase/migrations/20260813000001_clear_own_must_change_password_plpgsql.sql'],
  ['supabase/bootstrap/deadlines.sql'],
  ['supabase/migrations/20260616000001_realtime_publication.sql'],
  ['supabase/bootstrap/finalize.sql'],
];

export async function buildFreshSql() {
  const chunks = [];
  const manifest = [];
  for (const [file, start, end] of sources) {
    const original = (await read(file)).replace(/\r\n/g, '\n');
    let sql = original;
    if (start) {
      if (sql.split(start).length !== 2 || sql.split(end).length !== 2) throw new Error(`Source markers changed: ${file}`);
      const first = sql.indexOf(start), last = sql.indexOf(end);
      if (last <= first) throw new Error(`Invalid source range: ${file}`);
      sql = sql.slice(first, last);
    }
    // One outer transaction: nested COMMIT would defeat clean-install rollback.
    sql = sql.replace(/^(?:BEGIN|COMMIT);\s*$/gm, '');
    chunks.push(`-- SOURCE: ${file}\n${sql}`);
    manifest.push({ file, start, end, sha256: createHash('sha256').update(original).digest('hex') });
  }
  return { sql: `-- GENERATED. Fresh Supabase project ONLY. No demo users or business records.\nBEGIN;\n${chunks.join('\n')}\nCOMMIT;\n`, manifest };
}

async function prepare() {
  const output = path.join(root, '.supabase-fresh');
  const migrations = path.join(output, 'supabase', 'migrations');
  const filename = '20260915010000_clean_install.sql';
  const incrementalDir = path.join(root, 'supabase', 'fresh-migrations');
  const incremental = (await readdir(incrementalDir)).filter(name => name.endsWith('.sql')).sort();
  if (incremental.some(name => !/^\d{14}_[a-z0-9_]+\.sql$/.test(name) || name.slice(0,14) <= '20260915010000')) {
    throw new Error('Fresh incremental migration names must be timestamped after the clean baseline.');
  }
  await mkdir(migrations, { recursive: true });
  const unexpected = (await readdir(migrations)).filter(name => name !== filename && !incremental.includes(name));
  if (unexpected.length) throw new Error('Unexpected migrations in generated folder; refusing to overwrite a different migration chain.');
  const { sql, manifest } = await buildFreshSql();
  await writeFile(path.join(migrations, filename), sql);
  for (const name of incremental) await cp(path.join(incrementalDir,name),path.join(migrations,name));
  await writeFile(path.join(output, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(output, 'supabase', 'config.toml'), 'project_id = "qualitrack-clean-install"\n\n' + await read('supabase/config.toml'));
  await cp(path.join(root, 'supabase', 'functions'), path.join(output, 'supabase', 'functions'), { recursive: true });
  console.log(`Prepared ${output}\nNo database contacted. Read docs/supabase-clean-install.md before deployment.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepare();
}
