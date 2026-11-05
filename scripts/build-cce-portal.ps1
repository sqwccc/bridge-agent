param([Parameter(Mandatory=$true)][string]$Tag, [switch]$UseBuiltBackend)
$ErrorActionPreference = 'Stop'
if ($Tag -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$') { throw 'Invalid image tag' }
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Release = Join-Path $ProjectRoot "runtime/cce-release-$Tag"
if (Test-Path -LiteralPath $Release) { throw 'Release directory already exists; use a new tag' }
$Context = Join-Path $Release 'build'
New-Item -ItemType Directory -Force -Path $Context | Out-Null
if (-not $UseBuiltBackend) {
    Push-Location (Join-Path $ProjectRoot 'backend')
    try {
        & .\mvnw.cmd --batch-mode package
        if ($LASTEXITCODE -ne 0) { throw 'Backend build/tests failed' }
    } finally { Pop-Location }
}
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'backend/target/bridgemind-server-1.0.0.jar') -Destination (Join-Path $Context 'application.jar')
$PriorBase = $env:VITE_APP_BASE_PATH
$PriorApi = $env:VITE_API_BASE_URL
Push-Location (Join-Path $ProjectRoot 'frontend')
try {
    $env:VITE_APP_BASE_PATH = '/zntmh/ql/'
    $env:VITE_API_BASE_URL = '/zntmh/ql/api/v1/'
    & pnpm.cmd install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    & pnpm.cmd build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally {
    $env:VITE_APP_BASE_PATH = $PriorBase
    $env:VITE_API_BASE_URL = $PriorApi
    Pop-Location
}
$Html = Join-Path $Context 'html'
New-Item -ItemType Directory -Force -Path $Html | Out-Null
Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'frontend/dist') | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Html -Recurse -Force
}
$Dockerfile = @'
FROM bridgemind:20261028-cce-manualsql-p18089
USER root
RUN rm -rf /app/html && mkdir -p /app/html
COPY application.jar /app/application.jar
COPY html/ /app/html/
COPY nginx.conf /etc/nginx/nginx.conf
RUN sed -i 's|^SOURCE_DB_URL=.*|SOURCE_DB_URL=jdbc:postgresql://3.141.179.64:5432/qiaoliang_db?currentSchema=qiaoliang|' /app/production-defaults.env
USER 10001:10001
EXPOSE 18089
'@
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'deploy/cce/nginx.portal.conf') -Destination (Join-Path $Context 'nginx.conf') -Force
[IO.File]::WriteAllText((Join-Path $Context 'Dockerfile'), $Dockerfile.Replace("`r`n", "`n"), [Text.UTF8Encoding]::new($false))
& docker build --pull=false --platform linux/amd64 -t "bridgemind:$Tag" $Context
if ($LASTEXITCODE -ne 0) { throw 'Image build failed' }
$Archive = Join-Path $Release "bridgemind-$Tag-linux-amd64.tar"
& docker save --output $Archive "bridgemind:$Tag"
if ($LASTEXITCODE -ne 0) { throw 'Image export failed' }
$Hash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $Release 'SHA256SUMS.txt'), "$Hash  $([IO.Path]::GetFileName($Archive))`n")
Write-Host "Offline image: $Archive"
