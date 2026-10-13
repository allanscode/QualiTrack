import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planPrimaryGroupLinks } from './team-primary-group-plan.mjs';

// Explicit project; dry-run unless --apply. No credentials are persisted or logged.
process.loadEnvFile('.env.local');
const project = process.argv.find(arg => arg.startsWith('--project-ref='))?.split('=')[1];
if (!project || !/^[a-z]{20}$/.test(project)) throw new Error('Use --project-ref=<project>');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('Missing management token');
async function api(path, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Management API ${response.status}`);
  return response.json();
}
const stateSql = `select jsonb_build_object(
  'teams',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.teams t),'[]'),
  'links',coalesce((select jsonb_agg(to_jsonb(t) order by team_id,group_id) from public.team_groups t),'[]'),
  'agents',coalesce((select jsonb_agg(to_jsonb(t) order by id) from
    (select id,name,primary_team_id from public.users where active and role='suporte') t),'[]')) as state`;
const [snapshot] = await api('database/query', { query: `select state,md5(state::text) as version from (${stateSql}) s` });
const keys = await api('api-keys?reveal=true');
const key = keys.find(key => key.type === 'secret' && key.name === 'default')?.api_key
  || keys.find(key => key.name === 'service_role')?.api_key;
if (!key) throw new Error('No server key');
const response = await fetch(`https://${project}.supabase.co/functions/v1/helpdesk-queue`, {
  method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'preview_webposto_memberships' }), signal: AbortSignal.timeout(120000),
});
if (!response.ok) throw new Error(`Zendesk audit ${response.status}`);
const audit = await response.json();
const plans = planPrimaryGroupLinks(snapshot.state, audit);
const changed = plans.filter(plan => plan.add.length || plan.remove.length || plan.groupBindings.length);
const directory = join(tmpdir(), `qwp-team-groups-${project}-${Date.now()}`);
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'before-and-plan.json'), JSON.stringify({ project, snapshot, audit, plans }, null, 2));
console.log(JSON.stringify({ backup: directory, teams: plans.map(({ team, agent_count, current, desired, add, remove, unresolved }) => ({
  team, agents: agent_count, before: current.length, after: unresolved.length ? current.length : desired.length,
  add: add.length, remove: remove.length, unresolved,
})) }, null, 2));
if (!process.argv.includes('--apply') || !changed.length) process.exit(0);
const uuid = value => {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw new Error('Invalid ID');
  return `'${value}'::uuid`;
};
const mutations = changed.flatMap(plan => [
  ...plan.groupBindings.map(group => {
    if (!Number.isSafeInteger(group.zendesk_group_id)) throw new Error('Invalid Zendesk ID');
    return `update public.teams set zendesk_group_id=${group.zendesk_group_id} where id=${uuid(group.id)} and zendesk_group_id is null;`;
  }),
  ...plan.remove.map(id => `delete from public.team_groups where team_id=${uuid(plan.team_id)} and group_id=${uuid(id)};`),
  ...plan.add.map(id => `insert into public.team_groups(team_id,group_id) values(${uuid(plan.team_id)},${uuid(id)}) on conflict(team_id,group_id) do nothing;`),
]).join('\n');
await api('database/query', { query: `begin;
set local lock_timeout='5s';
lock table public.users,public.teams,public.team_groups in share row exclusive mode;
do $guard$ begin
  if (select md5(state::text) from (${stateSql}) s) <> '${snapshot.version}' then
    raise exception 'Roster or links changed since audit; run again';
  end if;
end $guard$;
${mutations}
commit;` });
const [after] = await api('database/query', { query: stateSql });
await writeFile(join(directory, 'after.json'), JSON.stringify(after.state, null, 2));
for (const plan of changed) {
  const actual = after.state.links.filter(link => link.team_id === plan.team_id).map(link => link.group_id).sort();
  if (JSON.stringify(actual) !== JSON.stringify(plan.desired)) throw new Error(`Post-apply mismatch: ${plan.team}`);
}
console.log(`Verified ${changed.length} teams; user ownership and monitorias unchanged.`);
