param([string]$Tag = '20261028-cce', [switch]$UseBuiltArtifacts)
$ErrorActionPreference = 'Stop'
if ($Tag -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$') { throw 'Invalid image tag' }
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Release = Join-Path $ProjectRoot "runtime/cce-release-$Tag"
$Context = Join-Path $ProjectRoot ("runtime/cce-build-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Release,$Context | Out-Null
if (-not $UseBuiltArtifacts) {
Push-Location (Join-Path $ProjectRoot 'backend')
try {
    & .\mvnw.cmd --batch-mode package
    if ($LASTEXITCODE -ne 0) { throw 'Backend build/tests failed' }
} finally { Pop-Location }
Push-Location (Join-Path $ProjectRoot 'frontend')
try {
    & pnpm.cmd install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed' }
    & pnpm.cmd build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
}
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'backend/target/bridgemind-server-1.0.0.jar') -Destination (Join-Path $Context 'application.jar')
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'frontend/dist') -Destination (Join-Path $Context 'html') -Recurse
foreach ($Name in @('Dockerfile','nginx.conf','entrypoint.sh')) {
    $Text = [IO.File]::ReadAllText((Join-Path $ProjectRoot "deploy/cce/$Name")).Replace("`r`n", "`n")
    [IO.File]::WriteAllText((Join-Path $Context $Name), $Text, [Text.UTF8Encoding]::new($false))
}
$Image = "bridgemind:$Tag"
$Archive = Join-Path $Release "bridgemind-$Tag-linux-amd64.tar"
& docker buildx build --platform linux/amd64 --provenance=false --sbom=false --tag $Image --load $Context
if ($LASTEXITCODE -ne 0) { throw 'Image build failed' }
& docker save --output $Archive $Image
if ($LASTEXITCODE -ne 0) { throw 'Image export failed' }
& docker load --input $Archive
if ($LASTEXITCODE -ne 0) { throw 'Image load verification failed' }
foreach ($Name in @('production.env.example','deployment.yaml','部署说明.txt')) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot "deploy/cce/$Name") -Destination $Release
}
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'deploy/cce/sql') -Destination $Release -Recurse -Force
$Hash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $Release 'SHA256SUMS.txt'), "$Hash  $([IO.Path]::GetFileName($Archive))`n")
Write-Host "Offline release: $Release"
