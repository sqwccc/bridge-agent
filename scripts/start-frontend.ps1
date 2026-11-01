param(
    [string]$PublicUrl = 'https://82mmnq755926.vicp.fun'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/LocalEnvironment.ps1"
$ParsedPublicUrl = $null
if (![Uri]::TryCreate($PublicUrl, [UriKind]::Absolute, [ref]$ParsedPublicUrl) -or $ParsedPublicUrl.Scheme -notin @('http', 'https')) {
    throw 'PublicUrl must be an absolute HTTP(S) URL.'
}
$env:BRIDGEMIND_PUBLIC_URL = $ParsedPublicUrl.GetLeftPart([UriPartial]::Authority)
Set-Location (Join-Path $ProjectRoot 'frontend')
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败' }
Write-Host 'Local frontend: http://127.0.0.1:5173'
Write-Host "Tunnel frontend: $env:BRIDGEMIND_PUBLIC_URL"
Write-Host 'Tunnel target: HTTP 127.0.0.1:5173; /api is proxied to the backend on port 8088.'
pnpm dev
if ($LASTEXITCODE -ne 0) { throw 'Frontend startup failed. Check whether port 5173 is already occupied.' }
