param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$ZendeskEnvPath,
  [string]$ManagementEnvPath = '.env.local',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
function Read-Settings([string]$Path) {
  $settings = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $settings[$matches[1]] = $matches[2].Trim('"').Trim("'")
    }
  }
  return $settings
}

$zendesk = Read-Settings $ZendeskEnvPath
$management = Read-Settings $ManagementEnvPath
foreach ($key in @('ZENDESK_EMAIL','ZENDESK_API_TOKEN','ZENDESK_SUBDOMAIN')) {
  if (-not $zendesk[$key]) { throw "Falta $key." }
}
if (-not $management.SUPABASE_ACCESS_TOKEN) { throw 'Falta SUPABASE_ACCESS_TOKEN.' }
if ($zendesk.ZENDESK_SUBDOMAIN -notmatch '^[a-z0-9-]+$') { throw 'Subdomínio inválido.' }
if ($ProjectRef -notmatch '^[a-z]{20}$') { throw 'Project ref inválido.' }

$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($zendesk.ZENDESK_EMAIL)/token:$($zendesk.ZENDESK_API_TOKEN)"))
$zendeskHeaders = @{ Authorization = "Basic $basic"; Accept = 'application/json' }
$base = "https://$($zendesk.ZENDESK_SUBDOMAIN).zendesk.com/api/v2/users.json"
$agents = @()
foreach ($role in @('agent','admin')) {
  $url = "$base`?role=$role&page[size]=100"
  $pages = 0
  do {
    if (-not $url.StartsWith($base, [StringComparison]::Ordinal)) { throw 'Cursor Zendesk inválido.' }
    $page = Invoke-RestMethod -Uri $url -Headers $zendeskHeaders -Method Get
    $agents += @($page.users | Where-Object { $_.role -in @('agent','admin') })
    $pages++
    if ($pages -gt 100) { throw 'Paginação Zendesk excedeu o limite seguro.' }
    $url = if ($page.meta.has_more) { $page.links.next } else { $null }
  } while ($url)
}

$records = @($agents | Where-Object { $_.email -and [string]$_.id -match '^[0-9]+$' } |
  ForEach-Object { [pscustomobject]@{
    external_id = [string]$_.id
    email = $_.email.Trim().ToLowerInvariant()
    name = [string]$_.name
  } })
if (@($records | Group-Object external_id | Where-Object Count -gt 1).Count -or
    @($records | Group-Object email | Where-Object Count -gt 1).Count) {
  throw 'Zendesk retornou IDs ou e-mails duplicados. Importação cancelada.'
}

$queryHeaders = @{ Authorization = "Bearer $($management.SUPABASE_ACCESS_TOKEN)"; 'Content-Type' = 'application/json' }
$queryUri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
function Query([string]$sql) {
  return Invoke-RestMethod -Uri $queryUri -Method Post -Headers $queryHeaders -Body (@{ query = $sql } | ConvertTo-Json -Compress -Depth 10)
}
$existing = Query 'SELECT id,email,source_system,external_id FROM public.users'
$byEmail = @{}
$byExternalId = @{}
foreach ($row in $existing) {
  $byEmail[$row.email.ToLowerInvariant()] = $row
  if ($row.source_system -eq 'zendesk' -and $row.external_id) { $byExternalId[$row.external_id] = $row }
}
$conflicts = 0
$new = 0
$linked = 0
foreach ($record in $records) {
  $emailRow = $byEmail[$record.email]
  $idRow = $byExternalId[$record.external_id]
  if (($emailRow -and $emailRow.source_system -and $emailRow.source_system -ne 'zendesk') -or
      ($emailRow -and $emailRow.external_id -and $emailRow.external_id -ne $record.external_id) -or
      ($idRow -and $idRow.email.ToLowerInvariant() -ne $record.email)) { $conflicts++; continue }
  if (-not $emailRow) { $new++ }
  elseif (-not $emailRow.external_id) { $linked++ }
}
Write-Output ([pscustomobject]@{ zendesk_total = $agents.Count; eligible = $records.Count;
  missing_email = $agents.Count - $records.Count; new_profiles = $new;
  existing_to_link = $linked; conflicts = $conflicts; applied = [bool]$Apply } | ConvertTo-Json -Compress)
if ($conflicts) { throw 'Há vínculos divergentes. Corrija-os antes de importar.' }
if (-not $Apply) { return }

$payload = ($records | ConvertTo-Json -Compress -Depth 4).Replace("'", "''")
$sql = @"
DO `$qwp`$
DECLARE agent record;
BEGIN
  FOR agent IN SELECT * FROM jsonb_to_recordset('$payload'::jsonb)
    AS x(external_id text, email text, name text)
  LOOP
    IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = agent.email) THEN
      UPDATE public.users u
      SET external_id = agent.external_id, source_system = 'zendesk'
      WHERE lower(u.email) = agent.email
        AND (u.source_system IS NULL OR u.source_system = 'zendesk')
        AND (u.external_id IS NULL OR u.external_id = agent.external_id);
      IF NOT FOUND THEN RAISE EXCEPTION 'Divergent existing agent mapping'; END IF;
    ELSE
      INSERT INTO public.users(id,email,name,role,active,must_change_password,
        external_id,source_system,is_provisional)
      VALUES (gen_random_uuid(),agent.email,agent.name,'suporte',true,false,
        agent.external_id,'zendesk',true);
    END IF;
  END LOOP;
END;
`$qwp`$;
"@
Query $sql | Out-Null
$verified = Query 'SELECT count(*)::int AS total FROM public.users WHERE source_system=''zendesk'' AND external_id IS NOT NULL'
Write-Output ([pscustomobject]@{ imported = $records.Count; linked_zendesk_profiles = $verified[0].total } | ConvertTo-Json -Compress)
