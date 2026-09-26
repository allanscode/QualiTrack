<#
.SYNOPSIS
    Cria uma tarefa/subtarefa no Jira Cloud da Quality Automação.
.DESCRIPTION
    Utiliza a API REST v3 da Atlassian para criar o item dentro do projeto DB,
    atribuído ao usuário e vinculado à tarefa de sprint do QWP.
.EXAMPLE
    .\scripts\create-jira-task.ps1 -Email "seu-email@qualityautomacao.com.br" -ApiToken "seu_token" -ParentKey "DB-123"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Email = $env:JIRA_EMAIL,

    [Parameter(Mandatory=$false)]
    [string]$ApiToken = $env:JIRA_API_TOKEN,

    [Parameter(Mandatory=$false)]
    [string]$ParentKey = ""
)

if (-not $Email -or -not $ApiToken) {
    Write-Host "Para executar via API, forneça -Email e -ApiToken (gerado em https://id.atlassian.com/manage-profile/security/api-tokens)." -ForegroundColor Yellow
    Write-Host "Exemplo: .\scripts\create-jira-task.ps1 -Email 'usuario@qualityautomacao.com.br' -ApiToken '<token>' -ParentKey 'DB-XX'"
    exit 1
}

$domain = "qualityautomacao.atlassian.net"
$assigneeId = "712020:dd9b58e7-53c2-4960-b73f-0db07a984c1e"
$projectKey = "DB"

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Email}:${ApiToken}"))
$headers = @{
    "Authorization" = "Basic $base64Auth"
    "Content-Type"  = "application/json"
    "Accept"        = "application/json"
}

$summary = "[QWP] Reforço de RLS, Integridade de Monitorias e Automação de Ficha/Manual por Tags Zendesk"
$descriptionText = @"
h2. Escopo da Atividade (QWP > Sprint de Melhorias)

*Status:* Em Andamento
*Responsável:* Allan / Equipe QualidadeWP

h3. 1. Segurança & RLS (Supabase Free)
* Blindagem de UPDATE na tabela public.monitorias impedindo que atendentes adulterem notas ou respostas.
* Isolamento de anonimato do auditor para perfil suporte na view vw_monitorias_suporte.
* Validação de integridade de migração de contas provisórias (handle_new_user).

h3. 2. Infraestrutura & Domínio (Vercel)
* Configuração e mapeamento de CNAME / Punycode para subdomínio corporativo qwp-qualityautomacoes.com.br na Vercel (Hobby).
* SSL automático e verificação de limites do plano gratuito.

h3. 3. Automação Zendesk (Nova Sprint)
* Leitura das tags da organização no ticket do Zendesk (include=users,groups,organizations).
* Seleção automática de Ficha e Manual para 'Cliente Final'.
* Bloqueio em modo somente leitura (read-only) das opções ao clicar em 'Avaliar com IA'.
"@

# Estrutura Atlassian Document Format (ADF) para Jira Cloud v3
$bodyObj = @{
    fields = @{
        project = @{ key = $projectKey }
        summary = $summary
        description = @{
            type = "doc"
            version = 1
            content = @(
                @{
                    type = "paragraph"
                    content = @(
                        @{
                            type = "text"
                            text = $descriptionText
                        }
                    )
                }
            )
        }
        assignee = @{ id = $assigneeId }
    }
}

if ($ParentKey) {
    $bodyObj.fields["parent"] = @{ key = $ParentKey }
    $bodyObj.fields["issuetype"] = @{ name = "Sub-task" }
} else {
    $bodyObj.fields["issuetype"] = @{ name = "Task" }
}

$bodyJson = $bodyObj | ConvertTo-Json -Depth 10

Write-Host "Enviando requisição para https://$domain/rest/api/3/issue..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "https://$domain/rest/api/3/issue" -Method Post -Headers $headers -Body $bodyJson
    Write-Host "Tarefa criada com sucesso no Jira!" -ForegroundColor Green
    Write-Host "Chave: $($response.key)" -ForegroundColor Green
    Write-Host "URL: https://$domain/browse/$($response.key)" -ForegroundColor Green
} catch {
    Write-Host "Erro ao criar no Jira: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object IO.StreamReader($stream)
        Write-Host "Detalhe: $($reader.ReadToEnd())" -ForegroundColor Red
    }
}
